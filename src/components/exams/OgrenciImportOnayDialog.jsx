import { useMemo } from 'react';
import { createPortal } from 'react-dom';
import { previewOptikEntryStats } from '../../lib/examOptikImport';

function StudentReviewRow({ row, questions, students, onAssignStudent, expanded, onToggle }) {
  const stats = useMemo(() => previewOptikEntryStats(row, questions), [row, questions]);
  const matched = Boolean(row.student_id);
  const rowKey = row.rowNumber ?? row.student_number ?? row.studentName ?? 'row';

  return (
    <details
      className={`exam-import-review-row${expanded ? ' exam-import-review-row--open' : ''}${matched ? '' : ' exam-import-review-row--issue'}`}
      open={expanded}
      onToggle={(event) => onToggle(rowKey, event.currentTarget.open)}
    >
      <summary className="exam-import-review-row__summary">
        <span className="exam-import-review-row__title">
          {row.studentName || row.student_number || '—'}
        </span>
        <span className="exam-import-review-row__meta">
          {row.student_number ? <span className="dash-hint">No {row.student_number}</span> : null}
          <span
            className={`exam-student-review__badge${matched ? ' exam-student-review__badge--ok' : ' exam-student-review__badge--warn'}`}
          >
            {matched ? 'Eşleşti' : 'Eşleşmedi'}
          </span>
          {matched ? (
            <span className="dash-hint">
              Net {stats.totalNet.toFixed(2)} · D {stats.totalCorrect} / Y {stats.totalWrong} / B{' '}
              {stats.totalBlank}
            </span>
          ) : null}
        </span>
      </summary>
      <div className="exam-import-review-row__body">
        {!matched ? (
          <label className="dash-label exam-import-review-row__assign">
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
                  <tr
                    key={question.question_index}
                    className={`exam-student-review__choice exam-student-review__choice--${status}`}
                  >
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

export default function OgrenciImportOnayDialog({
  open,
  studentPreview = [],
  questions = [],
  students = [],
  questionCount = 0,
  studentFilter,
  onStudentFilterChange,
  expandedRows,
  onToggleRow,
  onAssignStudent,
  saving = false,
  onCancel,
  onConfirm,
}) {
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

  if (!open) return null;

  return createPortal(
    <div className="app-dialog" role="presentation" onClick={saving ? undefined : onCancel}>
      <div
        className="app-dialog__panel exam-import-review-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="student-import-review-title"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="student-import-review-title" className="app-dialog__title">
          Öğrenci cevaplarını onayla
        </h2>
        <p className="app-dialog__lead">
          {questionCount || questions.length} soru sütunu · {matchedCount} eşleşen
          {unmatchedCount ? ` · ${unmatchedCount} eşleşmeyen` : ''}. Eşleşmeyen satırlarda okul
          sistemindeki öğrenciyi seçin.
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
              onClick={() => onStudentFilterChange(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>

        <div className="exam-import-review-dialog__list">
          {filteredPreview.length === 0 ? (
            <p className="dash-hint exam-import-review-dialog__empty">Bu filtrede öğrenci yok.</p>
          ) : (
            filteredPreview.map((row) => {
              const rowKey = row.rowNumber ?? row.student_number ?? row.studentName ?? 'row';
              return (
                <StudentReviewRow
                  key={rowKey}
                  row={row}
                  questions={questions}
                  students={students}
                  onAssignStudent={onAssignStudent}
                  expanded={expandedRows.has(rowKey)}
                  onToggle={onToggleRow}
                />
              );
            })
          )}
        </div>

        <p className="dash-hint exam-import-review-dialog__progress">
          {matchedCount}/{studentPreview.length} öğrenci eşleşti
        </p>

        <div className="app-dialog__actions">
          <button type="button" className="demo-btn demo-btn--ghost" disabled={saving} onClick={onCancel}>
            İptal
          </button>
          <button
            type="button"
            className="demo-btn demo-btn--primary"
            disabled={saving || matchedCount === 0}
            onClick={onConfirm}
          >
            {saving ? 'Aktarılıyor…' : `${matchedCount} öğrenciyi onayla ve içe aktar`}
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
