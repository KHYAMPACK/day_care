import { useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import {
  formatAssignmentLabel,
  formatClassLabel,
  getTeacherSubjectSlug,
  resolveSubjectForClass,
} from '../../lib/curriculum';
import { InlineError, SendButton, SuccessMessage } from '../dashboardUi';

export default function CurriculumAssignmentPanel({
  teachers,
  classes,
  subjects,
  assignments,
  classStudentCounts = {},
  atlasSchedule = false,
  onRefresh,
  onAssigned,
  onRemoved,
}) {
  const [teacherId, setTeacherId] = useState('');
  const [classId, setClassId] = useState('');
  const [subjectId, setSubjectId] = useState('');
  const [saving, setSaving] = useState(false);
  const [removingId, setRemovingId] = useState(null);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  const selectedTeacher = teachers.find((teacher) => teacher.id === teacherId) ?? null;
  const selectedClass = classes.find((klass) => klass.id === classId) ?? null;

  const subjectsForClass = useMemo(() => {
    if (!selectedClass) return [];
    const gradeSubjects = subjects.filter((subject) => subject.grade === selectedClass.grade);
    if (!atlasSchedule || !selectedTeacher) return gradeSubjects;

    const slug = getTeacherSubjectSlug(selectedTeacher);
    if (!slug) return gradeSubjects;
    const match = resolveSubjectForClass(subjects, slug, selectedClass.grade);
    return match ? [match] : gradeSubjects;
  }, [subjects, selectedClass, atlasSchedule, selectedTeacher]);

  useEffect(() => {
    if (!classId || subjectsForClass.length !== 1) return;
    setSubjectId(subjectsForClass[0].id);
  }, [classId, subjectsForClass]);

  async function handleAdd(event) {
    event.preventDefault();
    setError(null);
    setSuccess(null);

    if (!teacherId || !classId || !subjectId) {
      setError('Öğretmen, şube ve ders seçin.');
      return;
    }

    const duplicate = assignments.some(
      (row) =>
        row.teacher_id === teacherId &&
        row.class_id === classId &&
        row.subject_id === subjectId
    );
    if (duplicate) {
      setError('Bu öğretmen için aynı şube ve ders ataması zaten var.');
      return;
    }

    setSaving(true);
    const { data, error: insertError } = await supabase
      .from('teacher_assignments')
      .insert({
        teacher_id: teacherId,
        class_id: classId,
        subject_id: subjectId,
      })
      .select(ASSIGNMENT_INSERT_SELECT)
      .single();
    setSaving(false);

    if (insertError) {
      setError(insertError);
      return;
    }

    const teacher = teachers.find((row) => row.id === teacherId);
    const klass = classes.find((row) => row.id === classId);
    const subject = subjects.find((row) => row.id === subjectId);
    const label = formatAssignmentLabel({
      classes: klass,
      curriculum_subjects: subject,
    });

    setSuccess(`${label} ataması kaydedildi.`);
    setSubjectId('');
    onAssigned?.({
      teacherName: teacher?.full_name ?? teacher?.email ?? 'Öğretmen',
      classLabel: formatClassLabel(klass?.grade, klass?.name),
      subjectName: subject?.name ?? 'Ders',
      label,
      row: data,
    });
    await onRefresh?.();
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
    onRemoved?.({
      teacherName: assignment.profiles?.full_name ?? assignment.profiles?.email ?? 'Öğretmen',
      label: formatAssignmentLabel(assignment),
      row: assignment,
    });
    await onRefresh?.();
  }

  return (
    <div className="dash-card">
      <h2 className="dash-section-title">Şube + ders ataması</h2>
      <p className="dash-hint">
        Öğretmeni şube ve ders ile eşleştirin. Örnek: Ayşe → 5-A Matematik. Öğretmen yalnızca
        atandığı şubelerdeki öğrencileri görür ve velilerine mesaj gönderebilir.
      </p>

      <form className="dash-form" onSubmit={handleAdd}>
        <label className="dash-label">
          Öğretmen
          <select
            className="dash-input"
            value={teacherId}
            onChange={(event) => {
              setTeacherId(event.target.value);
              setSubjectId('');
            }}
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
                {classStudentCounts[klass.id]
                  ? ` · ${classStudentCounts[klass.id]} öğrenci`
                  : ''}
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
        <p className="dash-hint">Henüz şube ataması yok.</p>
      ) : (
        <ul className="history-list">
          {assignments.map((assignment) => {
            const studentCount = classStudentCounts[assignment.class_id] ?? 0;
            return (
              <li key={assignment.id} className="history-item">
                <div className="history-meta">
                  <strong>
                    {assignment.profiles?.full_name ?? assignment.profiles?.email ?? 'Öğretmen'}
                  </strong>
                  <span>
                    {formatAssignmentLabel(assignment)}
                    {studentCount ? ` · ${studentCount} öğrenci` : ''}
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
            );
          })}
        </ul>
      )}
    </div>
  );
}

const ASSIGNMENT_INSERT_SELECT = 'id, teacher_id, class_id, subject_id, created_at';
