import { supabase } from './supabase';
import { withSchoolFilter } from './tenant';
import { addDaysIso, formatCalendarDateTr, istanbulDateIso } from './calendar';
import {
  CLASS_SELECT,
  SUBJECT_SELECT,
  UNIT_SELECT,
  academicWeekIndex,
  formatClassLabel,
  plannedUnitForWeek,
} from './curriculum';

export const ATTENDANCE_FLAG_THRESHOLD = 2;

export const SESSION_SELECT =
  'id, school_id, class_id, subject_id, taken_on, taken_by, week_index, unit_id, created_at, updated_at';
export const RECORD_SELECT = 'id, session_id, student_id, status';

export async function loadClassRoster(schoolId, classId) {
  if (!classId) return [];
  const { data, error } = await withSchoolFilter(
    supabase.from('students').select('id, full_name, class_id').eq('class_id', classId).order('full_name'),
    schoolId
  );
  if (error) throw error;
  return data ?? [];
}

export async function loadAttendanceSession({ classId, subjectId, takenOn }) {
  const { data: session, error: sessionError } = await supabase
    .from('attendance_sessions')
    .select(SESSION_SELECT)
    .eq('class_id', classId)
    .eq('subject_id', subjectId)
    .eq('taken_on', takenOn)
    .maybeSingle();
  if (sessionError) throw sessionError;
  if (!session) return { session: null, records: [] };

  const { data: records, error: recordsError } = await supabase
    .from('attendance_records')
    .select(RECORD_SELECT)
    .eq('session_id', session.id);
  if (recordsError) throw recordsError;
  return { session, records: records ?? [] };
}

export async function saveClassAttendance({ classId, subjectId, takenOn, weekIndex, unitId, records }) {
  const { data, error } = await supabase.rpc('save_class_attendance', {
    p_class_id: classId,
    p_subject_id: subjectId,
    p_taken_on: takenOn,
    p_week_index: weekIndex,
    p_unit_id: unitId,
    p_records: records,
  });
  if (error) throw error;
  return data;
}

export function snapshotForDate({ units, takenOn }) {
  const weekIndex = academicWeekIndex(takenOn);
  const planned = plannedUnitForWeek({ units, weekIndex });
  return {
    weekIndex,
    unitId: planned?.unit?.id ?? null,
    planned,
  };
}

export function groupMissedTopicFlags(sessions, records, { students, classes, subjects, units } = {}) {
  const sessionById = Object.fromEntries((sessions ?? []).map((session) => [session.id, session]));
  const studentById = Object.fromEntries((students ?? []).map((student) => [student.id, student]));
  const classById = Object.fromEntries((classes ?? []).map((klass) => [klass.id, klass]));
  const subjectById = Object.fromEntries((subjects ?? []).map((subject) => [subject.id, subject]));
  const unitById = Object.fromEntries((units ?? []).map((unit) => [unit.id, unit]));

  const buckets = new Map();
  for (const record of records ?? []) {
    if (record.status !== 'absent') continue;
    const session = sessionById[record.session_id];
    if (!session?.unit_id) continue;
    const key = `${record.student_id}:${session.unit_id}`;
    const existing = buckets.get(key);
    if (existing) {
      existing.absentCount += 1;
      continue;
    }
    buckets.set(key, {
      studentId: record.student_id,
      unitId: session.unit_id,
      classId: session.class_id,
      subjectId: session.subject_id,
      absentCount: 1,
    });
  }

  return [...buckets.values()]
    .filter((row) => row.absentCount >= ATTENDANCE_FLAG_THRESHOLD)
    .map((row) => {
      const student = studentById[row.studentId];
      const klass = classById[row.classId];
      const subject = subjectById[row.subjectId];
      const unit = unitById[row.unitId];
      return {
        ...row,
        studentName: student?.full_name ?? 'Öğrenci',
        classLabel: klass ? formatClassLabel(klass.grade, klass.name) : '',
        subjectName: subject?.name ?? 'Ders',
        unitTitle: unit?.title ?? 'Konu',
      };
    })
    .sort((left, right) => {
      const nameCmp = left.studentName.localeCompare(right.studentName, 'tr');
      if (nameCmp !== 0) return nameCmp;
      const subjectCmp = left.subjectName.localeCompare(right.subjectName, 'tr');
      if (subjectCmp !== 0) return subjectCmp;
      return right.absentCount - left.absentCount;
    });
}

