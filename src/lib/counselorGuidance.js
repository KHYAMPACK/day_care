import { supabase } from './supabase';
import { currentAcademicYear } from './homework';

export const QUESTION_ROW_SELECT =
  'id, week_id, subject_code, topic_label, source_name, target_count, solved_count, correct_count, wrong_count, blank_count, completion_status, sort_order';
export const WEEK_SELECT =
  'id, school_id, student_id, week_index, academic_year, notes, updated_by, created_at, updated_at';
export const SCHEDULE_BLOCK_SELECT =
  'id, week_id, day_of_week, start_time, end_time, label, subject_code, is_done, sort_order';
export const TOPIC_RESOURCE_SELECT =
  'id, school_id, student_id, subject_id, topic_key, topic_label, resource_name, status, updated_at';

export const COMPLETION_STATUSES = [
  { value: 'not_done', label: 'Yapılmadı' },
  { value: 'partial', label: 'Yarım' },
  { value: 'done', label: 'Yapıldı' },
];

export const RESOURCE_STATUSES = [
  { value: 'not_started', label: 'Başlamadı' },
  { value: 'in_progress', label: 'Devam' },
  { value: 'done', label: 'Tamam' },
];

export const DAY_LABELS = {
  1: 'Pazartesi',
  2: 'Salı',
  3: 'Çarşamba',
  4: 'Perşembe',
  5: 'Cuma',
  6: 'Cumartesi',
  7: 'Pazar',
};

function isMissingGuidanceTable(error) {
  return /counselor_guidance|counselor_weekly|counselor_topic|counselor_study|schema cache|does not exist/i.test(
    error?.message ?? ''
  );
}

function normalizeTime(value) {
  if (!value) return '13:30:00';
  const trimmed = String(value).trim();
  if (/^\d{2}:\d{2}$/.test(trimmed)) return `${trimmed}:00`;
  return trimmed;
}

function timeToInput(value) {
  if (!value) return '13:30';
  return String(value).slice(0, 5);
}

export function emptyQuestionRow(sortOrder = 0) {
  return {
    subject_code: '',
    topic_label: '',
    source_name: '',
    target_count: '',
    solved_count: '',
    correct_count: '',
    wrong_count: '',
    blank_count: '',
    completion_status: 'not_done',
    sort_order: sortOrder,
  };
}

export function emptyScheduleBlock(sortOrder = 0) {
  return {
    day_of_week: 1,
    start_time: '13:30',
    end_time: '14:30',
    label: '',
    subject_code: '',
    is_done: false,
    sort_order: sortOrder,
  };
}

export async function loadGuidanceWeekPack({
  schoolId,
  studentId,
  weekIndex,
  academicYear = currentAcademicYear(),
}) {
  if (!schoolId || !studentId || !weekIndex) {
    return { week: null, questionRows: [], scheduleBlocks: [] };
  }

  const { data: weekRows, error: weekError } = await supabase
    .from('counselor_guidance_weeks')
    .select(WEEK_SELECT)
    .eq('school_id', schoolId)
    .eq('student_id', studentId)
    .eq('week_index', weekIndex)
    .eq('academic_year', academicYear)
    .maybeSingle();

  if (weekError) {
    if (isMissingGuidanceTable(weekError)) {
      return { week: null, questionRows: [], scheduleBlocks: [] };
    }
    throw weekError;
  }

  if (!weekRows) {
    return { week: null, questionRows: [], scheduleBlocks: [] };
  }

  const [questionRes, scheduleRes] = await Promise.all([
    supabase
      .from('counselor_weekly_question_rows')
      .select(QUESTION_ROW_SELECT)
      .eq('week_id', weekRows.id)
      .order('sort_order'),
    supabase
      .from('counselor_study_schedule_blocks')
      .select(SCHEDULE_BLOCK_SELECT)
      .eq('week_id', weekRows.id)
      .order('day_of_week')
      .order('sort_order'),
  ]);

  if (questionRes.error && !isMissingGuidanceTable(questionRes.error)) throw questionRes.error;
  if (scheduleRes.error && !isMissingGuidanceTable(scheduleRes.error)) throw scheduleRes.error;

  return {
    week: weekRows,
    questionRows: (questionRes.data ?? []).map((row) => ({
      ...row,
      target_count: row.target_count ?? '',
      solved_count: row.solved_count ?? '',
      correct_count: row.correct_count ?? '',
      wrong_count: row.wrong_count ?? '',
      blank_count: row.blank_count ?? '',
    })),
    scheduleBlocks: (scheduleRes.data ?? []).map((row) => ({
      ...row,
      start_time: timeToInput(row.start_time),
      end_time: timeToInput(row.end_time),
    })),
  };
}

