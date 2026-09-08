const CLASS_SELECT = 'id, school_id, grade, name';
const SUBJECT_SELECT = 'id, grade, slug, name, color, icon, sort_order';

function resolveSubjectForClass(subjects, subjectSlug, classGrade) {
  if (!subjectSlug || classGrade == null) return null;
  return (
    (subjects ?? []).find(
      (subject) => subject.slug === subjectSlug && subject.grade === classGrade
    ) ?? null
  );
}

function subjectIdForClassAccess(subjects, subjectSlug, classGrade) {
  const exact = resolveSubjectForClass(subjects, subjectSlug, classGrade);
  if (exact) return exact.id;
  const fallback = (subjects ?? []).find(
    (subject) => subject.grade === classGrade && (subject.slug !== 'din' || classGrade >= 8)
  );
  return fallback?.id ?? null;
}

export function schoolHasAtlasSchedule(school) {
  return Boolean(school?.features?.atlas_schedule);
}

export async function ensureTeachersAssignedToAllClasses(
  db,
  { schoolId, teacherIds = null, classIds = null } = {}
) {
  if (!db || !schoolId) return { inserted: 0 };

  let classesQuery = db.from('classes').select(CLASS_SELECT).eq('school_id', schoolId);
  if (classIds?.length) classesQuery = classesQuery.in('id', classIds);
  const { data: classes, error: classError } = await classesQuery;
  if (classError) throw classError;
  if (!classes?.length) return { inserted: 0 };

  const { data: subjects, error: subjectError } = await db
    .from('curriculum_subjects')
    .select(SUBJECT_SELECT);
  if (subjectError) throw subjectError;

  let teachers = [];
  if (teacherIds?.length) {
    const { data, error } = await db
      .from('profiles')
      .select('id, school_id, subject_slug')
      .eq('school_id', schoolId)
      .in('id', teacherIds);
    if (error) throw error;
    teachers = data ?? [];
  } else {
    const { data: roleRows, error: roleError } = await db
      .from('profile_roles')
      .select('profile_id')
      .eq('role', 'teacher');
    if (roleError) throw roleError;
    const ids = [...new Set((roleRows ?? []).map((row) => row.profile_id).filter(Boolean))];
    if (!ids.length) return { inserted: 0 };
    const { data, error } = await db
      .from('profiles')
      .select('id, school_id, subject_slug')
      .eq('school_id', schoolId)
      .in('id', ids);
    if (error) throw error;
    teachers = data ?? [];
  }

  if (!teachers.length) return { inserted: 0 };

  const ids = teachers.map((teacher) => teacher.id);
  const { data: existing, error: existingError } = await db
    .from('teacher_assignments')
    .select('teacher_id, class_id')
    .in('teacher_id', ids);
  if (existingError) throw existingError;

  const have = new Set((existing ?? []).map((row) => `${row.teacher_id}:${row.class_id}`));
  const rows = [];
  for (const teacher of teachers) {
    for (const klass of classes) {
      const key = `${teacher.id}:${klass.id}`;
      if (have.has(key)) continue;
      const subjectId = subjectIdForClassAccess(subjects, teacher.subject_slug, klass.grade);
      if (!subjectId) continue;
      rows.push({
        teacher_id: teacher.id,
        class_id: klass.id,
        subject_id: subjectId,
      });
      have.add(key);
    }
  }

  if (!rows.length) return { inserted: 0 };

  const { error: insertError } = await db.from('teacher_assignments').insert(rows);
  if (insertError) throw insertError;
  return { inserted: rows.length };
}
