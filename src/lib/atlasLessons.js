import { supabase } from './supabase';
import { withSchoolFilter } from './tenant';
import { istanbulDateIso } from './calendar';
import { academicWeekIndex, weekRangeIso, SUBJECT_SELECT } from './curriculum';
import { addDaysIso } from './calendar';
import {
  loadClassRoster,
  snapshotForDate,
  aggregateStudentAttendance,
  summarizeAttendanceSessions,
} from './attendance';

export const ATLAS_SLOT_COUNT = 4;

export const SESSION_SELECT =
  'id, school_id, class_id, subject_id, slot_index, session_date, taken_by, week_index, unit_id, lesson_type, assessment_type_id, questions_total, activity_completed_at, activity_dismissed_at, created_at, updated_at';

export const ATTENDANCE_SELECT = 'id, session_id, student_id, status';
export const RESULT_SELECT = 'id, session_id, student_id, wrong_count, blank_count';

const NON_SCHOOL_EVENT_TYPES = new Set(['holiday', 'school_end']);

export function nextEmptySlotIndex(filledSlots) {
  for (let slot = 1; slot <= ATLAS_SLOT_COUNT; slot += 1) {
    if (!filledSlots.includes(slot)) return slot;
  }
  return null;
}

export function isAtlasLiveLoggingOpen(now = new Date()) {
  const istanbulHour = Number(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/Istanbul',
      hour: 'numeric',
      hour12: false,
    }).format(now)
  );
  return istanbulHour < 20;
}

/** Live = same calendar day; after midnight prior days move to telafi. */
export function splitQuestionSessionsByEntryWindow(sessions, today = istanbulDateIso()) {
  const live = [];
  const catchUp = [];
  for (const session of sessions) {
    if (session.session_date === today) {
      live.push(session);
    } else if (session.session_date < today) {
      catchUp.push(session);
    }
  }
  return { live, catchUp };
}

export function isSchoolDay(isoDate, events = []) {
  const blocking = (events ?? []).filter((event) => {
    if (!NON_SCHOOL_EVENT_TYPES.has(event.event_type)) return false;
    return event.starts_on <= isoDate && event.ends_on >= isoDate;
  });
  return blocking.length === 0;
}

export async function loadClassSessionsForDate(classId, sessionDate) {
  const { data, error } = await supabase
    .from('lesson_sessions')
    .select(
      `${SESSION_SELECT}, profiles:taken_by ( full_name ), curriculum_subjects ( name )`
    )
    .eq('class_id', classId)
    .eq('session_date', sessionDate)
    .order('slot_index');
  if (error) throw error;
  return data ?? [];
}

export async function loadTeacherSessionsForDate(teacherId, sessionDate) {
  const { data, error } = await supabase
    .from('lesson_sessions')
    .select(SESSION_SELECT)
    .eq('taken_by', teacherId)
    .eq('session_date', sessionDate)
    .order('slot_index');
  if (error) throw error;
  return data ?? [];
}

export async function loadTeacherSessionsForWeek(teacherId, weekIndex) {
  const { data, error } = await supabase
    .from('lesson_sessions')
    .select(SESSION_SELECT)
    .eq('taken_by', teacherId)
    .eq('week_index', weekIndex)
    .order('session_date')
    .order('slot_index');
  if (error) throw error;
  return data ?? [];
}

export async function loadSessionDetails(sessionId) {
  const { data: session, error: sessionError } = await supabase
    .from('lesson_sessions')
    .select(
      `${SESSION_SELECT}, classes ( grade, name ), curriculum_subjects ( name )`
    )
    .eq('id', sessionId)
    .maybeSingle();
  if (sessionError) throw sessionError;
  if (!session) return { session: null, attendance: [], results: [] };

  const [attendanceRes, resultsRes] = await Promise.all([
    supabase.from('lesson_attendance').select(ATTENDANCE_SELECT).eq('session_id', sessionId),
    supabase.from('lesson_results').select(RESULT_SELECT).eq('session_id', sessionId),
  ]);
  if (attendanceRes.error) throw attendanceRes.error;
  if (resultsRes.error) throw resultsRes.error;

  return {
    session,
    attendance: attendanceRes.data ?? [],
    results: resultsRes.data ?? [],
  };
}

export async function saveAtlasLessonAttendance({
  classId,
  subjectId,
  sessionDate,
  slotIndex,
  weekIndex,
  unitId,
  records,
  sessionId,
}) {
  const { data, error } = await supabase.rpc('save_atlas_lesson_attendance', {
    p_class_id: classId,
    p_subject_id: subjectId,
    p_session_date: sessionDate,
    p_slot_index: slotIndex,
    p_week_index: weekIndex,
    p_unit_id: unitId ?? null,
    p_records: records,
    p_session_id: sessionId ?? null,
  });
  if (error) throw error;
  return data;
}

