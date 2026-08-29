import { addDaysIso, eventVisibleForGrades, istanbulDateIso } from './calendar';
import {
  academicWeekIndex,
  formatClassLabel,
  formatWeekRangeTr,
  isPlaceholderUnitTitle,
  plannedUnitForWeek,
  weekRangeIso,
} from './curriculum';

export function lastCompletedWeekIndex(isoDate = istanbulDateIso()) {
  const current = academicWeekIndex(isoDate);
  const [year, month, day] = isoDate.split('-').map(Number);
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  if (weekday === 0) return current;
  return current - 1;
}

export function reportWeekIndex(isoDate = istanbulDateIso()) {
  const completed = lastCompletedWeekIndex(isoDate);
  if (completed >= 1) return completed;
  const current = academicWeekIndex(isoDate);
  return current >= 1 ? current : null;
}

function inIsoDateWindow(isoTimestamp, startOn, endOnExclusive) {
  if (!isoTimestamp) return false;
  const time = new Date(isoTimestamp).getTime();
  if (Number.isNaN(time)) return false;
  const start = Date.parse(`${startOn}T00:00:00+03:00`);
  const end = Date.parse(`${endOnExclusive}T00:00:00+03:00`);
  return time >= start && time < end;
}

export function buildStudentWeeklyReport({
  student,
  klass,
  weekIndex,
  subjects,
  units,
  progress,
  sessions,
  records,
  events,
  announcements,
  messages,
  weekNotes,
  today = istanbulDateIso(),
}) {
  if (!student) return null;

  const classLabel = klass ? formatClassLabel(klass.grade, klass.name) : '';
  const gradeSubjects = (subjects ?? []).filter((subject) => subject.grade === student.grade);
  const weekLabel = weekIndex ? formatWeekRangeTr(weekIndex) : null;
  const range = weekIndex ? weekRangeIso(weekIndex) : null;
  const weekEndExclusive = range ? addDaysIso(range.end, 1) : null;

  const konular = gradeSubjects
    .map((subject) => {
      const subjectUnits = (units ?? []).filter((unit) => unit.subject_id === subject.id);
      const planned = weekIndex ? plannedUnitForWeek({ units: subjectUnits, weekIndex }) : null;
      if (!planned?.unit || isPlaceholderUnitTitle(planned.unit.title)) return null;
      return {
        subjectName: subject.name,
        unitTitle: planned.unit.title,
        banner: `${planned.unit.title} · hafta ${planned.weekInSpan}/${planned.durationWeeks}`,
      };
    })
    .filter(Boolean);

  const moved = weekIndex
    ? (progress ?? [])
        .filter(
          (row) =>
            row.student_id === student.id &&
            inIsoDateWindow(row.updated_at, range.start, weekEndExclusive)
        )
        .map((row) => {
          const unit = (units ?? []).find((item) => item.id === row.unit_id);
          const subject = (subjects ?? []).find((item) => item.id === unit?.subject_id);
          if (!unit || isPlaceholderUnitTitle(unit.title)) return null;
          return {
            subjectName: subject?.name ?? 'Ders',
            unitTitle: unit.title,
            completed: Boolean(row.completed),
            questionsSolved: row.questions_solved ?? 0,
          };
        })
        .filter(Boolean)
    : [];

  const classSessions = (sessions ?? []).filter((session) => session.class_id === student.class_id);
  const presence = gradeSubjects
    .map((subject) => {
      const subjectSessions = classSessions.filter((session) => session.subject_id === subject.id);
      if (!subjectSessions.length) return null;
      const sessionIds = new Set(subjectSessions.map((session) => session.id));
      const presentCount = (records ?? []).filter(
        (record) =>
          record.student_id === student.id &&
          sessionIds.has(record.session_id) &&
          record.status === 'present'
      ).length;
      return {
        subjectName: subject.name,
        present: presentCount,
        total: subjectSessions.length,
      };
    })
    .filter(Boolean);

  const upcomingUntil = addDaysIso(today, 7);
  const upcoming = (events ?? []).filter((event) => {
    if (event.ends_on < today || event.starts_on > upcomingUntil) return false;
    return eventVisibleForGrades(event, student.grade != null ? [student.grade] : []);
  });

  const schoolNotes = weekIndex
    ? (announcements ?? []).filter((item) =>
        inIsoDateWindow(item.created_at, range.start, weekEndExclusive)
      )
    : [];

  const childNotes = weekIndex
    ? (messages ?? []).filter(
        (item) =>
          item.student_id === student.id &&
          inIsoDateWindow(item.created_at, range.start, weekEndExclusive)
      )
    : [];

  const curriculumNotes =
    weekIndex && student.class_id
      ? (weekNotes ?? [])
          .filter((row) => row.class_id === student.class_id && row.note?.trim())
          .map((row) => ({
            subjectName: row.curriculum_subjects?.name ?? 'Ders',
            note: row.note.trim(),
          }))
      : [];

  return {
    student,
    classLabel,
    weekIndex,
    weekLabel,
    isCurrentWeek: weekIndex === academicWeekIndex(today),
    konular,
    moved,
    presence,
    upcoming,
    schoolNotes,
    childNotes,
    curriculumNotes,
  };
}

