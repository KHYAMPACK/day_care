import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { withSchoolFilter } from '../../lib/tenant';
import { ANNOUNCEMENT_SELECT } from '../../lib/announcements';
import {
  CALENDAR_SELECT,
  addDaysIso,
  formatCalendarDateTr,
  getCalendarTypeMeta,
  istanbulDateIso,
} from '../../lib/calendar';
import {
  PROGRESS_SELECT,
  loadCurriculumCatalog,
  loadCurriculumWeekNotesForWeek,
  weekRangeIso,
} from '../../lib/curriculum';
import { loadAttendanceForWeek } from '../../lib/attendance';
import { buildStudentWeeklyReport, reportWeekIndex } from '../../lib/weeklyReport';
import {
  buildDemoWeeklyReport,
  isWeeklyReportEmpty,
} from '../../lib/parentDemoData';
import { InlineError } from '../dashboardUi';
import { Icon, IconWell } from '../ui/Icon';

const SUBJECT_VARIANTS = {
  Matematik: 'lavender',
  Türkçe: 'peach',
  'Fen Bilimleri': 'mint',
  'Sosyal Bilgiler': 'sky',
  İngilizce: 'rose',
  Din: 'gray',
};

const SUBJECT_ICONS = {
  Matematik: 'ruler',
  Türkçe: 'book',
  'Fen Bilimleri': 'flask',
  'Sosyal Bilgiler': 'globe',
  İngilizce: 'globe',
};

function subjectVariant(name) {
  return SUBJECT_VARIANTS[name] ?? 'lavender';
}

function subjectIcon(name) {
  return SUBJECT_ICONS[name] ?? 'book';
}

function reportStats(report) {
  const totalPresent = report.presence.reduce((sum, row) => sum + row.present, 0);
  const totalSessions = report.presence.reduce((sum, row) => sum + row.total, 0);
  const attendancePct = totalSessions
    ? Math.round((totalPresent / totalSessions) * 100)
    : null;
  const completedUnits = report.moved.filter((row) => row.completed).length;
  const totalQuestions = report.moved.reduce(
    (sum, row) => sum + (row.questionsSolved ?? 0),
    0
  );

  return {
    attendancePct,
    completedUnits,
    totalMoved: report.moved.length,
    totalQuestions,
    topicCount: report.konular.length,
  };
}

