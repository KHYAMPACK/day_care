import { useState } from 'react';
import { useAuth } from '../../context/AuthContext';
import { supabase } from '../../lib/supabase';
import { recordSchoolActivity } from '../../lib/activityLog';
import {
  entriesToSavePayload,
  mapCsvRowToEntry,
  matchStudentsToCsvEntries,
  parseGenericExamCsv,
} from '../../lib/examImport';
import { saveClassExamEntry } from '../../lib/lgsExam';
import { InlineError, SuccessMessage } from '../dashboardUi';

export default function DirectorExamImport({
  schoolId,
  sessionId,
  sessionTitle = '',
  students = [],
  embedded = false,
  hideTitle = false,
}) {
  const { profile } = useAuth();
  const [template, setTemplate] = useState('generic');
  const [preview, setPreview] = useState([]);
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
      const { rows } = parseGenericExamCsv(text);
      const entries = rows.map(mapCsvRowToEntry);
      const matched = matchStudentsToCsvEntries(entries, students);
      setPreview(matched);
    } catch (fileError) {
      setError(fileError);
    }
  }

  async function handleImport() {
    if (!sessionId) return;
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const payload = entriesToSavePayload(preview, 'detailed').map((entry) => ({
        student_id: entry.student_id,
        subjects: entry.subjects,
        totalNet: entry.totalNet,
      }));
      await saveClassExamEntry({ sessionId, entries: payload, mode: 'detailed' });
      recordSchoolActivity(supabase, profile, {
        schoolId,
        category: 'exam',
        action: 'saved',
        summary: sessionTitle
          ? `Sınav sonuçları içe aktarıldı: ${sessionTitle} · ${payload.length} öğrenci`
          : `Sınav sonuçları içe aktarıldı: ${payload.length} öğrenci`,
      });
      setSuccess(`${payload.length} öğrenci sonucu içe aktarıldı.`);
      setPreview([]);
    } catch (importError) {
      setError(importError);
    } finally {
      setSaving(false);
    }
  }

  const shellClass = embedded ? 'exam-workspace-block' : 'dash-card';

  return (
    <div className={shellClass}>
      {embedded && !hideTitle ? (
        <h3 className="exam-workspace-block__title">CSV import</h3>
      ) : null}
      {!embedded ? <h2 className="dash-section-title">CSV sonuç import</h2> : null}
      <p className="dash-hint">
        Generic CSV: student_name veya okul_no + ders netleri. Atlas/Limit parser örnek klasör gelince eklenecek.
      </p>
      {error && <InlineError error={error} context="calendar" />}
      {success && <SuccessMessage message={success} />}

      {!sessionId ? (
        <p className="dash-hint">Import için önce bir sınav oturumu seçin.</p>
      ) : (
        <>
          <label className="dash-label">
            Şablon
            <select className="dash-input" value={template} onChange={(e) => setTemplate(e.target.value)}>
              <option value="generic">Generic CSV</option>
              <option value="atlas" disabled>
                Atlas (yakında)
              </option>
            </select>
          </label>
          <label className="dash-label">
            CSV dosyası
            <input className="dash-input" type="file" accept=".csv,text/csv" onChange={handleFile} />
          </label>

          {preview.length ? (
            <>
              <table className="exam-ranking-table">
                <thead>
                  <tr>
                    <th>CSV ad</th>
                    <th>Eşleşme</th>
                    <th>Öğrenci</th>
                  </tr>
                </thead>
                <tbody>
                  {preview.map((row, index) => (
                    <tr key={`${row.studentName}-${index}`}>
                      <td>{row.studentName || row.studentNumber}</td>
                      <td>{row.matchStatus}</td>
                      <td>{row.matchedStudent?.full_name ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <button type="button" className="dash-send-btn" disabled={saving} onClick={handleImport}>
                {saving ? 'Aktarılıyor…' : 'Eşleşenleri kaydet'}
              </button>
            </>
          ) : null}
        </>
      )}
    </div>
  );
}
