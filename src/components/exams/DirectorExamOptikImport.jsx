import { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';
import { recordSchoolActivity } from '../../lib/activityLog';
import { loadQuestionsForAnswerKey } from '../../lib/examAnalysis';
import {
  downloadOptikTemplate,
  matchOptikEntriesToStudents,
  parseOptikExamCsv,
  saveOptikImport,
} from '../../lib/examOptikImport';
import { InlineError, SuccessMessage } from '../dashboardUi';

export default function DirectorExamOptikImport({
  schoolId,
  sessionId,
  sessionTitle = '',
  answerKeyId,
  students = [],
  embedded = false,
  hideTitle = false,
  onImported,
}) {
  const { profile } = useAuth();
  const [preview, setPreview] = useState([]);
  const [questionCount, setQuestionCount] = useState(0);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [saving, setSaving] = useState(false);

  async function handleFile(event) {
    const file = event.target.files?.[0];
    if (!file || !sessionId) return;
    setError(null);
    setSuccess(null);
    try {
      const text = await file.text();
      const parsed = parseOptikExamCsv(text);
      const matched = matchOptikEntriesToStudents(parsed.entries, students);
      setPreview(matched);
      setQuestionCount(parsed.questionHeaders.length);
    } catch (fileError) {
      setError(fileError);
      setPreview([]);
    }
  }

  async function handleImport() {
    if (!sessionId || !answerKeyId) return;
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const questions = await loadQuestionsForAnswerKey(answerKeyId);
      const result = await saveOptikImport({
        sessionId,
        answerKeyId,
        questions,
        matchedEntries: preview.filter((row) => row.student_id),
      });
      recordSchoolActivity(supabase, profile, {
        schoolId,
        category: 'exam',
        action: 'saved',
        summary: sessionTitle
          ? `Optik import: ${sessionTitle} · ${result.studentCount} öğrenci`
          : `Optik import: ${result.studentCount} öğrenci`,
      });
      setSuccess(
        `${result.studentCount} öğrenci, ${result.answerCount} cevap içe aktarıldı. Sıralama güncellendi.`
      );
      setPreview([]);
      onImported?.();
    } catch (importError) {
      setError(importError);
    } finally {
      setSaving(false);
    }
  }

  const matchedCount = preview.filter((row) => row.student_id).length;
  const unmatchedCount = preview.length - matchedCount;
  const shellClass = embedded ? 'exam-workspace-block' : 'dash-card';

  return (
    <div className={shellClass}>
      {embedded && !hideTitle ? (
        <h3 className="exam-workspace-block__title">Optik import</h3>
      ) : null}
      {!embedded ? <h2 className="dash-section-title">Optik sonuç import</h2> : null}

      <p className="dash-hint">
        Tam optik: okul no + soru cevapları (s1…s90 veya 1…90). Önce cevap anahtarı yüklenmeli.
        Yayınevi formatını daha sonra özelleştireceğiz.
      </p>

      {error && <InlineError error={error} context="calendar" />}
      {success && <SuccessMessage message={success} />}

      {!sessionId ? (
        <p className="dash-hint">Import için önce bir deneme oturumu seçin.</p>
      ) : !answerKeyId ? (
        <p className="dash-hint">Optik import için önce cevap anahtarı sekmesinden anahtar yükleyin ve oturuma bağlayın.</p>
      ) : (
        <>
          <div className="exam-optik-actions">
            <button type="button" className="demo-btn demo-btn--ghost" onClick={downloadOptikTemplate}>
              Şablon indir
            </button>
          </div>

          <label className="dash-label">
            Optik CSV
            <input className="dash-input" type="file" accept=".csv,text/csv" onChange={handleFile} />
          </label>

          {preview.length > 0 ? (
            <>
              <p className="dash-hint">
                {questionCount} soru sütunu · {matchedCount} eşleşen
                {unmatchedCount ? ` · ${unmatchedCount} eşleşmeyen` : ''}
              </p>
              <ul className="exam-list exam-list--compact">
                {preview.slice(0, 12).map((row) => (
                  <li key={row.rowNumber ?? row.student_number ?? row.studentName}>
                    <strong>{row.studentName || row.student_number || '—'}</strong>
                    <span className="dash-hint">
                      {row.student_id ? 'Eşleşti' : 'Eşleşmedi'}
                      {row.student_number ? ` · ${row.student_number}` : ''}
                    </span>
                  </li>
                ))}
              </ul>
              {preview.length > 12 ? (
                <p className="dash-hint">… ve {preview.length - 12} satır daha</p>
              ) : null}
              <button
                type="button"
                className="demo-btn demo-btn--primary"
                disabled={saving || matchedCount === 0}
                onClick={handleImport}
              >
                {saving ? 'Aktarılıyor…' : `${matchedCount} öğrenciyi içe aktar`}
              </button>
            </>
          ) : null}
        </>
      )}
    </div>
  );
}
