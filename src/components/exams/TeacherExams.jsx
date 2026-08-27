import { useCallback, useEffect, useMemo, useState } from 'react';
import { istanbulDateIso, uniqueGrades } from '../../lib/calendar';
import { loadTeacherAssignments } from '../../lib/curriculum';
import {
  EXAM_KIND,
  ensureExamSessionForEvent,
  examKindFromEvent,
  filterExamEvents,
  formatExamEventLabel,
  formatExamWhen,
  loadExamCalendarEvents,
  loadExamResults,
  saveExamResults,
  splitExamsByTiming,
} from '../../lib/exams';
import { readExamDemoConfig } from '../../lib/examDemoConfig';
import { InlineError, SendButton, SuccessMessage } from '../dashboardUi';

export default function TeacherExams({ profile, schoolId, students = [] }) {
  const [config, setConfig] = useState(() => readExamDemoConfig());
  const [events, setEvents] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [selectedEventId, setSelectedEventId] = useState('');
  const [sessionId, setSessionId] = useState('');
  const [nets, setNets] = useState(() => new Map());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  const teacherGrades = useMemo(() => uniqueGrades(students), [students]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [calendarRows, assignmentRows] = await Promise.all([
        loadExamCalendarEvents(schoolId, { includePast: true }),
        loadTeacherAssignments(profile.id),
      ]);
      setEvents(calendarRows);
      setAssignments(assignmentRows);
    } catch (loadError) {
      setError(loadError);
    } finally {
      setLoading(false);
    }
  }, [profile.id, schoolId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    function sync() {
      setConfig(readExamDemoConfig());
    }
    window.addEventListener('exam-demo-config', sync);
    return () => window.removeEventListener('exam-demo-config', sync);
  }, []);

  const filtered = useMemo(
    () => filterExamEvents(events, { config, grades: teacherGrades }),
    [events, config, teacherGrades]
  );

  const { upcoming, past } = useMemo(
    () => splitExamsByTiming(filtered, istanbulDateIso()),
    [filtered]
  );

  const resultEvents = useMemo(() => {
    if (!config.storeResults) return [];
    return past.filter((event) => {
      const kind = examKindFromEvent(event);
      if (kind === EXAM_KIND.mock && !config.storeMockResults) return false;
      if (kind === EXAM_KIND.common && !config.storeCommonResults) return false;
      return true;
    });
  }, [past, config]);

  const selectedEvent = resultEvents.find((event) => event.id === selectedEventId) ?? resultEvents[0] ?? null;

  useEffect(() => {
    if (selectedEvent?.id) setSelectedEventId(selectedEvent.id);
  }, [selectedEvent?.id]);

  useEffect(() => {
    if (!selectedEvent || !config.storeResults) {
      setSessionId('');
      setNets(new Map());
      return;
    }
    let mounted = true;
    (async () => {
      try {
        const session = await ensureExamSessionForEvent({ schoolId, event: selectedEvent });
        if (!mounted || !session) return;
        setSessionId(session.id);
        const results = await loadExamResults(session.id);
        const next = new Map();
        for (const student of students) {
          const row = results.find((item) => item.student_id === student.id);
          next.set(student.id, row?.net != null ? String(row.net) : '');
        }
        if (mounted) setNets(next);
      } catch (sessionError) {
        if (mounted) setError(sessionError);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [selectedEvent, schoolId, students, config.storeResults]);

  function setNet(studentId, value) {
    setNets((current) => {
      const next = new Map(current);
      next.set(studentId, value);
      return next;
    });
  }

  async function handleSaveResults(event) {
    event.preventDefault();
    if (!sessionId) return;
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const rows = students.map((student) => ({
        student_id: student.id,
        net: nets.get(student.id) ?? '',
      }));
      await saveExamResults({ sessionId, rows });
      setSuccess('Netler kaydedildi. Müdür velilere açabilir.');
    } catch (saveError) {
      setError(saveError);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <section className="dash-card">
        <p className="dash-hint">Sınavlar yükleniyor…</p>
      </section>
    );
  }

  return (
    <>
      <header className="dash-header">
        <h1 className="dash-title">Sınavlar</h1>
        <p className="dash-subtitle">Yaklaşan ortak sınav ve denemeler. Net girişi demo ayarına bağlıdır.</p>
      </header>

      {error && <InlineError error={error} context="calendar" />}
      {success && <SuccessMessage message={success} />}

      <section className="dash-card">
        <h2 className="dash-section-title">Yaklaşan</h2>
        {upcoming.length === 0 ? (
          <p className="dash-hint">Yaklaşan sınav yok veya demo kapalı.</p>
        ) : (
          <ul className="exam-list">
            {upcoming.map((event) => (
              <li key={event.id}>
                <strong>{formatExamEventLabel(event)}</strong>
                <span className="dash-hint">{formatExamWhen(event)}</span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {config.storeResults && resultEvents.length > 0 && students.length > 0 ? (
        <section className="dash-card">
          <h2 className="dash-section-title">Net girişi</h2>
          <label className="dash-label">
            Sınav
            <select
              className="dash-input"
              value={selectedEventId}
              onChange={(event) => setSelectedEventId(event.target.value)}
            >
              {resultEvents.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.title} · {item.starts_on}
                </option>
              ))}
            </select>
          </label>

          <form className="dash-form" onSubmit={handleSaveResults}>
            <ul className="exam-roster">
              {students.map((student) => (
                <li key={student.id}>
                  <span>{student.full_name}</span>
                  <input
                    className="dash-input exam-net-input"
                    type="number"
                    step="0.5"
                    min="0"
                    max="500"
                    placeholder="Net"
                    value={nets.get(student.id) ?? ''}
                    onChange={(e) => setNet(student.id, e.target.value)}
                    disabled={saving}
                  />
                </li>
              ))}
            </ul>
            <SendButton sending={saving} label="Netleri kaydet" sendingLabel="Kaydediliyor…" />
          </form>
        </section>
      ) : null}

      {assignments.length === 0 && students.length === 0 ? (
        <section className="dash-card">
          <p className="dash-hint">Size atanmış sınıf yok.</p>
        </section>
      ) : null}
    </>
  );
}
