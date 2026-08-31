import { useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import {
  formatAssignmentLabel,
  formatClassLabel,
  getTeacherBransDisplay,
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
  onRefresh,
  onAssigned,
  onRemoved,
}) {
  const [teacherId, setTeacherId] = useState('');
  const [classId, setClassId] = useState('');
  const [saving, setSaving] = useState(false);
  const [removingId, setRemovingId] = useState(null);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  const selectedTeacher = teachers.find((teacher) => teacher.id === teacherId) ?? null;
  const selectedClass = classes.find((klass) => klass.id === classId) ?? null;
  const teacherBrans = selectedTeacher ? getTeacherBransDisplay(selectedTeacher) : null;

  const resolvedSubject = useMemo(() => {
    if (!selectedClass || !selectedTeacher) return null;
    const slug = getTeacherSubjectSlug(selectedTeacher);
    if (!slug) return null;
    return resolveSubjectForClass(subjects, slug, selectedClass.grade);
  }, [subjects, selectedClass, selectedTeacher]);

  async function handleAdd(event) {
    event.preventDefault();
    setError(null);
    setSuccess(null);

    if (!teacherId || !classId) {
      setError('Öğretmen ve şube seçin.');
      return;
    }

    if (!resolvedSubject) {
      const bransName = teacherBrans?.name ?? 'Branş';
      setError(
        selectedTeacher && !getTeacherSubjectSlug(selectedTeacher)
          ? 'Öğretmenin branşı tanımlı değil. Öğretmen Yönetimi sekmesinden branş atayın.'
          : `${bransName} dersi ${formatClassLabel(selectedClass?.grade, selectedClass?.name)} için müfredatta yok.`
      );
      return;
    }

    const duplicate = assignments.some(
      (row) =>
        row.teacher_id === teacherId &&
        row.class_id === classId &&
        row.subject_id === resolvedSubject.id
    );
    if (duplicate) {
      setError('Bu öğretmen için aynı şube ataması zaten var.');
      return;
    }

    setSaving(true);
    const { data, error: insertError } = await supabase
      .from('teacher_assignments')
      .insert({
        teacher_id: teacherId,
        class_id: classId,
        subject_id: resolvedSubject.id,
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
    const label = formatAssignmentLabel({
      classes: klass,
      curriculum_subjects: resolvedSubject,
    });

    setSuccess(`${label} ataması kaydedildi.`);
    onAssigned?.({
      teacherName: teacher?.full_name ?? teacher?.email ?? 'Öğretmen',
      classLabel: formatClassLabel(klass?.grade, klass?.name),
      subjectName: resolvedSubject.name,
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
      <h2 className="dash-section-title">Şube ataması</h2>
      <p className="dash-hint">
        Öğretmeni şubeye atayın. Ders, öğretmenin branşından otomatik gelir (ör. Matematik öğretmeni
        → 5-A Matematik). Öğretmen yalnızca atandığı şubelerdeki öğrencileri görür.
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
            {teachers.map((teacher) => {
              const brans = getTeacherBransDisplay(teacher);
              return (
                <option key={teacher.id} value={teacher.id}>
                  {teacher.full_name ?? teacher.email}
                  {brans ? ` · ${brans.name}` : ''}
                </option>
              );
            })}
          </select>
        </label>

        <label className="dash-label">
          Şube
          <select
            className="dash-input"
            value={classId}
            onChange={(event) => setClassId(event.target.value)}
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

        {selectedTeacher && selectedClass ? (
          resolvedSubject ? (
            <p className="dash-hint cur-assignment-subject">
              Ders: <strong>{resolvedSubject.name}</strong> (öğretmen branşı)
            </p>
          ) : (
            <p className="dash-hint">
              {getTeacherSubjectSlug(selectedTeacher)
                ? `${teacherBrans?.name ?? 'Branş'} bu sınıf seviyesinde müfredatta yok.`
                : 'Öğretmenin branşı tanımlı değil — Öğretmen Yönetimi sekmesinden branş atayın.'}
            </p>
          )
        ) : null}

        {error && <InlineError error={error} context="curriculum" />}
        {success && <SuccessMessage message={success} />}

        <SendButton
          sending={saving}
          disabled={!teacherId || !classId || !resolvedSubject}
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
