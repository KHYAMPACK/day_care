import { useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { formatClassLabel } from '../../lib/curriculum';
import { InlineError, SendButton, SuccessMessage } from '../dashboardUi';

export default function CurriculumAssignmentPanel({
  teachers,
  classes,
  subjects,
  assignments,
  onRefresh,
}) {
  const [teacherId, setTeacherId] = useState('');
  const [classId, setClassId] = useState('');
  const [subjectId, setSubjectId] = useState('');
  const [saving, setSaving] = useState(false);
  const [removingId, setRemovingId] = useState(null);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  const selectedClass = classes.find((klass) => klass.id === classId);
  const subjectsForClass = useMemo(() => {
    if (!selectedClass) return [];
    return subjects.filter((subject) => subject.grade === selectedClass.grade);
  }, [subjects, selectedClass]);

  async function handleAdd(event) {
    event.preventDefault();
    setError(null);
    setSuccess(null);

    if (!teacherId || !classId || !subjectId) {
      setError('Öğretmen, şube ve ders seçin.');
      return;
    }

    setSaving(true);
    const { error: insertError } = await supabase.from('teacher_assignments').insert({
      teacher_id: teacherId,
      class_id: classId,
      subject_id: subjectId,
    });
    setSaving(false);

    if (insertError) {
      setError(insertError);
      return;
    }

    setSuccess('Müfredat ataması kaydedildi.');
    setSubjectId('');
    await onRefresh();
  }

  async function handleRemove(assignment) {
    setRemovingId(assignment.id);
    setError(null);
    setSuccess(null);

    const { error: deleteError } = await supabase
      .from('teacher_assignments')
      .delete()
      .eq('id', assignment.id);
    setRemovingId(null);

    if (deleteError) {
      setError(deleteError);
      return;
    }

    setSuccess('Atama kaldırıldı.');
    await onRefresh();
  }

  return (
    <div className="dash-card">
      <h2 className="dash-section-title">Müfredat ataması (şube + ders)</h2>
      <p className="dash-hint">
        Öğretmeni öğrenci tek tek değil, şube ve ders ile eşleştirin. Örnek: Ayşe → 5-A
        Matematik. Üstteki öğrenci listesi yalnızca mesajlaşma içindir.
      </p>

      <form className="dash-form" onSubmit={handleAdd}>
        <label className="dash-label">
          Öğretmen
          <select
            className="dash-input"
            value={teacherId}
            onChange={(event) => setTeacherId(event.target.value)}
            disabled={saving}
          >
            <option value="">Seçin…</option>
            {teachers.map((teacher) => (
              <option key={teacher.id} value={teacher.id}>
                {teacher.full_name ?? teacher.email}
              </option>
            ))}
          </select>
        </label>

        <label className="dash-label">
          Şube
          <select
            className="dash-input"
            value={classId}
            onChange={(event) => {
              setClassId(event.target.value);
              setSubjectId('');
            }}
            disabled={saving || classes.length === 0}
          >
            <option value="">Seçin…</option>
            {classes.map((klass) => (
              <option key={klass.id} value={klass.id}>
                {formatClassLabel(klass.grade, klass.name)}
              </option>
            ))}
          </select>
        </label>

        <label className="dash-label">
          Ders
          <select
            className="dash-input"
            value={subjectId}
            onChange={(event) => setSubjectId(event.target.value)}
            disabled={saving || !classId}
          >
            <option value="">Seçin…</option>
            {subjectsForClass.map((subject) => (
              <option key={subject.id} value={subject.id}>
                {subject.name}
              </option>
            ))}
          </select>
        </label>

        {error && <InlineError error={error} context="curriculum" />}
        {success && <SuccessMessage message={success} />}

        <SendButton
          sending={saving}
          disabled={!teacherId || !classId || !subjectId}
          label="Atamayı kaydet"
          sendingLabel="Kaydediliyor…"
        />
      </form>

      {assignments.length === 0 ? (
        <p className="dash-hint">Henüz müfredat ataması yok.</p>
      ) : (
        <ul className="history-list">
          {assignments.map((assignment) => (
            <li key={assignment.id} className="history-item">
              <div className="history-meta">
                <strong>
                  {assignment.profiles?.full_name ?? assignment.profiles?.email ?? 'Öğretmen'}
                </strong>
                <span>
                  {formatClassLabel(assignment.classes?.grade, assignment.classes?.name)} ·{' '}
                  {assignment.curriculum_subjects?.name}
                </span>
              </div>
              <button
                type="button"
                className="match-item__remove"
                onClick={() => handleRemove(assignment)}
                disabled={removingId === assignment.id}
              >
                {removingId === assignment.id ? 'Kaldırılıyor…' : 'Kaldır'}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
