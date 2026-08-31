import { supabase } from './supabase';
import { withSchoolFilter } from './tenant';
import {
  CALENDAR_SELECT,
  eventVisibleForGrades,
  formatCalendarDateTr,
  formatStartsAtTr,
  istanbulDateIso,
} from './calendar';
import { formatGradeLabel } from './atlasCalendar2026.js';
import { MEB_EXAM_EVENTS, MEB_EXAM_SOURCE, formatExamTermLabel } from './mebExamSchedule2026.js';
import { readExamDemoConfig } from './examDemoConfig.js';

export const EXAM_CALENDAR_SELECT = `${CALENDAR_SELECT}, exam_kind, exam_subject, exam_term, exam_round`;
export const SESSION_SELECT =
  'id, school_id, kind, calendar_event_id, title, held_on, audience_grades, publisher, results_enabled, published_at, answer_key_id, created_at, updated_at';
export const RESULT_SELECT = 'id, session_id, student_id, subject, net, score, note, updated_at';

export const EXAM_KIND = {
  common: 'common',
  mock: 'mock',
};

function isExamTableMissing(error) {
  return /exam_sessions|exam_student_results|common_exam|schema cache|does not exist/i.test(
    error?.message ?? ''
  );
}

function isExamCalendarColumnMissing(error) {
  return /exam_kind|exam_subject|exam_term|exam_round|schema cache/i.test(error?.message ?? '');
}

export function isExamEvent(event) {
  return event?.event_type === 'exam' || event?.event_type === 'common_exam';
}

export function examKindFromEvent(event) {
  if (event?.event_type === 'common_exam' || event?.exam_kind === 'common') return EXAM_KIND.common;
  if (event?.event_type === 'exam' || event?.exam_kind === 'mock') return EXAM_KIND.mock;
  return null;
}

export function formatExamEventLabel(event) {
  const kind = examKindFromEvent(event);
  if (kind === EXAM_KIND.common) {
    const term = formatExamTermLabel(event.exam_term, event.exam_round);
    const subject = event.exam_subject ?? event.title;
    return `${subject}${term !== 'Merkezî sınav' ? ` · ${term}` : ''}`;
  }
  return event.title;
}

export function formatExamWhen(event) {
  const date = formatCalendarDateTr(event.starts_on ?? event.held_on);
  const time = formatStartsAtTr(event.starts_at);
  return time ? `${date} · ${time}` : date;
}

export function filterExamEvents(events, { config, grades } = {}) {
  const cfg = config ?? readExamDemoConfig();
  const today = istanbulDateIso();

  return (events ?? [])
    .filter(isExamEvent)
    .filter((event) => {
      const kind = examKindFromEvent(event);
      if (kind === EXAM_KIND.common && !cfg.showCommonExams) return false;
      if (kind === EXAM_KIND.mock && !cfg.showMockExams) return false;
      if (grades?.length && !eventVisibleForGrades(event, grades)) return false;
      return true;
    })
    .sort((left, right) => {
      const leftDate = left.starts_on ?? left.held_on;
      const rightDate = right.starts_on ?? right.held_on;
      if (leftDate !== rightDate) return leftDate.localeCompare(rightDate);
      return (left.title ?? '').localeCompare(right.title ?? '', 'tr');
    });
}

export function splitExamsByTiming(events, today = istanbulDateIso()) {
  const upcoming = [];
  const past = [];
  for (const event of events) {
    const date = event.starts_on ?? event.held_on;
    if (date >= today) upcoming.push(event);
    else past.push(event);
  }
  return { upcoming, past };
}

export async function loadExamCalendarEvents(schoolId, { includePast = true } = {}) {
  const today = istanbulDateIso();
  let query = withSchoolFilter(
    supabase
      .from('calendar_events')
      .select(EXAM_CALENDAR_SELECT)
      .in('event_type', ['exam', 'common_exam'])
      .order('starts_on'),
    schoolId
  );
  if (!includePast) {
    query = query.gte('starts_on', today);
  }
  const { data, error } = await query;
  if (error) {
    if (isExamTableMissing(error)) {
      const fallback = await withSchoolFilter(
        supabase.from('calendar_events').select(CALENDAR_SELECT).eq('event_type', 'exam').order('starts_on'),
        schoolId
      );
      if (fallback.error) throw fallback.error;
      return fallback.data ?? [];
    }
    throw error;
  }
  return data ?? [];
}