function WeeklyReportCard({ report }) {
  const stats = reportStats(report);
  const completedUnits = report.moved.filter((item) => item.completed);
  const hasContent =
    report.konular.length > 0 ||
    report.moved.length > 0 ||
    report.presence.length > 0 ||
    report.upcoming.length > 0 ||
    report.schoolNotes.length > 0 ||
    report.childNotes.length > 0 ||
    report.curriculumNotes.length > 0;

  if (!hasContent) {
    return (
      <article className="week-report__child">
        <header className="week-report__hero">
          <div>
            <h3 className="week-report__name">{report.student.full_name}</h3>
            {report.classLabel ? (
              <span className="week-report__class-pill">{report.classLabel}</span>
            ) : null}
          </div>
        </header>
        <p className="dash-hint">Bu hafta için henüz özet yok.</p>
      </article>
    );
  }

  return (
    <article className="week-report__child">
      <header className="week-report__hero">
        <div>
          <h3 className="week-report__name">{report.student.full_name}</h3>
          <div className="week-report__meta">
            {report.classLabel ? (
              <span className="week-report__class-pill">{report.classLabel}</span>
            ) : null}
            {report.weekLabel ? (
              <span className="week-report__week-pill">
                {report.isCurrentWeek ? 'Bu hafta' : 'Geçen hafta'} · {report.weekLabel}
              </span>
            ) : null}
          </div>
        </div>
      </header>

      <div className="week-report__stats">
        {stats.attendancePct != null ? (
          <div className="week-report__stat week-report__stat--mint">
            <span className="week-report__stat-value">{stats.attendancePct}%</span>
            <span className="week-report__stat-label">Katılım</span>
          </div>
        ) : null}
        {stats.completedUnits > 0 ? (
          <div className="week-report__stat week-report__stat--lavender">
            <span className="week-report__stat-value">{stats.completedUnits}</span>
            <span className="week-report__stat-label week-report__stat-label--long">
              Tamamlanan ünite
            </span>
          </div>
        ) : null}
        {stats.totalQuestions > 0 ? (
          <div className="week-report__stat week-report__stat--sky">
            <span className="week-report__stat-value">{stats.totalQuestions}</span>
            <span className="week-report__stat-label">Soru</span>
          </div>
        ) : null}
        {stats.topicCount > 0 && stats.totalMoved === 0 && stats.attendancePct == null ? (
          <div className="week-report__stat week-report__stat--peach">
            <span className="week-report__stat-value">{stats.topicCount}</span>
            <span className="week-report__stat-label">Konu</span>
          </div>
        ) : null}
      </div>

      {report.presence.length > 0 ? (
        <section className="week-report__panel">
          <p className="week-report__label">Ders katılımı</p>
          <div className="week-report__bars">
            {report.presence.map((item) => {
              const pct = Math.round((item.present / item.total) * 100);
              const variant = subjectVariant(item.subjectName);
              return (
                <div key={item.subjectName} className="week-report__bar-row">
                  <span className="week-report__bar-label">{item.subjectName}</span>
                  <div className="week-report__bar-track">
                    <span
                      className={`week-report__bar-fill week-report__bar-fill--${variant}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <span className="week-report__bar-value">
                    {item.present}/{item.total}
                  </span>
                </div>
              );
            })}
          </div>
        </section>
      ) : null}

      {report.konular.length > 0 ? (
        <section className="week-report__panel">
          <p className="week-report__label">Bu haftanın konuları</p>
          <ul className="week-report__topic-grid">
            {report.konular.map((item) => (
              <li
                key={`${item.subjectName}-${item.unitTitle}`}
                className={`week-report__topic week-report__topic--${subjectVariant(item.subjectName)}`}
              >
                <IconWell
                  name={subjectIcon(item.subjectName)}
                  variant={subjectVariant(item.subjectName)}
                  size={16}
                />
                <div className="week-report__topic-copy">
                  <strong>{item.subjectName}</strong>
                  <span>{item.banner}</span>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {completedUnits.length > 0 ? (
        <section className="week-report__panel">
          <p className="week-report__label">Tamamlanan üniteler</p>
          <ul className="week-report__progress-list">
            {completedUnits.map((item) => (
              <li
                key={`${item.subjectName}-${item.unitTitle}`}
                className="week-report__progress-item week-report__progress-item--done"
              >
                <div className="week-report__progress-main">
                  <strong>{item.subjectName}</strong>
                  <span>{item.unitTitle}</span>
                </div>
                <div className="week-report__progress-meta">
                  <span className="week-report__badge week-report__badge--done">Tamamlandı</span>
                  {item.questionsSolved ? (
                    <span className="week-report__questions">{item.questionsSolved} soru</span>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {report.curriculumNotes.length > 0 ? (
        <section className="week-report__panel">
          <p className="week-report__label">Öğretmen notu</p>
          <div className="week-report__note-callout">
            {report.curriculumNotes.map((item) => (
              <p key={`${item.subjectName}-${item.note}`}>
                <strong>{item.subjectName}</strong> — {item.note}
              </p>
            ))}
          </div>
        </section>
      ) : null}

      {report.upcoming.length > 0 ? (
        <section className="week-report__panel">
          <p className="week-report__label">Yaklaşan</p>
          <ul className="week-report__event-list">
            {report.upcoming.map((event) => {
              const meta = getCalendarTypeMeta(event.event_type);
              return (
                <li key={event.id} className="week-report__event">
                  <IconWell name={meta.icon} variant="sky" size={16} />
                  <div className="week-report__event-copy">
                    <strong>{event.title}</strong>
                    <span>{formatCalendarDateTr(event.starts_on)}</span>
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {report.schoolNotes.length > 0 || report.childNotes.length > 0 ? (
        <section className="week-report__panel">
          <p className="week-report__label">Bildirimler</p>
          <ul className="week-report__feed">
            {report.schoolNotes.map((item) => (
              <li key={item.id} className="week-report__feed-item week-report__feed-item--school">
                <Icon name="megaphone" size={15} />
                <div>
                  <span className="week-report__feed-kicker">Okuldan</span>
                  <strong>{item.title}</strong>
                </div>
              </li>
            ))}
            {report.childNotes.map((item) => (
              <li key={item.id} className="week-report__feed-item week-report__feed-item--teacher">
                <Icon name="mail" size={15} />
                <div>
                  <span className="week-report__feed-kicker">Öğretmenden</span>
                  <p>{item.body}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </article>
  );
}

export default function ParentWeeklyReport({ students, schoolId }) {
  const [subjects, setSubjects] = useState([]);
  const [units, setUnits] = useState([]);
  const [classes, setClasses] = useState([]);
  const [progress, setProgress] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [records, setRecords] = useState([]);
  const [events, setEvents] = useState([]);
  const [announcements, setAnnouncements] = useState([]);
  const [messages, setMessages] = useState([]);
  const [weekNotes, setWeekNotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const today = istanbulDateIso();
  const weekIndex = reportWeekIndex(today);
  const range = useMemo(() => (weekIndex ? weekRangeIso(weekIndex) : null), [weekIndex]);
  const studentIds = useMemo(() => students.map((student) => student.id), [students]);
  const classIds = useMemo(
    () => [...new Set(students.map((student) => student.class_id).filter(Boolean))],
    [students]
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const catalog = await loadCurriculumCatalog();
      setSubjects(catalog.subjects);
      setUnits(catalog.units);

      const upcomingUntil = addDaysIso(today, 7);
      const [classesRes, progressRes, eventsRes, announcementsRes, messagesRes] = await Promise.all([
        classIds.length
          ? supabase.from('classes').select('id, school_id, grade, name').in('id', classIds)
          : Promise.resolve({ data: [], error: null }),
        studentIds.length
          ? supabase.from('student_unit_progress').select(PROGRESS_SELECT).in('student_id', studentIds)
          : Promise.resolve({ data: [], error: null }),
        withSchoolFilter(
          supabase
            .from('calendar_events')
            .select(CALENDAR_SELECT)
            .lte('starts_on', upcomingUntil)
            .gte('ends_on', today)
            .order('starts_on'),
          schoolId
        ),
        withSchoolFilter(
          supabase.from('announcements').select(ANNOUNCEMENT_SELECT).order('created_at', { ascending: false }),
          schoolId
        ),
        studentIds.length
          ? withSchoolFilter(
              supabase
                .from('messages')
                .select('id, body, created_at, student_id')
                .in('student_id', studentIds)
                .order('created_at', { ascending: false }),
              schoolId
            )
          : Promise.resolve({ data: [], error: null }),
      ]);

      if (classesRes.error) throw classesRes.error;
      if (progressRes.error) throw progressRes.error;
      if (eventsRes.error && !/calendar_events/i.test(eventsRes.error.message ?? '')) throw eventsRes.error;
      if (announcementsRes.error && !/announcements/i.test(announcementsRes.error.message ?? '')) {
        throw announcementsRes.error;
      }
      if (messagesRes.error) throw messagesRes.error;

      setClasses(classesRes.data ?? []);
      setProgress(progressRes.data ?? []);
      setEvents(eventsRes.error ? [] : eventsRes.data ?? []);
      setAnnouncements(announcementsRes.error ? [] : announcementsRes.data ?? []);
      setMessages(messagesRes.data ?? []);

      const noteRows =
        weekIndex && classIds.length
          ? await loadCurriculumWeekNotesForWeek({ classIds, weekIndex })
          : [];
      setWeekNotes(noteRows);

      if (range && classIds.length) {
        try {
          const pack = await loadAttendanceForWeek({
            schoolId,
            classIds,
            startOn: range.start,
            endOn: range.end,
            studentIds,
          });
          setSessions(pack.sessions);
          setRecords(pack.records);
        } catch (attendanceError) {
          const message = attendanceError?.message ?? '';
          if (/attendance_sessions|save_class_attendance|schema cache|does not exist/i.test(message)) {
            setSessions([]);
            setRecords([]);
          } else {
            throw attendanceError;
          }
        }
      } else {
        setSessions([]);
        setRecords([]);
      }
    } catch (loadError) {
      setError(loadError);
    } finally {
      setLoading(false);
    }
  }, [classIds, range?.end, range?.start, schoolId, studentIds, today, weekIndex]);

  useEffect(() => {
    load();
  }, [load]);

  const reports = useMemo(
    () =>
      students.map((student) => {
        const report = buildStudentWeeklyReport({
          student,
          klass: classes.find((klass) => klass.id === student.class_id) ?? null,
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
          today,
        });
        if (isWeeklyReportEmpty(report)) {
          const classLabel = report?.classLabel ?? '';
          return buildDemoWeeklyReport(student, classLabel);
        }
        return report;
      }),
    [
      announcements,
      classes,
      events,
      messages,
      progress,
      records,
      sessions,
      students,
      subjects,
      today,
      units,
      weekIndex,
      weekNotes,
    ]
  );

  const showingDemo = reports.some((report) => report.isDemo);

  if (loading) return null;
  if (error) {
    return <InlineError error={error} context="attendance" />;
  }
  if (!students.length) return null;

  return (
    <section className="dash-card week-report">
      <div className="week-report__head">
        <h2 className="dash-section-title">Haftalık özet</h2>
        {showingDemo ? <span className="demo-pill demo-pill--lavender">Demo önizleme</span> : null}
      </div>
      {reports.map((report) => (
        <WeeklyReportCard key={report.student.id} report={report} />
      ))}
    </section>
  );
}