export async function loadAttendanceFlags({ schoolId, classId, subjectId } = {}) {
  let sessionQuery = withSchoolFilter(
    supabase
      .from('attendance_sessions')
      .select(SESSION_SELECT)
      .not('unit_id', 'is', null),
    schoolId
  );
  if (classId) sessionQuery = sessionQuery.eq('class_id', classId);
  if (subjectId) sessionQuery = sessionQuery.eq('subject_id', subjectId);

  const { data: sessions, error: sessionError } = await sessionQuery;
  if (sessionError) throw sessionError;
  const sessionRows = sessions ?? [];
  if (!sessionRows.length) return [];

  const { data: records, error: recordsError } = await supabase
    .from('attendance_records')
    .select(RECORD_SELECT)
    .in(
      'session_id',
      sessionRows.map((session) => session.id)
    )
    .eq('status', 'absent');
  if (recordsError) throw recordsError;

  const classIds = [...new Set(sessionRows.map((row) => row.class_id))];
  const subjectIds = [...new Set(sessionRows.map((row) => row.subject_id))];
  const unitIds = [...new Set(sessionRows.map((row) => row.unit_id).filter(Boolean))];
  const studentIds = [...new Set((records ?? []).map((row) => row.student_id))];

  const [classesRes, subjectsRes, unitsRes, studentsRes] = await Promise.all([
    classIds.length
      ? supabase.from('classes').select(CLASS_SELECT).in('id', classIds)
      : Promise.resolve({ data: [], error: null }),
    subjectIds.length
      ? supabase.from('curriculum_subjects').select(SUBJECT_SELECT).in('id', subjectIds)
      : Promise.resolve({ data: [], error: null }),
    unitIds.length
      ? supabase.from('curriculum_units').select(UNIT_SELECT).in('id', unitIds)
      : Promise.resolve({ data: [], error: null }),
    studentIds.length
      ? supabase.from('students').select('id, full_name, class_id').in('id', studentIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  if (classesRes.error) throw classesRes.error;
  if (subjectsRes.error) throw subjectsRes.error;
  if (unitsRes.error) throw unitsRes.error;
  if (studentsRes.error) throw studentsRes.error;

  return groupMissedTopicFlags(sessionRows, records ?? [], {
    students: studentsRes.data ?? [],
    classes: classesRes.data ?? [],
    subjects: subjectsRes.data ?? [],
    units: unitsRes.data ?? [],
  });
}

export async function loadAttendanceForWeek({ schoolId, classIds, startOn, endOn, studentIds }) {
  if (!classIds?.length) {
    return { sessions: [], records: [] };
  }

  let query = withSchoolFilter(
    supabase
      .from('attendance_sessions')
      .select(SESSION_SELECT)
      .in('class_id', classIds)
      .gte('taken_on', startOn)
      .lte('taken_on', endOn),
    schoolId
  );

  const { data: sessions, error: sessionError } = await query;
  if (sessionError) throw sessionError;
  const sessionRows = sessions ?? [];
  if (!sessionRows.length) return { sessions: [], records: [] };

  let recordsQuery = supabase
    .from('attendance_records')
    .select(RECORD_SELECT)
    .in(
      'session_id',
      sessionRows.map((session) => session.id)
    );
  if (studentIds?.length) {
    recordsQuery = recordsQuery.in('student_id', studentIds);
  }
  const { data: records, error: recordsError } = await recordsQuery;
  if (recordsError) throw recordsError;
  return { sessions: sessionRows, records: records ?? [] };
}

export function attendancePeriodBounds(period, today = istanbulDateIso()) {
  if (period === 'all') {
    return { startOn: '2020-01-01', endOn: '2099-12-31' };
  }
  if (period === 'month') {
    const [year, month] = today.split('-').map(Number);
    const startOn = `${year}-${String(month).padStart(2, '0')}-01`;
    const lastDay = new Date(year, month, 0).getDate();
    const endOn = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
    return { startOn, endOn };
  }
  const [year, month, day] = today.split('-').map(Number);
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  const mondayOffset = weekday === 0 ? -6 : 1 - weekday;
  const startOn = addDaysIso(today, mondayOffset);
  const endOn = addDaysIso(startOn, 6);
  return { startOn, endOn };
}

export function aggregateStudentAttendance({ sessions, records, students, classes }) {
  const classById = Object.fromEntries((classes ?? []).map((klass) => [klass.id, klass]));
  const sessionById = Object.fromEntries((sessions ?? []).map((session) => [session.id, session]));
  const stats = new Map();

  for (const student of students ?? []) {
    stats.set(student.id, {
      studentId: student.id,
      studentName: student.full_name ?? 'Öğrenci',
      classId: student.class_id,
      classLabel: student.class_id ? formatClassLabel(classById[student.class_id]?.grade, classById[student.class_id]?.name) : '',
      present: 0,
      absent: 0,
      total: 0,
      lastSessionOn: null,
      lastStatus: null,
    });
  }

  for (const record of records ?? []) {
    const row = stats.get(record.student_id);
    if (!row) continue;
    const session = sessionById[record.session_id];
    if (!session) continue;
    row.total += 1;
    if (record.status === 'absent') row.absent += 1;
    else row.present += 1;
    if (!row.lastSessionOn || session.taken_on >= row.lastSessionOn) {
      row.lastSessionOn = session.taken_on;
      row.lastStatus = record.status;
    }
  }

  return [...stats.values()]
    .filter((row) => row.total > 0 || students.some((student) => student.id === row.studentId))
    .map((row) => ({
      ...row,
      rate: row.total ? Math.round((row.present / row.total) * 100) : null,
    }))
    .sort((left, right) => {
      const rateLeft = left.rate ?? 101;
      const rateRight = right.rate ?? 101;
      if (rateLeft !== rateRight) return rateLeft - rateRight;
      return left.studentName.localeCompare(right.studentName, 'tr');
    });
}

export function summarizeAttendanceSessions({ sessions, records, students, classes, subjects }) {
  const classById = Object.fromEntries((classes ?? []).map((klass) => [klass.id, klass]));
  const subjectById = Object.fromEntries((subjects ?? []).map((subject) => [subject.id, subject]));
  const studentById = Object.fromEntries((students ?? []).map((student) => [student.id, student]));
  const recordsBySession = new Map();

  for (const record of records ?? []) {
    const list = recordsBySession.get(record.session_id) ?? [];
    list.push(record);
    recordsBySession.set(record.session_id, list);
  }

  return [...(sessions ?? [])]
    .sort((left, right) => right.taken_on.localeCompare(left.taken_on))
    .map((session) => {
      const sessionRecords = recordsBySession.get(session.id) ?? [];
      const present = sessionRecords.filter((row) => row.status !== 'absent').length;
      const absent = sessionRecords.filter((row) => row.status === 'absent').length;
      const klass = classById[session.class_id];
      const subject = subjectById[session.subject_id];
      return {
        session,
        classLabel: klass ? formatClassLabel(klass.grade, klass.name) : '',
        subjectName: subject?.name ?? 'Ders',
        present,
        absent,
        roster: sessionRecords.map((record) => ({
          studentId: record.student_id,
          studentName: studentById[record.student_id]?.full_name ?? 'Öğrenci',
          status: record.status,
        })),
      };
    });
}

export async function loadDirectorAttendanceData({
  schoolId,
  classId,
  subjectId,
  startOn,
  endOn,
  students = [],
  classes = [],
}) {
  const classIds = classId ? [classId] : classes.map((klass) => klass.id);
  const { sessions, records } = await loadAttendanceForWeek({
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
  const filteredRecords = records.filter((record) => sessionIds.has(record.session_id));

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

  return {
    sessions: filteredSessions,
    records: filteredRecords,
    subjects,
    studentStats: aggregateStudentAttendance({
      sessions: filteredSessions,
      records: filteredRecords,
      students: scopedStudents,
      classes,
    }),
    sessionSummaries: summarizeAttendanceSessions({
      sessions: filteredSessions,
      records: filteredRecords,
      students: scopedStudents,
      classes,
      subjects,
    }),
  };
}

export function formatLastAttendanceStatus(status) {
  if (status === 'absent') return 'Yok';
  if (status === 'present') return 'Var';
  return '—';
}

export function formatLastAttendanceLine(lastSessionOn, lastStatus) {
  if (!lastSessionOn) return '—';
  return `${formatCalendarDateTr(lastSessionOn)} — ${formatLastAttendanceStatus(lastStatus)}`;
}
