import { supabase } from './supabase';
import { withSchoolFilter } from './tenant';
import { addDaysIso, istanbulDateIso } from './calendar';
import { CURRICULUM_SUBJECT_DEFS } from './dersligCatalog.js';

export const ACADEMIC_YEAR_ANCHOR = '2026-09-14';

export const SUBJECT_SELECT = 'id, grade, slug, name, color, icon, sort_order';
export const UNIT_SELECT = 'id, subject_id, title, sort_order, sections, duration_weeks';
export const CLASS_SELECT = 'id, school_id, grade, name';
export const ASSIGNMENT_ROW_SELECT = 'id, teacher_id, class_id, subject_id, created_at';
export const PROGRESS_SELECT =
  'id, school_id, student_id, unit_id, completed, questions_solved, source, updated_at';
export const WEEK_PLAN_SELECT = 'id, school_id, grade, week_index, unit_id';
export const WEEK_NOTE_SELECT =
  'id, school_id, class_id, subject_id, week_index, note, updated_at';

export function formatClassLabel(grade, name) {
  if (!Number.isInteger(grade) || !name) return name || '';
  return `${grade}-${String(name).trim()}`;
}

export function formatAssignmentLabel(assignment) {
  const klass = assignment?.classes;
  const subject = assignment?.curriculum_subjects;
  if (!klass || !subject) return 'Atama';
  return `${formatClassLabel(klass.grade, klass.name)} · ${subject.name}`;
}

/** Teacher branş slug from profile (subject_slug preferred over joined subject). */
export function getTeacherSubjectSlug(profile) {
  return profile?.subject_slug ?? profile?.curriculum_subjects?.slug ?? null;
}

/** Resolve grade-specific curriculum subject for a branş slug and class grade. */
export function resolveSubjectForClass(subjects, subjectSlug, classGrade) {
  if (!subjectSlug || classGrade == null) return null;
  return (
    (subjects ?? []).find(
      (subject) => subject.slug === subjectSlug && subject.grade === classGrade
    ) ?? null
  );
}

/** Display metadata for teacher branş (name, color, icon) from slug. */
export function getTeacherBransDisplay(profile) {
  const slug = getTeacherSubjectSlug(profile);
  if (!slug) return null;
  const def = CURRICULUM_SUBJECT_DEFS.find((row) => row.slug === slug);
  return {
    slug,
    name: def?.name ?? slug,
    color: def?.color,
    icon: def?.icon,
  };
}

export async function loadCurriculumSubjects() {
  const { data, error } = await supabase
    .from('curriculum_subjects')
    .select(SUBJECT_SELECT)
    .order('grade', { ascending: true })
    .order('sort_order', { ascending: true });
  if (error) throw error;
  return data ?? [];
}

function parseIsoUtc(isoDate) {
  const [year, month, day] = isoDate.split('-').map(Number);
  return Date.UTC(year, month - 1, day);
}