export async function saveAtlasLessonActivity({
  sessionId,
  lessonType,
  assessmentTypeId,
  questionsTotal,
  results,
}) {
  const { data, error } = await supabase.rpc('save_atlas_lesson_activity', {
    p_session_id: sessionId,
    p_lesson_type: lessonType,
    p_assessment_type_id: assessmentTypeId ?? null,
    p_questions_total: questionsTotal ?? null,
    p_results: results ?? [],
  });
  if (error) throw error;
  return data;
}

export async function dismissAtlasLessonActivity(sessionId) {
  const { data, error } = await supabase.rpc('dismiss_atlas_lesson_activity', {
    p_session_id: sessionId,
  });
  if (error) throw error;
  return data;
}

export function buildAttendanceRecords(students, absentIds) {
  return students.map((student) => ({
    student_id: student.id,
    status: absentIds.has(student.id) ? 'absent' : 'present',
  }));
}

export function resolveLessonDate({ catchUpDate, calendarEvents }) {
  const today = istanbulDateIso();
  if (catchUpDate) {
    if (!isSchoolDay(catchUpDate, calendarEvents)) return null;
    return catchUpDate;
  }
  if (!isSchoolDay(today, calendarEvents)) return null;
  return today;
}

export function canLiveLogForDate(sessionDate) {
  const today = istanbulDateIso();
  if (sessionDate !== today) return false;
  return isAtlasLiveLoggingOpen();
}

/** Same-week yoklama: live until 20:00 today, or any earlier school day in the current week. */
export function canLogAtlasSession(sessionDate, calendarEvents = []) {
  if (!sessionDate || !isSchoolDay(sessionDate, calendarEvents)) return false;
  const today = istanbulDateIso();
  const currentWeek = academicWeekIndex(today);
  if (academicWeekIndex(sessionDate) !== currentWeek) return false;
  if (sessionDate > today) return false;
  if (sessionDate === today) return isAtlasLiveLoggingOpen();
  return true;
}

export function schoolDaysInWeek(weekIndex, calendarEvents = [], { maxDate } = {}) {
  const cap = maxDate ?? istanbulDateIso();
  const { start, end } = weekRangeIso(weekIndex);
  const last = end < cap ? end : cap;
  const days = [];
  for (let iso = start; iso <= last; iso = addDaysIso(iso, 1)) {
    if (isSchoolDay(iso, calendarEvents)) days.push(iso);
  }
  return days;
}

export async function loadTeacherWeekSessions(teacherId, weekIndex) {
  const { data, error } = await supabase
    .from('lesson_sessions')
    .select(
      `${SESSION_SELECT}, classes ( grade, name ), curriculum_subjects ( name )`
    )
    .eq('taken_by', teacherId)
    .eq('week_index', weekIndex)
    .order('session_date')
    .order('slot_index');
  if (error) throw error;
  return data ?? [];
}

function sortSessionsNewestFirst(a, b) {
  if (a.session_date !== b.session_date) {
    return b.session_date.localeCompare(a.session_date);
  }
  return b.slot_index - a.slot_index;
}

export async function loadTeacherWeekQuestionSessions(teacherId, weekIndex) {
  const sessions = await loadTeacherWeekSessions(teacherId, weekIndex);
  if (!sessions.length) {
    return { live: [], catchUp: [], pending: [], completed: [] };
  }

  const attendance = await loadAtlasAttendanceForSessions(sessions.map((row) => row.id));
  const withAttendance = new Set(attendance.map((row) => row.session_id));
  const eligible = sessions.filter((row) => withAttendance.has(row.id));

  const pending = eligible
    .filter((row) => !row.activity_completed_at)
    .sort(sortSessionsNewestFirst);
  const completed = eligible
    .filter((row) => row.activity_completed_at)
    .sort(sortSessionsNewestFirst);
  const { live, catchUp } = splitQuestionSessionsByEntryWindow(pending);

  return { live, catchUp, pending, completed };
}

export async function loadTeacherSessionsNeedingQuestions(teacherId, weekIndex) {
  const { pending } = await loadTeacherWeekQuestionSessions(teacherId, weekIndex);
  return pending;
}

export { loadClassRoster, snapshotForDate, academicWeekIndex };

export async function loadAssessmentTypes(schoolId) {
  const { data, error } = await withSchoolFilter(
    supabase
      .from('assessment_types')
      .select('id, name, slug, sort_order, is_active')
      .eq('is_active', true)
      .order('sort_order'),
    schoolId
  );
  if (error) throw error;
  return data ?? [];
}