export async function importMebExamEvents(schoolId) {
  let inserted = 0;
  for (const event of MEB_EXAM_EVENTS) {
    const { data: existing, error: lookupError } = await withSchoolFilter(
      supabase
        .from('calendar_events')
        .select('id')
        .eq('source', MEB_EXAM_SOURCE)
        .eq('title', event.title)
        .eq('starts_on', event.starts_on)
        .maybeSingle(),
      schoolId
    );
    if (lookupError && !isExamTableMissing(lookupError)) throw lookupError;
    if (existing) continue;

    const { error } = await withSchoolFilter(
      supabase.from('calendar_events').insert({
        school_id: schoolId,
        ...event,
        source: MEB_EXAM_SOURCE,
      }),
      schoolId
    );
    if (error) {
      if (isExamTableMissing(error)) throw error;
      if (!/duplicate|unique/i.test(error.message ?? '')) throw error;
    } else {
      inserted += 1;
    }
  }
  return inserted;
}

export async function loadExamSessions(schoolId) {
  const { data, error } = await withSchoolFilter(
    supabase.from('exam_sessions').select(SESSION_SELECT).order('held_on', { ascending: false }),
    schoolId
  );
  if (error) {
    if (isExamTableMissing(error)) return [];
    throw error;
  }
  return data ?? [];
}

export async function ensureExamSessionForEvent({ schoolId, event, publisher = null }) {
  if (!event?.id) return null;
  const existing = await withSchoolFilter(
    supabase.from('exam_sessions').select(SESSION_SELECT).eq('calendar_event_id', event.id).maybeSingle(),
    schoolId
  );
  if (existing.error && !isExamTableMissing(existing.error)) throw existing.error;
  if (existing.data) return existing.data;

  const kind = examKindFromEvent(event);
  if (!kind) return null;

  const payload = {
    school_id: schoolId,
    kind,
    calendar_event_id: event.id,
    title: event.title,
    held_on: event.starts_on,
    audience_grades: event.audience_grades,
    publisher: publisher?.trim() || null,
    results_enabled: kind === EXAM_KIND.mock,
  };

  const { data, error } = await withSchoolFilter(
    supabase.from('exam_sessions').insert(payload).select(SESSION_SELECT).single(),
    schoolId
  );
  if (error) {
    if (isExamTableMissing(error)) return null;
    throw error;
  }
  return data;
}

export async function createMockExamEvent({
  schoolId,
  title,
  heldOn,
  audienceGrades = [],
  body = '',
  publisher = null,
}) {
  const basePayload = {
    school_id: schoolId,
    title: title.trim(),
    body: body.trim(),
    event_type: 'exam',
    starts_on: heldOn,
    ends_on: heldOn,
    audience_grades: audienceGrades.length ? audienceGrades : null,
    notify: true,
    source: 'counselor',
  };

  let result = await withSchoolFilter(
    supabase
      .from('calendar_events')
      .insert({ ...basePayload, exam_kind: 'mock' })
      .select(EXAM_CALENDAR_SELECT)
      .single(),
    schoolId
  );

  if (result.error && isExamCalendarColumnMissing(result.error)) {
    result = await withSchoolFilter(
      supabase.from('calendar_events').insert(basePayload).select(CALENDAR_SELECT).single(),
      schoolId
    );
  }

  if (result.error) throw result.error;
  const session = await ensureExamSessionForEvent({ schoolId, event: result.data, publisher });
  return { event: result.data, session };
}

