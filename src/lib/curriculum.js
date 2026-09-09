import { supabase } from './supabase';
import { withSchoolFilter } from './tenant';
import { addDaysIso, istanbulDateIso } from './calendar';
import { CURRICULUM_SUBJECT_DEFS } from './dersligCatalog.js';
import { teacherBranchBySlug } from './teacherBranches.js';

export const ACADEMIC_YEAR_ANCHOR = '2026-09-14';

export function formatAcademicYearLabel(anchor = ACADEMIC_YEAR_ANCHOR) {
  const [year] = anchor.split('-').map(Number);
  if (!Number.isFinite(year)) return 'Eğitim yılı';
  return `${year}–${year + 1}`;
}

export const SUBJECT_SELECT = 'id, grade, slug, name, color, icon, sort_order';
export const UNIT_SELECT = 'id, subject_id, title, sort_order, sections, duration_weeks';
export const CLASS_SELECT = 'id, school_id, grade, name';
export const ASSIGNMENT_ROW_SELECT = 'id, teacher_id, class_id, subject_id, created_at';
export const PROGRESS_SELECT =
  'id, school_id, student_id, unit_id, completed, questions_solved, source, updated_at';
export const WEEK_PLAN_SELECT = 'id, school_id, grade, week_index, subject_id, unit_id';
export const ACADEMIC_WEEKS = 52;
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

/** Atlas: Din Kültürü is only offered in 8th grade. */
export function isSubjectVisibleForGrade(subject, grade) {
  if (subject?.slug === 'din' && grade < 8) return false;
  return true;
}

export function filterSubjectsForGrade(subjects, grade) {
  return (subjects ?? []).filter(
    (subject) => subject.grade === grade && isSubjectVisibleForGrade(subject, grade)
  );
}

/** Display metadata for teacher branş (name, color, icon) from slug. */
export function getTeacherBransDisplay(profile) {
  const slug = getTeacherSubjectSlug(profile);
  if (!slug) return null;
  const def = teacherBranchBySlug(slug) ?? CURRICULUM_SUBJECT_DEFS.find((row) => row.slug === slug);
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

/** Last calendar week of the school year from school_start … school_end events. */
export function deriveAcademicWeeksFromCalendar(events, anchor = ACADEMIC_YEAR_ANCHOR) {
  const schoolEnds = (events ?? [])
    .filter((event) => event.event_type === 'school_end')
    .map((event) => event.ends_on ?? event.starts_on)
    .filter((iso) => iso && iso >= anchor)
    .sort();
  const lastEnd = schoolEnds.at(-1);
  if (!lastEnd) return ACADEMIC_WEEKS;
  return Math.max(1, Math.min(ACADEMIC_WEEKS, academicWeekIndex(lastEnd)));
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
        source: 'duration',
      };
    }
    cursor = spanEnd + 1;
  }

  return null;
}

export function getWeekPlanForSubject(weekPlans, { grade, weekIndex, subjectId }) {
  return (
    (weekPlans ?? []).find(
      (plan) =>
        plan.grade === grade &&
        plan.week_index === weekIndex &&
        plan.subject_id === subjectId
    ) ?? null
  );
}

/** School week plan when set; otherwise legacy duration-based schedule. */
export function resolvePlannedUnitForWeek({ weekPlans, units, subjectId, grade, weekIndex }) {
  if (!Number.isFinite(weekIndex) || weekIndex < 1) return null;

  const stored = getWeekPlanForSubject(weekPlans, { grade, weekIndex, subjectId });
  if (stored) {
    const unit = (units ?? []).find((row) => row.id === stored.unit_id);
    if (unit) {
      return { unit, source: 'plan', planId: stored.id };
    }
  }

  const subjectUnits = (units ?? []).filter((row) => row.subject_id === subjectId);
  return plannedUnitForWeek({ units: subjectUnits, weekIndex });
}

