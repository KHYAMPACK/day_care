import { Fragment, useEffect, useMemo, useState } from 'react';
import { resolveExamConfig } from '../../lib/examConfig';
import {
  LGS_SUBJECTS,
  computeNet,
  emptySubjectRow,
  groupSubjectResultsByStudent,
  loadSubjectResults,
  saveClassExamEntry,
} from '../../lib/lgsExam';
import { InlineError, SendButton, SuccessMessage } from '../dashboardUi';

function initDetailedEntry(studentId, existingRows) {
  const bySubject = {};
  for (const subject of LGS_SUBJECTS) {
    const row = existingRows?.find((r) => r.subject_code === subject.code);
    bySubject[subject.code] = row
      ? {
          correct_count: row.correct_count ?? '',
          wrong_count: row.wrong_count ?? '',
          blank_count: row.blank_count ?? '',
          net: row.net ?? '',
        }
      : emptySubjectRow(subject.code);
  }
  return { student_id: studentId, subjects: bySubject, totalNet: '' };
}

function rowTotalNet(entry) {
  let sum = 0;
  let has = false;
  for (const subject of LGS_SUBJECTS) {
    const cell = entry.subjects?.[subject.code];
    if (!cell) continue;
    if (cell.net !== '' && cell.net != null) {
      sum += Number(cell.net) || 0;
      has = true;
      continue;
    }
    const c = Number(cell.correct_count) || 0;
    const w = Number(cell.wrong_count) || 0;
    if (c || w || cell.blank_count) {
      sum += computeNet(c, w);
      has = true;
    }
  }
  return has ? Math.round(sum * 100) / 100 : '';
}