export async function loadAtlasSessionsForWeek(schoolId, weekIndex, classId) {
  let query = supabase
    .from('lesson_sessions')
    .select(SESSION_SELECT)
    .eq('week_index', weekIndex);
  if (classId) query = query.eq('class_id', classId);
  const { data, error } = await withSchoolFilter(query, schoolId);
  if (error) throw error;
  return data ?? [];
}

export async function loadAtlasAttendanceForSessions(sessionIds) {
  if (!sessionIds.length) return [];
  const { data, error } = await supabase
    .from('lesson_attendance')
    .select(ATTENDANCE_SELECT)
    .in('session_id', sessionIds);
  if (error) throw error;
  return data ?? [];
}

export async function loadAtlasResultsForSessions(sessionIds) {
  if (!sessionIds.length) return [];
  const { data, error } = await supabase
    .from('lesson_results')
    .select(`${RESULT_SELECT}, assessment:session_id`)
    .in('session_id', sessionIds);
  if (error) throw error;
  return data ?? [];
}

export async function loadAtlasForWeek({ schoolId, classIds, weekIndex }) {
  if (!classIds?.length || !weekIndex) {
    return { sessions: [], attendance: [], results: [], assessmentTypes: [] };
  }
  const { data: sessions, error: sessionsError } = await withSchoolFilter(
    supabase
      .from('lesson_sessions')
      .select(SESSION_SELECT)
      .eq('week_index', weekIndex)
      .in('class_id', classIds),
    schoolId
  );
  if (sessionsError) throw sessionsError;
  const sessionIds = (sessions ?? []).map((row) => row.id);
  const [attendance, results, assessmentTypes] = await Promise.all([
    loadAtlasAttendanceForSessions(sessionIds),
    sessionIds.length
      ? supabase.from('lesson_results').select(RESULT_SELECT).in('session_id', sessionIds)
      : Promise.resolve({ data: [], error: null }),
    loadAssessmentTypes(schoolId),
  ]);
  if (results.error) throw results.error;
  return {
    sessions: sessions ?? [],
    attendance,
    results: results.data ?? [],
    assessmentTypes,
  };
}

export async function loadAtlasAttendanceForDateRange({ schoolId, classIds, startOn, endOn }) {
  if (!classIds?.length) return { sessions: [], attendance: [] };

  const { data: sessions, error: sessionError } = await withSchoolFilter(
    supabase
      .from('lesson_sessions')
      .select(SESSION_SELECT)
      .in('class_id', classIds)
      .gte('session_date', startOn)
      .lte('session_date', endOn),
    schoolId
  );
  if (sessionError) throw sessionError;
  const sessionRows = sessions ?? [];
  if (!sessionRows.length) return { sessions: [], attendance: [] };

  const attendance = await loadAtlasAttendanceForSessions(sessionRows.map((row) => row.id));
  return { sessions: sessionRows, attendance };
}

/**
 * Director "Yoklama" data for atlas_schedule schools: lesson_sessions/lesson_attendance
 * instead of attendance_sessions/attendance_records, since teachers there log attendance
 * through the Ders (slot) flow, not the plain Yoklama tab. Reuses the same aggregation
 * shape as loadDirectorAttendanceData by mapping session_date onto taken_on.
 */
export async function loadAtlasDirectorAttendanceData({
  schoolId,
  classId,
  subjectId,
  startOn,
  endOn,
  students = [],
  classes = [],
}) {
  const classIds = classId ? [classId] : classes.map((klass) => klass.id);
  const { sessions, attendance } = await loadAtlasAttendanceForDateRange({
    schoolId,
    classIds,
    startOn,
    endOn,
  });

  let filteredSessions = sessions;
  if (subjectId) {
    filteredSessions = filteredSessions.filter((session) => session.subject_id === subjectId);
  }

  const sessionIds = new Set(filteredSessions.map((session) => session.id));
  const filteredRecords = attendance.filter((row) => sessionIds.has(row.session_id));

  const subjectIds = [...new Set(filteredSessions.map((session) => session.subject_id))];
  let subjects = [];
  if (subjectIds.length) {
    const { data, error } = await supabase
      .from('curriculum_subjects')
      .select(SUBJECT_SELECT)
      .in('id', subjectIds);
    if (error) throw error;
    subjects = data ?? [];
  }

  const scopedStudents = classId
    ? students.filter((student) => student.class_id === classId)
    : students;

  const normalizedSessions = filteredSessions.map((session) => ({
    ...session,
    taken_on: session.session_date,
  }));

  return {
    sessions: normalizedSessions,
    records: filteredRecords,
    subjects,
    studentStats: aggregateStudentAttendance({
      sessions: normalizedSessions,
      records: filteredRecords,
      students: scopedStudents,
      classes,
    }),
    sessionSummaries: summarizeAttendanceSessions({
      sessions: normalizedSessions,
      records: filteredRecords,
      students: scopedStudents,
      classes,
      subjects,
    }),
  };
}