function sessionInWeekRange(session, range) {
  if (!range) return false;
  return session.session_date >= range.start && session.session_date <= range.end;
}

function correctPct(correct, wrong, blank) {
  const total = correct + wrong + blank;
  if (!total) return null;
  return Math.round((correct / total) * 100);
}

export function encouragementMessage(key) {
  if (key === 'great') return 'Harika bir hafta!';
  if (key === 'good') return 'İyi gidiyor, devam!';
  return 'Her soru pratik sayılır.';
}

function encouragementKey(correctPctValue, totalQuestions) {
  if (!totalQuestions) return 'practice';
  if (correctPctValue == null) return 'practice';
  if (correctPctValue >= 80) return 'great';
  if (correctPctValue >= 60) return 'good';
  return 'practice';
}

function rollupQuestionStats(questionStats) {
  const bySubjectMap = new Map();

  for (const row of questionStats ?? []) {
    const bucket =
      bySubjectMap.get(row.subjectName) ?? {
        subjectName: row.subjectName,
        correct: 0,
        wrong: 0,
        blank: 0,
        totalQuestions: 0,
        assessmentBreakdown: [],
      };
    bucket.correct += row.correct ?? 0;
    bucket.wrong += row.wrong ?? 0;
    bucket.blank += row.blank ?? 0;
    bucket.totalQuestions += row.totalQuestions ?? 0;
    bucket.assessmentBreakdown.push({
      type: row.assessmentType,
      sessions: row.sessions ?? 0,
      questions: row.totalQuestions ?? 0,
    });
    bySubjectMap.set(row.subjectName, bucket);
  }

  const bySubject = [...bySubjectMap.values()].map((row) => ({
    ...row,
    correctPct: correctPct(row.correct, row.wrong, row.blank),
  }));

  const correct = bySubject.reduce((sum, row) => sum + row.correct, 0);
  const wrong = bySubject.reduce((sum, row) => sum + row.wrong, 0);
  const blank = bySubject.reduce((sum, row) => sum + row.blank, 0);
  const totalQuestions = correct + wrong + blank;
  const pct = correctPct(correct, wrong, blank);

  return {
    bySubject,
    summary: {
      correct,
      wrong,
      blank,
      totalQuestions,
      correctPct: pct,
      practiceSessions: (questionStats ?? []).reduce((sum, row) => sum + (row.sessions ?? 0), 0),
    },
    encouragementKey: encouragementKey(pct, totalQuestions),
  };
}