export async function saveGuidanceWeekPack({
  schoolId,
  studentId,
  weekIndex,
  academicYear = currentAcademicYear(),
  notes = '',
  questionRows = [],
  scheduleBlocks = [],
  updatedBy = null,
}) {
  const weekPayload = {
    school_id: schoolId,
    student_id: studentId,
    week_index: weekIndex,
    academic_year: academicYear,
    notes: notes?.trim() || null,
    updated_by: updatedBy,
    updated_at: new Date().toISOString(),
  };

  const { data: weekRow, error: weekError } = await supabase
    .from('counselor_guidance_weeks')
    .upsert(weekPayload, { onConflict: 'school_id,student_id,week_index,academic_year' })
    .select(WEEK_SELECT)
    .single();

  if (weekError) throw weekError;

  const weekId = weekRow.id;

  await supabase.from('counselor_weekly_question_rows').delete().eq('week_id', weekId);
  await supabase.from('counselor_study_schedule_blocks').delete().eq('week_id', weekId);

  const questionPayload = (questionRows ?? [])
    .filter((row) => row.subject_code || row.topic_label || row.source_name)
    .map((row, index) => ({
      week_id: weekId,
      subject_code: row.subject_code || null,
      topic_label: row.topic_label?.trim() || null,
      source_name: row.source_name?.trim() || null,
      target_count: parseCount(row.target_count),
      solved_count: parseCount(row.solved_count),
      correct_count: parseCount(row.correct_count),
      wrong_count: parseCount(row.wrong_count),
      blank_count: parseCount(row.blank_count),
      completion_status: row.completion_status ?? 'not_done',
      sort_order: row.sort_order ?? index,
    }));

  if (questionPayload.length) {
    const { error } = await supabase.from('counselor_weekly_question_rows').insert(questionPayload);
    if (error) throw error;
  }

  const schedulePayload = (scheduleBlocks ?? [])
    .filter((row) => row.label?.trim())
    .map((row, index) => ({
      week_id: weekId,
      day_of_week: Number(row.day_of_week) || 1,
      start_time: normalizeTime(row.start_time),
      end_time: normalizeTime(row.end_time),
      label: row.label.trim(),
      subject_code: row.subject_code || null,
      is_done: Boolean(row.is_done),
      sort_order: row.sort_order ?? index,
    }));

  if (schedulePayload.length) {
    const { error } = await supabase.from('counselor_study_schedule_blocks').insert(schedulePayload);
    if (error) throw error;
  }

  return loadGuidanceWeekPack({ schoolId, studentId, weekIndex, academicYear });
}

function parseCount(value) {
  if (value === '' || value == null) return null;
  const n = Number(value);
  return Number.isNaN(n) ? null : Math.max(0, Math.floor(n));
}

export async function loadTopicResourceMatrix({ studentId, subjectId }) {
  if (!studentId || !subjectId) return [];

  const { data, error } = await supabase
    .from('counselor_topic_resource_cells')
    .select(TOPIC_RESOURCE_SELECT)
    .eq('student_id', studentId)
    .eq('subject_id', subjectId);

  if (error) {
    if (isMissingGuidanceTable(error)) return [];
    throw error;
  }
  return data ?? [];
}

export async function upsertTopicResourceCell({
  schoolId,
  studentId,
  subjectId,
  topicKey,
  topicLabel,
  resourceName,
  status,
  updatedBy = null,
}) {
  const payload = {
    school_id: schoolId,
    student_id: studentId,
    subject_id: subjectId,
    topic_key: topicKey,
    topic_label: topicLabel,
    resource_name: resourceName.trim(),
    status: status ?? 'not_started',
    updated_by: updatedBy,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from('counselor_topic_resource_cells')
    .upsert(payload, { onConflict: 'student_id,subject_id,topic_key,resource_name' })
    .select(TOPIC_RESOURCE_SELECT)
    .single();

  if (error) throw error;
  return data;
}

export async function deleteTopicResourceColumn({ studentId, subjectId, resourceName }) {
  const { error } = await supabase
    .from('counselor_topic_resource_cells')
    .delete()
    .eq('student_id', studentId)
    .eq('subject_id', subjectId)
    .eq('resource_name', resourceName.trim());

  if (error) throw error;
}

export async function copyGuidanceWeekFromPrevious({
  schoolId,
  studentId,
  weekIndex,
  academicYear = currentAcademicYear(),
  updatedBy = null,
}) {
  if (weekIndex <= 1) return null;

  const previous = await loadGuidanceWeekPack({
    schoolId,
    studentId,
    weekIndex: weekIndex - 1,
    academicYear,
  });

  if (!previous.week && !previous.questionRows.length && !previous.scheduleBlocks.length) {
    return null;
  }

  return saveGuidanceWeekPack({
    schoolId,
    studentId,
    weekIndex,
    academicYear,
    notes: previous.week?.notes ?? '',
    questionRows: previous.questionRows.map((row) => ({
      ...row,
      id: undefined,
      week_id: undefined,
      solved_count: '',
      correct_count: '',
      wrong_count: '',
      blank_count: '',
      completion_status: 'not_done',
    })),
    scheduleBlocks: previous.scheduleBlocks.map((row) => ({
      ...row,
      id: undefined,
      week_id: undefined,
      is_done: false,
    })),
    updatedBy,
  });
}

export function loadDemoGuidancePack(storageKey) {
  try {
    const raw = sessionStorage.getItem(storageKey);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function saveDemoGuidancePack(storageKey, pack) {
  sessionStorage.setItem(storageKey, JSON.stringify(pack));
}