export default function ExamManualEntry({
  school,
  students = [],
  sessionId,
  sessionTitle,
  onSaved,
  embedded = false,
  hideTitle = false,
}) {
  const config = resolveExamConfig(school);
  const shellClass = embedded ? 'exam-workspace-block' : 'dash-card';
  const [mode, setMode] = useState(config.detailedEntry ? 'detailed' : 'quick');
  const [entries, setEntries] = useState([]);
  const [bulkNets, setBulkNets] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  useEffect(() => {
    if (!sessionId || !config.storeResults) {
      setEntries([]);
      return;
    }
    let mounted = true;
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const subjectRows = await loadSubjectResults(sessionId);
        if (!mounted) return;
        const byStudent = groupSubjectResultsByStudent(subjectRows);
        const next = students.map((student) => {
          const rows = byStudent.get(student.id) ?? [];
          if (mode === 'quick') {
            const total = rows.reduce((s, r) => s + (Number(r.net) || 0), 0);
            return {
              student_id: student.id,
              totalNet: total ? String(Math.round(total * 100) / 100) : '',
              subjects: {},
            };
          }
          return initDetailedEntry(student.id, rows);
        });
        setEntries(next);
      } catch (loadError) {
        if (mounted) setError(loadError);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [sessionId, students, config.storeResults, mode]);

  function patchEntry(studentId, patch) {
    setEntries((current) =>
      current.map((entry) => (entry.student_id === studentId ? { ...entry, ...patch } : entry))
    );
  }

  function patchSubject(studentId, subjectCode, field, value) {
    setEntries((current) =>
      current.map((entry) => {
        if (entry.student_id !== studentId) return entry;
        const subjects = { ...entry.subjects };
        const cell = { ...(subjects[subjectCode] ?? emptySubjectRow(subjectCode)), [field]: value };
        if (field !== 'net') {
          const c = Number(cell.correct_count) || 0;
          const w = Number(cell.wrong_count) || 0;
          cell.net = c || w || cell.blank_count ? computeNet(c, w) : '';
        }
        subjects[subjectCode] = cell;
        return { ...entry, subjects };
      })
    );
  }

  function applyBulkPaste() {
    const lines = bulkNets.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    setEntries((current) =>
      current.map((entry, index) => ({
        ...entry,
        totalNet: lines[index] ?? entry.totalNet,
      }))
    );
    setBulkNets('');
  }

  async function handleSave(event) {
    event.preventDefault();
    if (!sessionId) return;
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const payload = entries.map((entry) => ({
        student_id: entry.student_id,
        subjects: entry.subjects,
        totalNet: mode === 'quick' ? entry.totalNet : rowTotalNet(entry),
      }));
      await saveClassExamEntry({ sessionId, entries: payload, mode });
      setSuccess('Sonuçlar kaydedildi.');
      onSaved?.();
    } catch (saveError) {
      setError(saveError);
    } finally {
      setSaving(false);
    }
  }

  const emptyMessage = useMemo(() => {
    if (!config.storeResults) return 'Sonuç kaydı kapalı. Sınav ayarlarından açın.';
    if (!sessionId) return 'Manuel giriş için bir oturum seçin.';
    if (!students.length) return 'Okulda kayıtlı öğrenci yok.';
    return null;
  }, [config.storeResults, sessionId, students.length]);

  if (emptyMessage) {
    return (
      <div className={shellClass}>
        <p className="dash-hint">{emptyMessage}</p>
      </div>
    );
  }

  return (
    <div className={shellClass}>
      {embedded && !hideTitle ? (
        <h3 className="exam-workspace-block__title">Manuel giriş</h3>
      ) : null}
      {!embedded ? (
        <h2 className="dash-section-title">
          Manuel sonuç girişi{sessionTitle ? ` — ${sessionTitle}` : ''}
        </h2>
      ) : null}
      {error && <InlineError error={error} context="calendar" />}
      {success && <SuccessMessage message={success} />}
      {loading ? (
        <p className="dash-hint">Sonuçlar yükleniyor…</p>
      ) : (
        <>
          <div className="exam-entry-toolbar">
            <div className="exam-entry-mode">
              <button
                type="button"
                className={`demo-btn${mode === 'quick' ? ' demo-btn--active' : ''}`}
                onClick={() => setMode('quick')}
              >
                Hızlı net
              </button>
              <button
                type="button"
                className={`demo-btn${mode === 'detailed' ? ' demo-btn--active' : ''}`}
                onClick={() => setMode('detailed')}
              >
                6 ders detay
              </button>
            </div>
          </div>

          <form className="dash-form" onSubmit={handleSave}>
            {mode === 'quick' ? (
              <>
                <label className="dash-label">
                  Toplu yapıştır (satır başına net, öğrenci listesi sırasıyla)
                  <textarea
                    className="dash-input exam-bulk-paste"
                    rows={3}
                    value={bulkNets}
                    onChange={(e) => setBulkNets(e.target.value)}
                    placeholder={'15.5\n14.0\n…'}
                  />
                </label>
                <button type="button" className="demo-btn" onClick={applyBulkPaste}>
                  Listeye uygula
                </button>
                <ul className="exam-roster">
                  {students.map((student) => {
                    const entry = entries.find((e) => e.student_id === student.id);
                    return (
                      <li key={student.id}>
                        <span>{student.full_name}</span>
                        <input
                          className="dash-input exam-net-input"
                          type="number"
                          step="0.01"
                          min="0"
                          max="90"
                          placeholder="Toplam net"
                          value={entry?.totalNet ?? ''}
                          onChange={(e) => patchEntry(student.id, { totalNet: e.target.value })}
                          disabled={saving}
                        />
                      </li>
                    );
                  })}
                </ul>
              </>
            ) : (
              <div className="exam-grid-wrap">
                <table className="exam-entry-grid">
                  <thead>
                    <tr>
                      <th>Öğrenci</th>
                      {LGS_SUBJECTS.map((s) => (
                        <th key={s.code} colSpan={4}>
                          {s.shortLabel}
                        </th>
                      ))}
                      <th>Toplam</th>
                    </tr>
                    <tr>
                      <th />
                      {LGS_SUBJECTS.map((s) => (
                        <Fragment key={s.code}>
                          <th>D</th>
                          <th>Y</th>
                          <th>B</th>
                          <th>N</th>
                        </Fragment>
                      ))}
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {students.map((student) => {
                      const entry = entries.find((e) => e.student_id === student.id) ?? initDetailedEntry(student.id);
                      return (
                        <tr key={student.id}>
                          <td>{student.full_name}</td>
                          {LGS_SUBJECTS.map((subject) => {
                            const cell = entry.subjects?.[subject.code] ?? emptySubjectRow(subject.code);
                            return (
                              <Fragment key={`${student.id}-${subject.code}`}>
                                <td>
                                  <input
                                    className="exam-cell-input"
                                    type="number"
                                    min="0"
                                    max={subject.questions}
                                    value={cell.correct_count}
                                    onChange={(e) =>
                                      patchSubject(student.id, subject.code, 'correct_count', e.target.value)
                                    }
                                  />
                                </td>
                                <td>
                                  <input
                                    className="exam-cell-input"
                                    type="number"
                                    min="0"
                                    max={subject.questions}
                                    value={cell.wrong_count}
                                    onChange={(e) =>
                                      patchSubject(student.id, subject.code, 'wrong_count', e.target.value)
                                    }
                                  />
                                </td>
                                <td>
                                  <input
                                    className="exam-cell-input"
                                    type="number"
                                    min="0"
                                    max={subject.questions}
                                    value={cell.blank_count}
                                    onChange={(e) =>
                                      patchSubject(student.id, subject.code, 'blank_count', e.target.value)
                                    }
                                  />
                                </td>
                                <td className="exam-cell-net">
                                  {cell.net !== '' && cell.net != null ? Number(cell.net).toFixed(2) : '—'}
                                </td>
                              </Fragment>
                            );
                          })}
                          <td className="exam-cell-total">{rowTotalNet(entry) || '—'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
            <SendButton sending={saving} label="Sonuçları kaydet" sendingLabel="Kaydediliyor…" />
          </form>
        </>
      )}
    </div>
  );
}
