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
  previewOptikEntryStats,
  saveOptikImport,
} from '../../lib/examOptikImport';
import { InlineError, SuccessMessage } from '../dashboardUi';
import AnswerKeyReviewGrid from './AnswerKeyReviewGrid';
import KonuEslestirmeDialog from './KonuEslestirmeDialog';
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

function WizardStepIndicator({ currentStep, answerKeyId, complete }) {
  const currentIndex = stepIndex(currentStep);

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

function StudentReviewRow({ row, questions, students, onAssignStudent, expanded, onToggle }) {
  const stats = useMemo(() => previewOptikEntryStats(row, questions), [row, questions]);
  const matched = Boolean(row.student_id);
  const rowKey = row.rowNumber ?? row.student_number ?? row.studentName ?? 'row';

  return (
    <details
      className={`exam-workspace-section exam-student-review__row${expanded ? ' exam-student-review__row--open' : ''}`}
      open={expanded}
      onToggle={(event) => onToggle(rowKey, event.currentTarget.open)}
    >
      <summary className="exam-workspace-section__summary exam-student-review__summary">
        <span className="exam-workspace-section__title">{row.studentName || row.student_number || '—'}</span>
        <span className="exam-student-review__meta">
          {row.student_number ? <span className="dash-hint">No {row.student_number}</span> : null}
          <span className={`exam-student-review__badge${matched ? ' exam-student-review__badge--ok' : ' exam-student-review__badge--warn'}`}>
            {matched ? 'Eşleşti' : 'Eşleşmedi'}
          </span>
          {matched ? (
            <span className="dash-hint">
              Net {stats.totalNet.toFixed(2)} · D {stats.totalCorrect} / Y {stats.totalWrong} / B {stats.totalBlank}
            </span>
          ) : null}
        </span>
      </summary>
      <div className="exam-workspace-section__body">
        {!matched ? (
          <label className="dash-label">
            Öğrenci eşleştir
            <select
              className="dash-input"
              value={row.student_id ?? ''}
              onChange={(event) => onAssignStudent(rowKey, event.target.value || null)}
            >
              <option value="">Seçin…</option>
              {students.map((student) => (
                <option key={student.id} value={student.id}>
                  {student.full_name}
                  {student.student_number ? ` · ${student.student_number}` : ''}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        <div className="exam-student-review__subjects">
          {stats.subjects
            .filter((subject) => subject.correct + subject.wrong + subject.blank > 0)
            .map((subject) => (
              <span key={subject.subject_code} className="exam-student-review__subject-chip">
                {subject.shortLabel}: {subject.net.toFixed(1)} net
              </span>
            ))}
        </div>

        <div className="exam-grid-wrap">
          <table className="exam-entry-grid exam-student-review__grid">
            <thead>
              <tr>
                <th>#</th>
                <th>CVP</th>
                <th>Öğr.</th>
                <th>Durum</th>
              </tr>
            </thead>
            <tbody>
              {(questions ?? []).map((question) => {
                const choice = row.choices?.[question.question_index] ?? '';
                let status = 'blank';
                if (choice) {
                  status = choice === question.correct_choice ? 'correct' : 'wrong';
                }
                return (
                  <tr key={question.question_index} className={`exam-student-review__choice exam-student-review__choice--${status}`}>
                    <td>{question.question_index}</td>
                    <td>{question.correct_choice ?? '—'}</td>
                    <td>{choice || '—'}</td>
                    <td>{status === 'correct' ? 'D' : status === 'wrong' ? 'Y' : 'B'}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </details>
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
  const unmatchedCount = studentPreview.length - matchedCount;

  const filteredPreview = useMemo(() => {
    if (studentFilter === 'matched') {
      return studentPreview.filter((row) => row.student_id);
    }
    if (studentFilter === 'issues') {
      return studentPreview.filter((row) => !row.student_id);
    }
    return studentPreview;
  }, [studentPreview, studentFilter]);

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
      setStep('review-students');
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

      <WizardStepIndicator currentStep={step} answerKeyId={activeAnswerKeyId} complete={complete} />

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
            </>
          )}
        </div>
      ) : null}

      {!complete && step === 'review-students' ? (
        <div className="exam-import-wizard__step-panel">
          <h3 className="exam-workspace-block__title">4. Öğrenci cevaplarını onayla</h3>
          <p className="dash-hint">
            {questionCount} soru sütunu · {matchedCount} eşleşen
            {unmatchedCount ? ` · ${unmatchedCount} eşleşmeyen` : ''}
          </p>

          <div className="exam-student-review__filters" role="group" aria-label="Öğrenci filtresi">
            {[
              { id: 'all', label: 'Tümü' },
              { id: 'matched', label: 'Eşleşenler' },
              { id: 'issues', label: 'Sorunlu' },
            ].map((item) => (
              <button
                key={item.id}
                type="button"
                className={`cur-assign-chip${studentFilter === item.id ? ' cur-assign-chip--active' : ''}`}
                onClick={() => setStudentFilter(item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>

          <div className="exam-student-review">
            {filteredPreview.map((row) => {
              const rowKey = row.rowNumber ?? row.student_number ?? row.studentName ?? 'row';
              return (
                <StudentReviewRow
                  key={rowKey}
                  row={row}
                  questions={reviewQuestions}
                  students={students}
                  onAssignStudent={handleAssignStudent}
                  expanded={expandedRows.has(rowKey)}
                  onToggle={handleToggleRow}
                />
              );
            })}
          </div>

          <div className="exam-import-wizard__actions">
            <button type="button" className="demo-btn demo-btn--ghost" onClick={() => setStep('upload-students')}>
              Geri
            </button>
            <button
              type="button"
              className="demo-btn demo-btn--primary"
              disabled={saving || matchedCount === 0}
              onClick={handleConfirmStudentImport}
            >
              {saving ? 'Aktarılıyor…' : `${matchedCount} öğrenciyi onayla ve içe aktar`}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