export async function publishExamSession(sessionId, publish = true) {
  const { data, error } = await supabase
    .from('exam_sessions')
    .update({ published_at: publish ? new Date().toISOString() : null })
    .eq('id', sessionId)
    .select(SESSION_SELECT)
    .single();
  if (error) throw error;
  return data;
}

export async function loadExamResults(sessionId) {
  const { data, error } = await supabase
    .from('exam_student_results')
    .select(RESULT_SELECT)
    .eq('session_id', sessionId);
  if (error) {
    if (isExamTableMissing(error)) return [];
    throw error;
  }
  return data ?? [];
}

export async function saveExamResults({ sessionId, rows }) {
  if (!rows.length) return [];
  const payload = rows.map((row) => ({
    session_id: sessionId,
    student_id: row.student_id,
    subject: null,
    net: row.net === '' || row.net == null ? null : Number(row.net),
    score: null,
    note: row.note ?? null,
  }));

  const { data, error } = await supabase
    .from('exam_student_results')
    .upsert(payload, { onConflict: 'session_id,student_id,subject' })
    .select(RESULT_SELECT);
  if (error) throw error;
  return data ?? [];
}

export async function loadPublishedResultsForStudents(studentIds) {
  if (!studentIds.length) return [];
  const { data, error } = await supabase
    .from('exam_student_results')
    .select(`${RESULT_SELECT}, exam_sessions ( id, title, held_on, kind, published_at, audience_grades )`)
    .in('student_id', studentIds);
  if (error) {
    if (isExamTableMissing(error)) return [];
    throw error;
  }
  return (data ?? []).filter((row) => row.exam_sessions?.published_at);
}

export function groupCommonExamsByTerm(events) {
  const common = filterExamEvents(events, {
    config: { showCommonExams: true, showMockExams: false },
  }).filter((event) => examKindFromEvent(event) === EXAM_KIND.common);

  const groups = new Map();
  for (const event of common) {
    const key =
      event.exam_term && event.exam_round
        ? `${event.exam_term}-${event.exam_round}`
        : 'merkezi';
    const label =
      event.exam_term && event.exam_round
        ? `${event.exam_term}. dönem · ${event.exam_round}. yazılı`
        : 'Merkezî sınavlar';
    if (!groups.has(key)) groups.set(key, { key, label, items: [] });
    groups.get(key).items.push(event);
  }
  return [...groups.values()];
}

export function formatExamGrades(event) {
  if (!event.audience_grades?.length) return 'Tüm sınıflar';
  return formatGradeLabel(event.audience_grades);
}

export function formatExamSessionGrades(session) {
  if (!session?.audience_grades?.length) return 'Tüm sınıflar';
  return formatGradeLabel(session.audience_grades);
}

export function filterExamSessions(sessions, { search = '', publisher = '', grade = null, status = 'all', sort = 'date-desc' } = {}) {
  let rows = sessions ?? [];
  const query = search.trim().toLowerCase();

  if (query) {
    rows = rows.filter(
      (session) =>
        session.title?.toLowerCase().includes(query) ||
        session.publisher?.toLowerCase().includes(query)
    );
  }
  if (publisher) {
    rows = rows.filter((session) => session.publisher === publisher);
  }
  if (grade != null) {
    rows = rows.filter(
      (session) =>
        !session.audience_grades?.length || session.audience_grades.includes(grade)
    );
  }
  if (status === 'published') {
    rows = rows.filter((session) => session.published_at);
  } else if (status === 'draft') {
    rows = rows.filter((session) => !session.published_at);
  }

  const sorted = [...rows];
  sorted.sort((left, right) => {
    if (sort === 'date-asc') {
      return (left.held_on ?? '').localeCompare(right.held_on ?? '');
    }
    if (sort === 'title-asc') {
      return (left.title ?? '').localeCompare(right.title ?? '', 'tr');
    }
    if (sort === 'publisher-asc') {
      return (left.publisher ?? '').localeCompare(right.publisher ?? '', 'tr');
    }
    return (right.held_on ?? '').localeCompare(left.held_on ?? '');
  });
  return sorted;
}