export function mondayOfWeekContaining(isoDate) {
  const [year, month, day] = isoDate.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  const weekday = date.getUTCDay();
  const offset = weekday === 0 ? -6 : 1 - weekday;
  date.setUTCDate(date.getUTCDate() + offset);
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function academicWeekIndex(isoDate = istanbulDateIso()) {
  const week1Monday = mondayOfWeekContaining(ACADEMIC_YEAR_ANCHOR);
  const thisMonday = mondayOfWeekContaining(isoDate);
  const days = (parseIsoUtc(thisMonday) - parseIsoUtc(week1Monday)) / 86400000;
  return Math.floor(days / 7) + 1;
}

export function weekRangeIso(weekIndex) {
  const week1Monday = mondayOfWeekContaining(ACADEMIC_YEAR_ANCHOR);
  const startOffset = (weekIndex - 1) * 7;
  const start = addDaysIso(week1Monday, startOffset);
  const end = addDaysIso(start, 6);
  return { start, end };
}

export function formatWeekRangeTr(weekIndex) {
  const { start, end } = weekRangeIso(weekIndex);
  const startDate = new Date(`${start}T00:00:00Z`);
  const endDate = new Date(`${end}T00:00:00Z`);
  const startLabel = startDate.toLocaleDateString('tr-TR', {
    timeZone: 'UTC',
    day: 'numeric',
    month: 'long',
  });
  const endLabel = endDate.toLocaleDateString('tr-TR', {
    timeZone: 'UTC',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  return `${startLabel} – ${endLabel}`;
}

export function weekOverlapsHoliday(weekIndex, events) {
  const { start, end } = weekRangeIso(weekIndex);
  return (events ?? []).some((event) => {
    if (event.event_type !== 'holiday') return false;
    return event.starts_on <= end && event.ends_on >= start;
  });
}

export function classProgressForUnit(progressRows, studentIds, unitId) {
  const relevant = (progressRows ?? []).filter(
    (row) => row.unit_id === unitId && studentIds.includes(row.student_id)
  );
  const completedClass = relevant.some((row) => row.completed && row.source !== 'override');
  const sample = relevant.find((row) => row.source !== 'override') ?? relevant[0];
  return {
    completed: Boolean(completedClass),
    questions_solved: sample?.questions_solved ?? 0,
    hasRow: relevant.length > 0,
  };
}

export function nextIncompleteUnit(units, progressRows, studentIds) {
  if (!units?.length) return null;
  const incomplete = units.find((unit) => {
    const state = classProgressForUnit(progressRows, studentIds, unit.id);
    return !state.completed;
  });
  return incomplete ?? units[units.length - 1];
}

export function unitsForWeek({ units, weekPlans, weekIndex, grade, progressRows, studentIds }) {
  const pinnedIds = new Set(
    (weekPlans ?? [])
      .filter((plan) => plan.week_index === weekIndex && plan.grade === grade)
      .map((plan) => plan.unit_id)
  );
  const pinned = (units ?? []).filter((unit) => pinnedIds.has(unit.id));
  if (pinned.length) return pinned;
  const next = nextIncompleteUnit(units, progressRows, studentIds);
  return next ? [next] : [];
}

export function isPlaceholderUnitTitle(title) {
  return /^Ünite\s+\d+$/i.test(String(title ?? '').trim());
}

export function plannedUnitForWeek({ units, weekIndex }) {
  if (!units?.length || !Number.isFinite(weekIndex) || weekIndex < 1) return null;

  const ordered = [...units].sort((left, right) => (left.sort_order ?? 0) - (right.sort_order ?? 0));
  let cursor = 1;

  for (const unit of ordered) {
    const durationWeeks = Math.max(1, Number(unit.duration_weeks) || 1);
    const spanStart = cursor;
    const spanEnd = cursor + durationWeeks - 1;
    if (weekIndex >= spanStart && weekIndex <= spanEnd) {
      return {
        unit,
        spanStart,
        spanEnd,
        weekInSpan: weekIndex - spanStart + 1,
        durationWeeks,
      };
    }
    cursor = spanEnd + 1;
  }

  return null;
}

export function formatPlannedUnitBanner(plan) {
  if (!plan?.unit?.title) return null;
  return `${plan.unit.title} · hafta ${plan.weekInSpan}/${plan.durationWeeks}`;
}

export function expandSubjectSchedule(units) {
  const ordered = [...(units ?? [])].sort(
    (left, right) => (left.sort_order ?? 0) - (right.sort_order ?? 0)
  );
  let cursor = 1;

  return ordered.map((unit) => {
    const durationWeeks = Math.max(1, Number(unit.duration_weeks) || 1);
    const spanStart = cursor;
    const spanEnd = cursor + durationWeeks - 1;
    cursor = spanEnd + 1;
    return { unit, spanStart, spanEnd, durationWeeks };
  });
}

export function formatScheduleWeekRange(spanStart, spanEnd) {
  if (spanStart === spanEnd) return `Hafta ${spanStart}`;
  return `Hafta ${spanStart}–${spanEnd}`;
}

export async function loadCurriculumCatalog() {
  const [subjectsRes, unitsRes] = await Promise.all([
    supabase
      .from('curriculum_subjects')
      .select(SUBJECT_SELECT)
      .order('grade', { ascending: true })
      .order('sort_order', { ascending: true }),
    supabase.from('curriculum_units').select(UNIT_SELECT).order('sort_order', { ascending: true }),
  ]);
  if (subjectsRes.error) throw subjectsRes.error;
  if (unitsRes.error) {
    const message = unitsRes.error.message ?? '';
    if (/duration_weeks/i.test(message)) {
      const fallback = await supabase
        .from('curriculum_units')
        .select('id, subject_id, title, sort_order, sections')
        .order('sort_order', { ascending: true });
      if (fallback.error) throw fallback.error;
      return { subjects: subjectsRes.data ?? [], units: fallback.data ?? [] };
    }
    throw unitsRes.error;
  }
  return { subjects: subjectsRes.data ?? [], units: unitsRes.data ?? [] };
}

export async function loadSchoolClasses(schoolId) {
  const { data, error } = await withSchoolFilter(
    supabase.from('classes').select(CLASS_SELECT).order('grade', { ascending: true }).order('name', { ascending: true }),
    schoolId
  );
  if (error) throw error;
  return data ?? [];
}

async function hydrateAssignments(rows, { includeProfiles = false } = {}) {
  const list = rows ?? [];
  if (!list.length) return [];

  const classIds = [...new Set(list.map((row) => row.class_id).filter(Boolean))];
  const subjectIds = [...new Set(list.map((row) => row.subject_id).filter(Boolean))];
  const teacherIds = [...new Set(list.map((row) => row.teacher_id).filter(Boolean))];

  const [classesRes, subjectsRes, profilesRes] = await Promise.all([
    classIds.length
      ? supabase.from('classes').select(CLASS_SELECT).in('id', classIds)
      : Promise.resolve({ data: [], error: null }),
    subjectIds.length
      ? supabase.from('curriculum_subjects').select(SUBJECT_SELECT).in('id', subjectIds)
      : Promise.resolve({ data: [], error: null }),
    includeProfiles && teacherIds.length
      ? supabase.from('profiles').select('id, full_name, email').in('id', teacherIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (classesRes.error) throw classesRes.error;
  if (subjectsRes.error) throw subjectsRes.error;
  if (profilesRes.error) throw profilesRes.error;

  const classById = Object.fromEntries((classesRes.data ?? []).map((klass) => [klass.id, klass]));
  const subjectById = Object.fromEntries((subjectsRes.data ?? []).map((subject) => [subject.id, subject]));
  const profileById = Object.fromEntries((profilesRes.data ?? []).map((profile) => [profile.id, profile]));

  return list.map((row) => ({
    ...row,
    classes: classById[row.class_id] ?? null,
    curriculum_subjects: subjectById[row.subject_id] ?? null,
    profiles: includeProfiles ? profileById[row.teacher_id] ?? null : undefined,
  }));
}

export async function loadTeacherAssignments(teacherId) {
  const { data, error } = await supabase
    .from('teacher_assignments')
    .select(ASSIGNMENT_ROW_SELECT)
    .eq('teacher_id', teacherId)
    .order('created_at');
  if (error) throw error;
  return hydrateAssignments(data);
}

export async function loadSchoolAssignments(schoolId) {
  const { data, error } = await supabase
    .from('teacher_assignments')
    .select(ASSIGNMENT_ROW_SELECT)
    .order('created_at');
  if (error) throw error;
  const hydrated = await hydrateAssignments(data, { includeProfiles: true });
  return hydrated.filter((row) => row.classes?.school_id === schoolId);
}

export async function loadCurriculumWeekNote({ classId, subjectId, weekIndex }) {
  if (!classId || !subjectId || !weekIndex) return null;
  const { data, error } = await supabase
    .from('curriculum_week_notes')
    .select(WEEK_NOTE_SELECT)
    .eq('class_id', classId)
    .eq('subject_id', subjectId)
    .eq('week_index', weekIndex)
    .maybeSingle();
  if (error) {
    if (/curriculum_week_notes|schema cache|does not exist/i.test(error.message ?? '')) {
      return null;
    }
    throw error;
  }
  return data;
}

export async function loadCurriculumWeekNotesForWeek({ classIds, weekIndex }) {
  if (!classIds?.length || !weekIndex) return [];
  const { data, error } = await supabase
    .from('curriculum_week_notes')
    .select(`${WEEK_NOTE_SELECT}, curriculum_subjects ( name )`)
    .in('class_id', classIds)
    .eq('week_index', weekIndex)
    .neq('note', '');
  if (error) {
    if (/curriculum_week_notes|schema cache|does not exist/i.test(error.message ?? '')) {
      return [];
    }
    throw error;
  }
  return data ?? [];
}

export async function upsertCurriculumWeekNote({
  schoolId,
  classId,
  subjectId,
  weekIndex,
  note,
}) {
  const trimmed = String(note ?? '').trim();
  if (!trimmed) {
    const { error } = await supabase
      .from('curriculum_week_notes')
      .delete()
      .eq('class_id', classId)
      .eq('subject_id', subjectId)
      .eq('week_index', weekIndex);
    if (error) {
      if (/curriculum_week_notes|schema cache|does not exist/i.test(error.message ?? '')) {
        return null;
      }
      throw error;
    }
    return null;
  }

  const { data, error } = await supabase
    .from('curriculum_week_notes')
    .upsert(
      {
        school_id: schoolId,
        class_id: classId,
        subject_id: subjectId,
        week_index: weekIndex,
        note: trimmed,
      },
      { onConflict: 'class_id,subject_id,week_index' }
    )
    .select(WEEK_NOTE_SELECT)
    .single();
  if (error) throw error;
  return data;
}

export async function applyUnitProgressToClass({ classId, unitId, completed, questionsSolved }) {
  const { data, error } = await supabase.rpc('apply_unit_progress_to_class', {
    p_class_id: classId,
    p_unit_id: unitId,
    p_completed: completed,
    p_questions_solved: questionsSolved,
  });
  if (error) throw error;
  return data;
}

export async function upsertStudentUnitOverride({
  schoolId,
  studentId,
  unitId,
  completed,
  questionsSolved,
}) {
  const { error } = await supabase.from('student_unit_progress').upsert(
    {
      school_id: schoolId,
      student_id: studentId,
      unit_id: unitId,
      completed,
      questions_solved: questionsSolved,
      source: 'override',
    },
    { onConflict: 'student_id,unit_id' }
  );
  if (error) throw error;
}