export function groupWeekPlansByUnit({
  weekPlans,
  units,
  subjectId,
  grade,
  academicWeeks = ACADEMIC_WEEKS,
}) {
  const assigned = (weekPlans ?? [])
    .filter(
      (plan) =>
        plan.subject_id === subjectId &&
        plan.grade === grade &&
        plan.week_index >= 1 &&
        plan.week_index <= academicWeeks
    )
    .sort((left, right) => left.week_index - right.week_index);

  if (!assigned.length) {
    return expandSubjectSchedule((units ?? []).filter((row) => row.subject_id === subjectId))
      .map((row) => ({
        ...row,
        spanEnd: Math.min(row.spanEnd, academicWeeks),
      }))
      .filter((row) => row.spanStart <= academicWeeks);
  }

  const rows = [];
  let current = null;

  for (const plan of assigned) {
    const unit = (units ?? []).find((row) => row.id === plan.unit_id);
    if (!unit) continue;

    if (
      current &&
      current.unit.id === unit.id &&
      plan.week_index === current.spanEnd + 1
    ) {
      current.spanEnd = plan.week_index;
      continue;
    }

    if (current) rows.push(current);
    current = { unit, spanStart: plan.week_index, spanEnd: plan.week_index };
  }

  if (current) rows.push(current);
  return rows;
}

export function countAssignedWeeksForSubject(weekPlans, grade, subjectId, academicWeeks = ACADEMIC_WEEKS) {
  let count = 0;
  for (let week = 1; week <= academicWeeks; week += 1) {
    if (getWeekPlanForSubject(weekPlans, { grade, weekIndex: week, subjectId })) {
      count += 1;
    }
  }
  return count;
}

/** Timeline spans from explicit week plans (includes unassigned gaps). */
export function buildYearTimelineFromAssignmentMap(assignmentMap, units, academicWeeks) {
  const spans = [];
  let current = null;

  for (let week = 1; week <= academicWeeks; week += 1) {
    const unitId = assignmentMap[week] ?? null;
    const unit = unitId ? (units ?? []).find((row) => row.id === unitId) ?? null : null;

    if (current && current.unitId === unitId && week === current.spanEnd + 1) {
      current.spanEnd = week;
      continue;
    }

    if (current) spans.push(current);
    current = {
      unitId,
      unit,
      spanStart: week,
      spanEnd: week,
      unassigned: !unitId,
    };
  }

  if (current) spans.push(current);
  return spans;
}

export function buildYearTimelineFromWeekPlans(
  weekPlans,
  units,
  { grade, subjectId, academicWeeks = ACADEMIC_WEEKS }
) {
  const spans = [];
  let current = null;

  for (let week = 1; week <= academicWeeks; week += 1) {
    const plan = getWeekPlanForSubject(weekPlans, { grade, weekIndex: week, subjectId });
    const unitId = plan?.unit_id ?? null;
    const unit = unitId ? (units ?? []).find((row) => row.id === unitId) ?? null : null;

    if (current && current.unitId === unitId && week === current.spanEnd + 1) {
      current.spanEnd = week;
      continue;
    }

    if (current) spans.push(current);
    current = {
      unitId,
      unit,
      spanStart: week,
      spanEnd: week,
      unassigned: !unitId,
    };
  }

  if (current) spans.push(current);
  return spans;
}

export function weekAssignmentsMapFromPlans(weekPlans, { grade, subjectId, academicWeeks }) {
  const map = {};
  for (let week = 1; week <= academicWeeks; week += 1) {
    const plan = getWeekPlanForSubject(weekPlans, { grade, weekIndex: week, subjectId });
    map[week] = plan?.unit_id ?? null;
  }
  return map;
}

export function serializeWeekAssignmentsMap(map, academicWeeks) {
  return JSON.stringify(
    Array.from({ length: academicWeeks }, (_, index) => map[index + 1] ?? null)
  );
}