function buildSessionTopics({ classSessions, gradeSubjects, units, student, atlasAttendance }) {
  const subjectById = Object.fromEntries(gradeSubjects.map((row) => [row.id, row.name]));
  const unitById = Object.fromEntries((units ?? []).map((row) => [row.id, row]));
  const seen = new Set();
  const topics = [];

  for (const session of classSessions ?? []) {
    const studentPresent = (atlasAttendance ?? []).some(
      (row) =>
        row.session_id === session.id &&
        row.student_id === student.id &&
        row.status === 'present'
    );
    if (!studentPresent) continue;

    const unit = session.unit_id ? unitById[session.unit_id] : null;
    const unitTitle = unit?.title;
    if (!unitTitle || isPlaceholderUnitTitle(unitTitle)) continue;

    const subjectName = subjectById[session.subject_id] ?? 'Ders';
    const lessonType = session.lesson_type === 'lecture' ? 'Konu anlatımı' : 'Test';
    const key = `${session.id}-${subjectName}-${unitTitle}-${lessonType}`;
    if (seen.has(key)) continue;
    seen.add(key);

    topics.push({
      subjectName,
      unitTitle,
      lessonType,
      sessionDate: session.session_date,
    });
  }

  return topics.sort((a, b) => {
    if (a.sessionDate !== b.sessionDate) return a.sessionDate.localeCompare(b.sessionDate);
    return a.subjectName.localeCompare(b.subjectName, 'tr');
  });
}

function activitySplitPct(lectureCount, practiceCount) {
  const total = lectureCount + practiceCount;
  if (!total) return { lecturePct: 0, practicePct: 0 };
  if (!lectureCount) return { lecturePct: 0, practicePct: 100 };
  if (!practiceCount) return { lecturePct: 100, practicePct: 0 };
  const lecturePct = Math.round((lectureCount / total) * 100);
  return { lecturePct, practicePct: 100 - lecturePct };
}

function buildSubjectActivityMix({
  classSessions,
  gradeSubjects,
  units,
  student,
  atlasAttendance,
  plannedKonular = [],
}) {
  const subjectById = Object.fromEntries(gradeSubjects.map((row) => [row.id, row.name]));
  const unitById = Object.fromEntries((units ?? []).map((row) => [row.id, row]));
  const plannedBySubject = new Map(
    (plannedKonular ?? []).map((row) => [row.subjectName, row.unitTitle])
  );
  const bySubject = new Map();

  for (const session of classSessions ?? []) {
    const studentPresent = (atlasAttendance ?? []).some(
      (row) =>
        row.session_id === session.id &&
        row.student_id === student.id &&
        row.status === 'present'
    );
    if (!studentPresent) continue;

    const subjectName = subjectById[session.subject_id] ?? 'Ders';
    const bucket = bySubject.get(subjectName) ?? {
      subjectName,
      lecture: 0,
      practice: 0,
      unitTitles: [],
    };
    if (session.lesson_type === 'lecture') {
      bucket.lecture += 1;
    } else {
      bucket.practice += 1;
    }

    const unit = session.unit_id ? unitById[session.unit_id] : null;
    const unitTitle = unit?.title;
    if (unitTitle && !isPlaceholderUnitTitle(unitTitle) && !bucket.unitTitles.includes(unitTitle)) {
      bucket.unitTitles.push(unitTitle);
    }

    bySubject.set(subjectName, bucket);
  }

  return [...bySubject.values()]
    .map((row) => {
      const totalSessions = row.lecture + row.practice;
      if (!totalSessions) return null;
      const { lecturePct, practicePct } = activitySplitPct(row.lecture, row.practice);
      const plannedUnit = plannedBySubject.get(row.subjectName);
      const unitTitles =
        row.unitTitles.length > 0
          ? row.unitTitles
          : plannedUnit && !isPlaceholderUnitTitle(plannedUnit)
            ? [plannedUnit]
            : [];
      return {
        subjectName: row.subjectName,
        lectureSessions: row.lecture,
        practiceSessions: row.practice,
        totalSessions,
        lecturePct,
        practicePct,
        unitTitles,
      };
    })
    .filter(Boolean)
    .sort((a, b) => a.subjectName.localeCompare(b.subjectName, 'tr'));
}

