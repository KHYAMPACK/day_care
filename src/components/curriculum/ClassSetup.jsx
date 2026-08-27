import { useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { withSchoolFilter } from '../../lib/tenant';
import { STUDENT_GRADES, formatStudentGrade } from '../../lib/calendar';
import { formatClassLabel } from '../../lib/curriculum';
import { InlineError, SendButton, SuccessMessage } from '../dashboardUi';

export default function ClassSetup({ classes, students, schoolId, onRefresh }) {
  const [grade, setGrade] = useState('5');
  const [name, setName] = useState('A');
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState(null);
  const [updatingStudentId, setUpdatingStudentId] = useState(null);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  const classNameById = useMemo(
    () => Object.fromEntries(classes.map((klass) => [klass.id, formatClassLabel(klass.grade, klass.name)])),
    [classes]
  );

  async function handleCreate(event) {
    event.preventDefault();
    setError(null);
    setSuccess(null);

    const trimmed = name.trim().toLocaleUpperCase('tr');
    if (!trimmed) {
      setError('Şube adı zorunludur (ör. A).');
      return;
    }

    setSaving(true);
    const { error: insertError } = await supabase.from('classes').insert({
      school_id: schoolId,
      grade: Number(grade),
      name: trimmed,
    });
    setSaving(false);

    if (insertError) {
      setError(insertError);
      return;
    }

    setSuccess(`${grade}-${trimmed} eklendi.`);
    await onRefresh();
  }

  async function handleDelete(klass) {
    const label = formatClassLabel(klass.grade, klass.name);
    if (!window.confirm(`${label} şubesini silmek istediğinize emin misiniz?`)) return;

    setDeletingId(klass.id);
    setError(null);
    setSuccess(null);

    const { error: deleteError } = await withSchoolFilter(
      supabase.from('classes').delete().eq('id', klass.id),
      schoolId
    );
    setDeletingId(null);

    if (deleteError) {
      setError(deleteError);
      return;
    }

    setSuccess(`${label} silindi.`);
    await onRefresh();
  }

  async function handleStudentClass(student, classId) {
    setUpdatingStudentId(student.id);
    setError(null);
    setSuccess(null);

    const { error: updateError } = await withSchoolFilter(
      supabase
        .from('students')
        .update({ class_id: classId || null })
        .eq('id', student.id),
      schoolId
    );
    setUpdatingStudentId(null);

    if (updateError) {
      setError(updateError);
      return;
    }

    await onRefresh();
  }

  return (
    <>
      <div className="dash-card">
        <h2 className="dash-section-title">Şubeler</h2>
        <p className="dash-hint">
          Öğrencileri 5-A, 5-B gibi şubelere yerleştirin. Müfredat kaydı şube + ders atamasına
          göre yapılır.
        </p>

        <form className="dash-form cur-inline-form" onSubmit={handleCreate}>
          <label className="dash-label">
            Sınıf
            <select
              className="dash-input"
              value={grade}
              onChange={(event) => setGrade(event.target.value)}
              disabled={saving}
            >
              {STUDENT_GRADES.map((value) => (
                <option key={value} value={value}>
                  {value}. sınıf
                </option>
              ))}
            </select>
          </label>
          <label className="dash-label">
            Şube
            <input
              className="dash-input"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="A"
              maxLength={8}
              disabled={saving}
              required
            />
          </label>
          <SendButton sending={saving} label="Şube ekle" sendingLabel="Ekleniyor…" />
        </form>

        {error && <InlineError error={error} context="curriculum" />}
        {success && <SuccessMessage message={success} />}

        {classes.length === 0 ? (
          <p className="dash-hint">Henüz şube yok. Önce 5-A gibi bir şube ekleyin.</p>
        ) : (
          <ul className="assignment-chip-list cur-class-list">
            {classes.map((klass) => (
              <li key={klass.id} className="assignment-chip">
                {formatClassLabel(klass.grade, klass.name)}
                <button
                  type="button"
                  className="cur-chip-remove"
                  onClick={() => handleDelete(klass)}
                  disabled={deletingId === klass.id}
                >
                  {deletingId === klass.id ? '…' : 'Sil'}
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="dash-card">
        <h2 className="dash-section-title">Öğrencileri şubeye yerleştir</h2>
        {students.length === 0 ? (
          <p className="dash-hint">Önce öğrenci ekleyin.</p>
        ) : classes.length === 0 ? (
          <p className="dash-hint">Şube oluşturmadan yerleştirme yapılamaz.</p>
        ) : (
          <ul className="match-list student-roster-list">
            {students.map((student) => (
              <li key={student.id} className="match-item student-roster-item">
                <div className="student-roster-item__meta">
                  <span className="match-item__names">{student.full_name}</span>
                  <span className="student-roster-item__dob">
                    {student.grade ? formatStudentGrade(student.grade) : 'Sınıf yok'}
                    {student.class_id ? ` · ${classNameById[student.class_id] ?? ''}` : ''}
                  </span>
                  <select
                    className="dash-input"
                    value={student.class_id ?? ''}
                    onChange={(event) => handleStudentClass(student, event.target.value)}
                    disabled={updatingStudentId === student.id}
                    aria-label={`${student.full_name} şubesi`}
                  >
                    <option value="">Şube yok</option>
                    {classes.map((klass) => (
                      <option key={klass.id} value={klass.id}>
                        {formatClassLabel(klass.grade, klass.name)}
                      </option>
                    ))}
                  </select>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