export function weekAssignmentsMapToRows(map, academicWeeks) {
  return Array.from({ length: academicWeeks }, (_, index) => ({
    weekIndex: index + 1,
    unitId: map[index + 1] ?? null,
  }));
}

export function formatPlannedUnitBanner(plan) {
  if (!plan?.unit?.title) return null;
  if (plan.source === 'plan' || !plan.weekInSpan) return plan.unit.title;
  return `${plan.unit.title} · hafta ${plan.weekInSpan}/${plan.durationWeeks}`;
}

export async function loadSchoolWeekPlans(schoolId) {
  const { data, error } = await withSchoolFilter(
    supabase.from('curriculum_week_plans').select(WEEK_PLAN_SELECT),
    schoolId
  );
  if (error) throw error;
  return data ?? [];
}

export async function upsertSubjectWeekPlan({
  schoolId,
  grade,
  weekIndex,
  subjectId,
  unitId,
}) {
  const { error: deleteError } = await supabase
    .from('curriculum_week_plans')
    .delete()
    .eq('school_id', schoolId)
    .eq('grade', grade)
    .eq('week_index', weekIndex)
    .eq('subject_id', subjectId);
  if (deleteError) throw deleteError;

  if (!unitId) return null;

  const { data, error } = await supabase
    .from('curriculum_week_plans')
    .insert({
      school_id: schoolId,
      grade,
      week_index: weekIndex,
      subject_id: subjectId,
      unit_id: unitId,
    })
    .select(WEEK_PLAN_SELECT)
    .single();
  if (error) throw error;
  return data;
}

/** Week index → unit_id rows from ordered unit durations (week 1 onward). */
export function weekAssignmentsFromUnitSchedule(units) {
  const schedule = expandSubjectSchedule(units);
  const assignments = [];

  for (const row of schedule) {
    for (let week = row.spanStart; week <= Math.min(row.spanEnd, ACADEMIC_WEEKS); week += 1) {
      assignments.push({ weekIndex: week, unitId: row.unit.id });
    }
  }

  return assignments;
}

/** True when saved week plans differ from unit order + durations. */
export function scheduleDriftFromWeekPlans(weekPlans, units, { grade, subjectId }) {
  const expected = weekAssignmentsFromUnitSchedule(units);
  const expectedByWeek = new Map(expected.map((row) => [row.weekIndex, row.unitId]));

  for (const row of expected) {
    const plan = getWeekPlanForSubject(weekPlans, {
      grade,
      weekIndex: row.weekIndex,
      subjectId,
    });
    if (plan?.unit_id !== row.unitId) return true;
  }

  const extra = (weekPlans ?? []).filter(
    (plan) =>
      plan.grade === grade &&
      plan.subject_id === subjectId &&
      !expectedByWeek.has(plan.week_index)
  );
  return extra.length > 0;
}

export async function replaceSubjectWeekPlans({
  schoolId,
  grade,
  subjectId,
  assignments,
  academicWeeks = ACADEMIC_WEEKS,
}) {
  const { error: deleteError } = await supabase
    .from('curriculum_week_plans')
    .delete()
    .eq('school_id', schoolId)
    .eq('grade', grade)
    .eq('subject_id', subjectId);
  if (deleteError) throw deleteError;

  const rows = (assignments ?? [])
    .filter(
      (row) =>
        row.unitId && row.weekIndex >= 1 && row.weekIndex <= clampAcademicWeekCount(academicWeeks)
    )
    .map((row) => ({
      school_id: schoolId,
      grade,
      week_index: row.weekIndex,
      subject_id: subjectId,
      unit_id: row.unitId,
    }));

  if (!rows.length) return [];

  const { data, error } = await supabase
    .from('curriculum_week_plans')
    .insert(rows)
    .select(WEEK_PLAN_SELECT);
  if (error) throw error;
  return data ?? [];
}

