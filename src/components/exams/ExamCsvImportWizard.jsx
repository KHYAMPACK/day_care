import { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';
import { recordSchoolActivity } from '../../lib/activityLog';
import {
  loadQuestionsForAnswerKey,
  saveAnswerKeyWithQuestions,
} from '../../lib/examAnalysis';
import {
  downloadAnswerKeyTemplate,
  parseAnswerKeyCsv,
} from '../../lib/examAnswerKeyImport';
import {
  downloadOptikTemplate,
  matchOptikEntriesToStudents,
  parseOptikExamCsv,
  saveOptikImport,
} from '../../lib/examOptikImport';
import { InlineError, SuccessMessage } from '../dashboardUi';
import AnswerKeyReviewGrid from './AnswerKeyReviewGrid';
import KonuEslestirmeDialog from './KonuEslestirmeDialog';
import OgrenciImportOnayDialog from './OgrenciImportOnayDialog';
import {
  findUnknownKonuFromQuestions,
  loadExamKonuContext,
  resolveAudienceGrades,
  saveKonuMappingBatch,
} from '../../lib/examKonuMapping';

const WIZARD_STEPS = [
  { id: 'upload-key', label: 'Cevap anahtarı' },
  { id: 'review-key', label: 'Anahtar onayı' },
  { id: 'upload-students', label: 'Öğrenci cevapları' },
  { id: 'review-students', label: 'Öğrenci onayı' },
];

function resolveInitialStep(answerKeyId) {
  return answerKeyId ? 'upload-students' : 'upload-key';
}

function stepIndex(stepId) {
  return WIZARD_STEPS.findIndex((step) => step.id === stepId);
}

function WizardStepIndicator({ currentStep, answerKeyId, complete, studentDialogOpen }) {
  const displayStep = studentDialogOpen ? 'review-students' : currentStep;
  const currentIndex = stepIndex(displayStep);

  return (
    <ol className="exam-import-wizard__steps" aria-label="Import adımları">
      {WIZARD_STEPS.map((step, index) => {
        let status = 'upcoming';
        if (complete) status = 'done';
        else if (index < currentIndex) status = 'done';
        else if (index === currentIndex) status = 'active';
        else if (step.id === 'upload-students' || step.id === 'review-students') {
          if (!answerKeyId && index > 1) status = 'disabled';
        }

        return (
          <li
            key={step.id}
            className={`exam-import-wizard__step exam-import-wizard__step--${status}`}
            aria-current={status === 'active' ? 'step' : undefined}
          >
            <span className="exam-import-wizard__step-index">{index + 1}</span>
            <span className="exam-import-wizard__step-label">{step.label}</span>
          </li>
        );
      })}
    </ol>
  );
}

export default function ExamCsvImportWizard({
  session,
  schoolId,
  students = [],
  answerKeyId,
  onAnswerKeySaved,
  onResultsSaved,
  onNavigateToResults,
  onNavigateToAnalysis,
}) {
  const { profile } = useAuth();
  const [step, setStep] = useState(() => resolveInitialStep(answerKeyId));
  const [complete, setComplete] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [saving, setSaving] = useState(false);

  const [draftQuestions, setDraftQuestions] = useState([]);
  const [draftWarnings, setDraftWarnings] = useState([]);
  const [savedQuestions, setSavedQuestions] = useState([]);
  const [studentPreview, setStudentPreview] = useState([]);
  const [questionCount, setQuestionCount] = useState(0);
  const [studentFilter, setStudentFilter] = useState('all');
  const [expandedRows, setExpandedRows] = useState(() => new Set());
  const [localAnswerKeyId, setLocalAnswerKeyId] = useState(null);
  const [konuDialogOpen, setKonuDialogOpen] = useState(false);
  const [studentDialogOpen, setStudentDialogOpen] = useState(false);
  const [unknownKonu, setUnknownKonu] = useState([]);
  const [konuContext, setKonuContext] = useState(null);
  const audienceGrades = useMemo(() => resolveAudienceGrades(session), [session]);

  const activeAnswerKeyId = answerKeyId ?? localAnswerKeyId;

  useEffect(() => {
    setStep(resolveInitialStep(activeAnswerKeyId));
    setComplete(false);
    setError(null);
    setSuccess(null);
    setDraftQuestions([]);
    setDraftWarnings([]);
    setStudentPreview([]);
    setExpandedRows(new Set());
    setLocalAnswerKeyId(null);
    setStudentDialogOpen(false);
  }, [session.id]);

  useEffect(() => {
    if (!activeAnswerKeyId) {
      setSavedQuestions([]);
      return;
    }
    (async () => {
      try {
        const rows = await loadQuestionsForAnswerKey(activeAnswerKeyId);
        setSavedQuestions(rows);
      } catch (loadError) {
        setError(loadError);
      }
    })();
  }, [activeAnswerKeyId]);

  const reviewQuestions = savedQuestions.length ? savedQuestions : draftQuestions;

  const matchedCount = studentPreview.filter((row) => row.student_id).length;

  function patchDraftQuestion(index, field, value) {
    setDraftQuestions((current) =>
      current.map((row) =>
        row.question_index === index ? { ...row, [field]: value.toUpperCase?.() ?? value } : row
      )
    );
  }

  async function handleAnswerKeyFile(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    setError(null);
    setSuccess(null);
    try {
      const text = await file.text();
      const parsed = parseAnswerKeyCsv(text);
      setDraftQuestions(parsed.questions);
      setDraftWarnings(parsed.warnings);
      setStep('review-key');
    } catch (fileError) {
      setError(fileError);
    }
  }

  async function persistAnswerKey() {
    const keyRow = await saveAnswerKeyWithQuestions({
      schoolId,
      sessionId: session.id,
      title: session.title || 'Cevap anahtarı',
      questions: draftQuestions,
    });
    setLocalAnswerKeyId(keyRow.id);
    recordSchoolActivity(supabase, profile, {
      schoolId,
      category: 'exam',
      action: 'saved',
      summary: `Cevap anahtarı: ${session.title ?? 'Deneme'} · ${draftQuestions.length} soru`,
    });
    setSuccess('Cevap anahtarı kaydedildi. Şimdi öğrenci cevaplarını yükleyin.');
    setDraftWarnings([]);
    await onAnswerKeySaved?.();
    setStep('upload-students');
  }

  async function handleConfirmAnswerKey() {
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const validQuestions = draftQuestions.filter((row) => row.correct_choice);
      if (!validQuestions.length) {
        throw new Error('Kaydetmek için en az bir geçerli cevap şıkkı gerekli.');
      }

      const context = await loadExamKonuContext(schoolId, audienceGrades);
      const unknown = findUnknownKonuFromQuestions({
        questions: draftQuestions,
        units: context.allUnits,
        mappingLookup: context.mappingLookup,
      });

      if (unknown.length) {
        setKonuContext(context);
        setUnknownKonu(unknown);
        setKonuDialogOpen(true);
        return;
      }

      await persistAnswerKey();
    } catch (saveError) {
      setError(saveError);
    } finally {
      setSaving(false);
    }
  }

  async function handleKonuDialogConfirm(decisions) {
    if (!konuContext) return;
    setSaving(true);
    setError(null);
    try {
      await saveKonuMappingBatch({
        schoolId,
        grades: audienceGrades,
        decisions,
        units: konuContext.allUnits,
        subjects: konuContext.subjects,
        createdBy: profile?.id ?? null,
      });
      setKonuDialogOpen(false);
      setUnknownKonu([]);
      await persistAnswerKey();
    } catch (saveError) {
      setError(saveError);
    } finally {
      setSaving(false);
    }
  }

  async function handleStudentFile(event) {
    const file = event.target.files?.[0];
    if (!file || !activeAnswerKeyId) return;
    setError(null);
    setSuccess(null);
    try {
      const text = await file.text();
      const parsed = parseOptikExamCsv(text);
      const matched = matchOptikEntriesToStudents(parsed.entries, students);
      setStudentPreview(matched);
      setQuestionCount(parsed.questionHeaders.length);
      setExpandedRows(new Set());
      setStudentFilter('all');
      setStudentDialogOpen(true);
    } catch (fileError) {
      setError(fileError);
      setStudentPreview([]);
    }
  }

  function handleAssignStudent(rowKey, studentId) {
    setStudentPreview((current) =>
      current.map((row) => {
        const key = row.rowNumber ?? row.student_number ?? row.studentName ?? 'row';
        if (key !== rowKey) return row;
        const student = students.find((item) => item.id === studentId);
        return {
          ...row,
          student_id: studentId,
          studentName: student?.full_name ?? row.studentName,
          student_number: student?.student_number ?? row.student_number,
        };
      })
    );
  }

  function handleToggleRow(rowKey, isOpen) {
    setExpandedRows((current) => {
      const next = new Set(current);
      if (isOpen) next.add(rowKey);
      else next.delete(rowKey);
      return next;
    });
  }

  async function handleConfirmStudentImport() {
    if (!activeAnswerKeyId) return;
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const questions = savedQuestions.length
        ? savedQuestions
        : await loadQuestionsForAnswerKey(activeAnswerKeyId);
      const matchedEntries = studentPreview.filter((row) => row.student_id);
      if (!matchedEntries.length) {
        throw new Error('İçe aktarmak için en az bir eşleşen öğrenci gerekli.');
      }
      const result = await saveOptikImport({
        sessionId: session.id,
        answerKeyId: activeAnswerKeyId,
        questions,
        matchedEntries,
      });
      recordSchoolActivity(supabase, profile, {
        schoolId,
        category: 'exam',
        action: 'saved',
        summary: `CSV import: ${session.title ?? 'Deneme'} · ${result.studentCount} öğrenci`,
      });
      setSuccess(
        `${result.studentCount} öğrenci, ${result.answerCount} cevap içe aktarıldı.`
      );
      setStudentPreview([]);
      setComplete(true);
      setStep('upload-students');
      setStudentDialogOpen(false);
      onResultsSaved?.();
    } catch (importError) {
      setError(importError);
    } finally {
      setSaving(false);
    }
  }

  function restartAnswerKey() {
    setStep('upload-key');
    setDraftQuestions([]);
    setDraftWarnings([]);
    setComplete(false);
    setSuccess(null);
    setError(null);
  }

  return (
    <div className="exam-import-wizard">
      <KonuEslestirmeDialog
        open={konuDialogOpen}
        unknownItems={unknownKonu}
        units={konuContext?.allUnits ?? []}
        grades={audienceGrades}
        saving={saving}
        onCancel={() => {
          if (saving) return;
          setKonuDialogOpen(false);
        }}
        onConfirm={handleKonuDialogConfirm}
      />

      <OgrenciImportOnayDialog
        open={studentDialogOpen}
        studentPreview={studentPreview}
        questions={reviewQuestions}
        students={students}
        questionCount={questionCount}
        studentFilter={studentFilter}
        onStudentFilterChange={setStudentFilter}
        expandedRows={expandedRows}
        onToggleRow={handleToggleRow}
        onAssignStudent={handleAssignStudent}
        saving={saving}
        onCancel={() => {
          if (saving) return;
          setStudentDialogOpen(false);
        }}
        onConfirm={handleConfirmStudentImport}
      />

      <WizardStepIndicator
        currentStep={step}
        answerKeyId={activeAnswerKeyId}
        complete={complete}
        studentDialogOpen={studentDialogOpen}
      />

      {error ? <InlineError error={error} context="calendar" /> : null}
      {success ? <SuccessMessage message={success} /> : null}

      {complete ? (
        <div className="exam-import-wizard__step-panel exam-import-wizard__complete">
          <h3 className="exam-workspace-block__title">Import tamamlandı</h3>
          <p className="dash-hint">Sonuçlar kaydedildi. Sıralama ve analiz sekmelerinden inceleyebilirsiniz.</p>
          <div className="exam-import-wizard__actions">
            <button type="button" className="demo-btn demo-btn--primary" onClick={onNavigateToResults}>
              Sonuçları gör
            </button>
            <button type="button" className="demo-btn" onClick={onNavigateToAnalysis}>
              Analize git
            </button>
            <button type="button" className="demo-btn demo-btn--ghost" onClick={() => { setComplete(false); setStep('upload-students'); }}>
              Yeniden import
            </button>
          </div>
        </div>
      ) : null}

      {!complete && step === 'upload-key' ? (
        <div className="exam-import-wizard__step-panel">
          <h3 className="exam-workspace-block__title">1. Cevap anahtarı CSV</h3>
          <p className="dash-hint">
            Önce yayınevi cevap anahtarı dosyasını yükleyin. Sütunlar: question_index, subject_code,
            correct_choice, topic_label (veya Türkçe karşılıkları).
          </p>
          <div className="exam-import-wizard__actions">
            <button type="button" className="demo-btn demo-btn--ghost" onClick={downloadAnswerKeyTemplate}>
              Şablon indir
            </button>
          </div>
          <label className="dash-label">
            Cevap anahtarı CSV
            <input className="dash-input" type="file" accept=".csv,text/csv" onChange={handleAnswerKeyFile} />
          </label>
        </div>
      ) : null}

      {!complete && step === 'review-key' ? (
        <div className="exam-import-wizard__step-panel">
          <h3 className="exam-workspace-block__title">2. Cevap anahtarını onayla</h3>
          <p className="dash-hint">
            {draftQuestions.length} soru
            {draftWarnings.length ? ` · ${draftWarnings.length} uyarı` : ''}
            {' · '}
            Konu etiketleri kayıttan önce müfredat ünitelerine bağlanır.
          </p>
          {draftWarnings.length ? (
            <ul className="exam-import-wizard__warnings">
              {draftWarnings.slice(0, 8).map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
              {draftWarnings.length > 8 ? (
                <li>… ve {draftWarnings.length - 8} uyarı daha</li>
              ) : null}
            </ul>
          ) : null}
          <AnswerKeyReviewGrid questions={draftQuestions} onPatch={patchDraftQuestion} />
          <div className="exam-import-wizard__actions">
            <button type="button" className="demo-btn demo-btn--ghost" onClick={() => setStep('upload-key')}>
              Geri
            </button>
            <button
              type="button"
              className="demo-btn demo-btn--primary"
              disabled={saving}
              onClick={handleConfirmAnswerKey}
            >
              {saving ? 'Kaydediliyor…' : 'Onayla ve kaydet'}
            </button>
          </div>
        </div>
      ) : null}

      {!complete && step === 'upload-students' ? (
        <div className="exam-import-wizard__step-panel">
          <h3 className="exam-workspace-block__title">3. Öğrenci cevapları CSV</h3>
          {!activeAnswerKeyId ? (
            <p className="dash-hint">Öğrenci cevaplarını yüklemeden önce cevap anahtarını kaydedin.</p>
          ) : (
            <>
              <p className="dash-hint">
                Optik format: okul_no, ad_soyad, s1…s{reviewQuestions.length || 90}. Yükledikten sonra
                öğrenci listesini onaylayacaksınız.
              </p>
              <div className="exam-import-wizard__actions">
                <button type="button" className="demo-btn demo-btn--ghost" onClick={downloadOptikTemplate}>
                  Şablon indir
                </button>
                <button type="button" className="demo-btn demo-btn--ghost" onClick={restartAnswerKey}>
                  Cevap anahtarını yeniden yükle
                </button>
              </div>
              <label className="dash-label">
                Öğrenci cevapları CSV
                <input className="dash-input" type="file" accept=".csv,text/csv" onChange={handleStudentFile} />
              </label>
              {studentPreview.length && !studentDialogOpen ? (
                <div className="exam-import-wizard__actions">
                  <button
                    type="button"
                    className="demo-btn demo-btn--primary"
                    onClick={() => setStudentDialogOpen(true)}
                  >
                    Öğrenci eşleştirmesini aç ({matchedCount}/{studentPreview.length})
                  </button>
                </div>
              ) : null}
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