export function buildStudentWeeklyReportAtlas({
  student,
  klass,
  weekIndex,
  subjects,
  units,
  atlasSessions,
  atlasAttendance,
  atlasResults,
  assessmentTypes,
  events,
  announcements,
  messages,
  weekNotes,
  today = istanbulDateIso(),
}) {
  const base = buildStudentWeeklyReport({
    student,
    klass,
    weekIndex,
    subjects,
    units,
    progress: [],
    sessions: [],
    records: [],
    events,
    announcements,
    messages,
    weekNotes,
    today,
  });

  if (!base) return null;

  const range = weekIndex ? weekRangeIso(weekIndex) : null;
  const gradeSubjects = (subjects ?? []).filter((subject) => subject.grade === student.grade);
  const typeById = Object.fromEntries((assessmentTypes ?? []).map((row) => [row.id, row.name]));

  const classSessions = (atlasSessions ?? []).filter(
    (session) =>
      session.class_id === student.class_id && sessionInWeekRange(session, range)
  );

  const presence = gradeSubjects
    .map((subject) => {
      const subjectSessions = classSessions.filter((session) => session.subject_id === subject.id);
      if (!subjectSessions.length) return null;
      const sessionIds = new Set(subjectSessions.map((session) => session.id));
      const presentCount = (atlasAttendance ?? []).filter(
        (record) =>
          record.student_id === student.id &&
          sessionIds.has(record.session_id) &&
          record.status === 'present'
      ).length;
      return {
        subjectName: subject.name,
        present: presentCount,
        total: subjectSessions.length,
      };
    })
    .filter(Boolean);

  const lessonCounts = gradeSubjects
    .map((subject) => {
      const count = classSessions.filter((session) => session.subject_id === subject.id).length;
      if (!count) return null;
      return { subjectName: subject.name, count };
    })
    .filter(Boolean);

  const questionStats = [];
  for (const subject of gradeSubjects) {
    const subjectSessions = classSessions.filter(
      (session) => session.subject_id === subject.id && session.lesson_type === 'practice'
    );
    if (!subjectSessions.length) continue;

    const byType = new Map();
    for (const session of subjectSessions) {
      const typeName = typeById[session.assessment_type_id] ?? 'Test';
      const bucket = byType.get(typeName) ?? {
        assessmentType: typeName,
        totalQuestions: 0,
        wrong: 0,
        blank: 0,
        correct: 0,
        sessions: 0,
      };
      bucket.sessions += 1;
      const total = session.questions_total ?? 0;
      const sessionResults = (atlasResults ?? []).filter(
        (row) => row.session_id === session.id && row.student_id === student.id
      );
      for (const row of sessionResults) {
        bucket.totalQuestions += total;
        bucket.wrong += row.wrong_count ?? 0;
        bucket.blank += row.blank_count ?? 0;
        bucket.correct += Math.max(0, total - (row.wrong_count ?? 0) - (row.blank_count ?? 0));
      }
      byType.set(typeName, bucket);
    }
    for (const stats of byType.values()) {
      if (stats.totalQuestions > 0 || stats.sessions > 0) {
        questionStats.push({ subjectName: subject.name, ...stats });
      }
    }
  }

  const rollup = rollupQuestionStats(questionStats);
  const sessionTopics = buildSessionTopics({
    classSessions,
    gradeSubjects,
    units,
    student,
    atlasAttendance,
  });
  const subjectActivityMix = buildSubjectActivityMix({
    classSessions,
    gradeSubjects,
    units,
    student,
    atlasAttendance,
    plannedKonular: base.konular,
  });
  const practiceSessions = classSessions.filter((session) => session.lesson_type === 'practice').length;

  return {
    ...base,
    moved: [],
    presence,
    lessonCounts,
    questionStats,
    bySubject: rollup.bySubject,
    summary: {
      ...rollup.summary,
      lessonSessions: classSessions.length,
      practiceSessions,
    },
    sessionTopics,
    subjectActivityMix,
    encouragementKey: rollup.encouragementKey,
    atlasMode: true,
  };
}