/** Replace all week plans for one subject from unit order + duration_weeks. */
export async function syncSubjectWeekPlansFromSchedule({ schoolId, grade, subjectId, units }) {
  const assignments = weekAssignmentsFromUnitSchedule(units);
  return replaceSubjectWeekPlans({ schoolId, grade, subjectId, assignments });
}

export async function assignSubjectWeekSpan({
  schoolId,
  grade,
  subjectId,
  spanStart,
  spanEnd,
  unitId,
}) {
  const saved = [];
  for (let week = spanStart; week <= spanEnd; week += 1) {
    const row = await upsertSubjectWeekPlan({
      schoolId,
      grade,
      weekIndex: week,
      subjectId,
      unitId,
    });
    if (row) saved.push(row);
  }
  return saved;
}

/** Collapse consecutive weeks with the same assigned unit (or empty). */
export function groupWeekAssignmentsForDisplay(weekPlans, { grade, subjectId }) {
  const spans = [];
  let current = null;

  for (let week = 1; week <= ACADEMIC_WEEKS; week += 1) {
    const plan = getWeekPlanForSubject(weekPlans, { grade, weekIndex: week, subjectId });
    const unitId = plan?.unit_id ?? null;

    if (current && current.unitId === unitId && week === current.spanEnd + 1) {
      current.spanEnd = week;
      continue;
    }

    if (current) spans.push(current);
    current = { spanStart: week, spanEnd: week, unitId };
  }

  if (current) spans.push(current);
  return spans;
}

