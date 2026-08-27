/** Fallback sample nets when exam_sessions / migration not yet applied. */

export const DEMO_EXAM_SESSIONS = [
  {
    id: 'demo-session-1',
    kind: 'mock',
    title: '8. sınıf deneme sınavı',
    held_on: '2026-10-03',
    audience_grades: [8],
    published_at: '2026-10-04T12:00:00Z',
    calendar_event_id: null,
  },
  {
    id: 'demo-session-2',
    kind: 'mock',
    title: '7. ve 8. sınıf deneme sınavı',
    held_on: '2026-10-10',
    audience_grades: [7, 8],
    published_at: '2026-10-11T12:00:00Z',
    calendar_event_id: null,
  },
];

export const DEMO_EXAM_RESULTS = [
  { session_id: 'demo-session-1', student_id: 'demo', net: 78.5 },
  { session_id: 'demo-session-2', student_id: 'demo', net: 82 },
];

export function demoResultsForStudent(studentId, sessions) {
  if (studentId !== 'demo') return [];
  return sessions
    .filter((session) => session.published_at)
    .map((session) => ({
      session,
      net: session.id === 'demo-session-1' ? 78.5 : 82,
    }));
}