export function expandSubjectSchedule(units) {
  const ordered = [...(units ?? [])].sort(
    (left, right) => (left.sort_order ?? 0) - (right.sort_order ?? 0)
  );
  let cursor = 1;

  return ordered.map((unit) => {
    const durationWeeks = clampDurationWeeks(unit.duration_weeks);
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

export function sumUnitScheduleWeeks(units) {
  return expandSubjectSchedule(units).reduce((total, row) => total + row.durationWeeks, 0);
}

export function clampDurationWeeks(value) {
  const parsed = Number.parseInt(String(value), 10);
  if (!Number.isFinite(parsed)) return 1;
  return Math.max(1, Math.min(20, parsed));
}

export function clampAcademicWeekCount(value, fallback = ACADEMIC_WEEKS) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(1, Math.min(ACADEMIC_WEEKS, parsed));
}

export function scheduleExceedsAcademicYear(units) {
  return sumUnitScheduleWeeks(units) > ACADEMIC_WEEKS;
}

function isDraftUnitId(id) {
  return typeof id === 'string' && id.startsWith('draft-');
}

/**
 * Save ordered unit rows for one subject. Updates titles/durations/order, inserts new rows,
 * deletes removed rows. Uses temporary sort_order values to satisfy unique constraints.
 */
export async function saveCurriculumSubjectPlan(subjectId, rows, { existingUnitIds = [] } = {}) {
  const normalized = (rows ?? [])
    .map((row, index) => ({
      id: row.id,
      title: String(row.title ?? '').trim(),
      duration_weeks: clampDurationWeeks(row.duration_weeks),
      sort_order: index + 1,
      sections: Array.isArray(row.sections) ? row.sections : [],
    }))
    .filter((row) => row.title.length > 0);

  if (!normalized.length && existingUnitIds.length) {
    const { error } = await supabase.from('curriculum_units').delete().eq('subject_id', subjectId);
    if (error) throw error;
    return [];
  }

  const keptIds = new Set(
    normalized.filter((row) => row.id && !isDraftUnitId(row.id)).map((row) => row.id)
  );
  const deleteIds = (existingUnitIds ?? []).filter((id) => !keptIds.has(id));

  if (deleteIds.length) {
    const { error } = await supabase.from('curriculum_units').delete().in('id', deleteIds);
    if (error) throw error;
  }

  const existingRows = normalized.filter((row) => row.id && !isDraftUnitId(row.id));
  for (const row of existingRows) {
    const { error } = await supabase
      .from('curriculum_units')
      .update({ sort_order: 1000 + row.sort_order })
      .eq('id', row.id);
    if (error) throw error;
  }

  for (const row of normalized) {
    if (row.id && !isDraftUnitId(row.id)) {
      const { error } = await supabase
        .from('curriculum_units')
        .update({
          title: row.title,
          duration_weeks: row.duration_weeks,
          sort_order: row.sort_order,
          sections: row.sections,
        })
        .eq('id', row.id);
      if (error) throw error;
      continue;
    }

    const { error } = await supabase.from('curriculum_units').insert({
      subject_id: subjectId,
      title: row.title,
      duration_weeks: row.duration_weeks,
      sort_order: row.sort_order,
      sections: row.sections,
    });
    if (error) throw error;
  }

  const { data, error: reloadError } = await supabase
    .from('curriculum_units')
    .select(UNIT_SELECT)
    .eq('subject_id', subjectId)
    .order('sort_order', { ascending: true });
  if (reloadError) throw reloadError;
  return data ?? [];
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

/** Shared load for Atlas yoklama, teacher müfredat, veli ekranları. */
export async function loadCurriculumContext(schoolId) {
  const catalog = await loadCurriculumCatalog();
  let weekPlans = [];

  if (schoolId) {
    const plansRes = await withSchoolFilter(
      supabase.from('curriculum_week_plans').select(WEEK_PLAN_SELECT),
      schoolId
    );
    if (plansRes.error) {
      const message = plansRes.error.message ?? '';
      if (!/subject_id|curriculum_week_plans|schema cache|does not exist/i.test(message)) {
        throw plansRes.error;
      }
    } else {
      weekPlans = plansRes.data ?? [];
    }
  }

  return {
    subjects: catalog.subjects,
    units: catalog.units,
    weekPlans,
  };
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

export async function loadStudentsForSchool(schoolId) {
  if (!schoolId) return [];
  const { data, error } = await withSchoolFilter(
    supabase
      .from('students')
      .select('id, full_name, grade, class_id')
      .order('full_name'),
    schoolId
  );
  if (error) throw error;
  return data ?? [];
}

export async function loadStudentsForTeacherAssignments(teacherId, schoolId, { atlasSchedule = false } = {}) {
  if (atlasSchedule) return loadStudentsForSchool(schoolId);
  if (!teacherId) return [];

  const assignments = await loadTeacherAssignments(teacherId);
  const classIds = [...new Set(assignments.map((row) => row.class_id).filter(Boolean))];
  if (!classIds.length) return [];

  const { data, error } = await withSchoolFilter(
    supabase
      .from('students')
      .select('id, full_name, grade, class_id')
      .in('class_id', classIds)
      .order('full_name'),
    schoolId
  );
  if (error) throw error;
  return data ?? [];
}

function subjectIdForClassAccess(subjects, subjectSlug, classGrade) {
  const exact = resolveSubjectForClass(subjects, subjectSlug, classGrade);
  if (exact) return exact.id;
  return filterSubjectsForGrade(subjects, classGrade)[0]?.id ?? null;
}

/** Atlas: every teacher can see every şube. Inserts missing teacher_assignments. */
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

  return insertTeacherAssignmentRows(db, rows);
}

function isIgnorableAssignmentInsertError(message = '') {
  return /unique|duplicate|23505|role 'teacher'/i.test(message);
}

async function insertTeacherAssignmentRows(db, rows) {
  const { error: insertError } = await db.from('teacher_assignments').insert(rows);
  if (!insertError) return { inserted: rows.length };
  if (!isIgnorableAssignmentInsertError(insertError.message ?? '')) throw insertError;

  let inserted = 0;
  for (const row of rows) {
    const { error } = await db.from('teacher_assignments').insert(row);
    if (!error) {
      inserted += 1;
      continue;
    }
    if (!isIgnorableAssignmentInsertError(error.message ?? '')) throw error;
  }
  return { inserted };
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
