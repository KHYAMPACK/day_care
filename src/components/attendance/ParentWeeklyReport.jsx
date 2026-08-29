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
import { loadAtlasForWeek } from '../../lib/atlasLessons';
import { buildStudentWeeklyReport, buildStudentWeeklyReportAtlas, encouragementMessage, reportWeekIndex } from '../../lib/weeklyReport';
import {
  buildDemoWeeklyReport,
  shouldUseDemoWeeklyReport,
} from '../../lib/parentDemoData';
import { InlineError } from '../dashboardUi';
import { Icon, IconWell } from '../ui/Icon';
import AnimatedBarFill from './AnimatedBarFill';
import ReportDonut, { reportDonutSegments } from './ReportDonut';
import { useCountUp, useInView } from '../../lib/motion';

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
  const totalQuestions = report.atlasMode
    ? (report.questionStats ?? []).reduce((sum, row) => sum + (row.correct ?? 0), 0)
    : report.moved.reduce((sum, row) => sum + (row.questionsSolved ?? 0), 0);

  return {
    attendancePct,
    completedUnits,
    totalMoved: report.moved.length,
    totalQuestions,
    topicCount: report.konular.length,
  };
}

function formatAssessmentBreakdown(breakdown = []) {
  if (!breakdown.length) return null;
  return breakdown
    .map((item) => `${item.sessions} ${String(item.type).toLowerCase()}`)
    .join(' · ');
}

function reportHasContent(report) {
  return (
    report.konular.length > 0 ||
    (report.sessionTopics?.length ?? 0) > 0 ||
    (report.subjectActivityMix?.length ?? 0) > 0 ||
    report.moved.length > 0 ||
    report.presence.length > 0 ||
    (report.lessonCounts?.length ?? 0) > 0 ||
    (report.questionStats?.length ?? 0) > 0 ||
    (report.bySubject?.length ?? 0) > 0 ||
    (report.summary?.totalQuestions ?? 0) > 0 ||
    report.upcoming.length > 0 ||
    report.schoolNotes.length > 0 ||
    report.childNotes.length > 0 ||
    report.curriculumNotes.length > 0
  );
}

function ReportHeroHeader({ report }) {
  return (
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
  );
}

function WeeklyReportLoading() {
  const [progress, setProgress] = useState(6);

  useEffect(() => {
    const startedAt = Date.now();

    const tick = () => {
      const elapsed = Date.now() - startedAt;
      // Ease toward 92% while loading; completes visually when the report mounts.
      const next = Math.min(92, 6 + (1 - Math.exp(-elapsed / 850)) * 86);
      setProgress(next);
    };

    tick();
    const intervalId = window.setInterval(tick, 40);
    return () => window.clearInterval(intervalId);
  }, []);

  const progressLabel = Math.round(progress);

  return (
    <section
      className="dash-card week-report week-report--loading"
      aria-busy="true"
      aria-live="polite"
    >
      <div className="week-report__head">
        <h2 className="dash-section-title">Haftalık özet</h2>
      </div>
      <div className="week-report__loading">
        <p className="week-report__loading-label">Rapor açılıyor</p>
        <div
          className="week-report__loading-track"
          role="progressbar"
          aria-label="Rapor açılıyor"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={progressLabel}
        >
          <span className="week-report__loading-bar" style={{ width: `${progress}%` }} />
        </div>
        <p className="week-report__loading-meta">%{progressLabel}</p>
      </div>
    </section>
  );
}

function ReportAttendance({ presence = [] }) {
  const [ref, inView] = useInView({ threshold: 0.2 });

  const totalPresent = presence.reduce((sum, row) => sum + row.present, 0);
  const totalSessions = presence.reduce((sum, row) => sum + row.total, 0);
  const attendancePct = totalSessions
    ? Math.round((totalPresent / totalSessions) * 100)
    : null;
  const absent = Math.max(0, totalSessions - totalPresent);
  const animatedAttendancePct = useCountUp(
    attendancePct ?? 0,
    inView && attendancePct != null,
    900
  );

  if (!presence.length) return null;

  return (
    <section ref={ref} className="week-report__panel week-report__attendance anim-enter">
      <p className="week-report__label">Ders katılımı</p>
      {attendancePct != null ? (
        <div className="week-report__attendance-summary">
          <div className="week-report__attendance-summary-main">
            <span className="week-report__attendance-summary-value">%{animatedAttendancePct}</span>
            <span className="week-report__attendance-summary-label">haftalık katılım</span>
          </div>
          <div className="week-report__attendance-summary-track" aria-hidden="true">
            <AnimatedBarFill
              pct={attendancePct}
              className="week-report__attendance-summary-fill"
              delay={120}
              when={inView}
            />
          </div>
          <div className="week-report__attendance-summary-meta">
            <span>
              <strong>{totalPresent}</strong> katıldı
            </span>
            {absent > 0 ? (
              <span>
                <strong>{absent}</strong> katılmadı
              </span>
            ) : null}
            <span>
              <strong>{totalSessions}</strong> ders
            </span>
          </div>
        </div>
      ) : null}
      <div className="week-report__bars week-report__bars--attendance">
        {presence.map((item, index) => {
          const pct = Math.round((item.present / item.total) * 100);
          const variant = subjectVariant(item.subjectName);
          return (
            <div key={item.subjectName} className="week-report__bar-row">
              <span className="week-report__bar-label">{item.subjectName}</span>
              <div className="week-report__bar-track">
                <AnimatedBarFill pct={pct} variant={variant} delay={180 + index * 70} when={inView} />
              </div>
              <span className="week-report__bar-value">
                {item.present}/{item.total}
              </span>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function AtlasReportHero({ report }) {
  const summary = report.summary ?? {};
  const segments = reportDonutSegments({
    correct: summary.correct ?? 0,
    wrong: summary.wrong ?? 0,
    blank: summary.blank ?? 0,
  });
  const hasPractice = (summary.totalQuestions ?? 0) > 0;
  const lessonSessions = summary.lessonSessions ?? 0;

  return (
    <section className="week-report__panel week-report__hero-donut anim-enter">
      <div className="week-report__hero-donut-main">
        <ReportDonut
          segments={segments}
          size={168}
          stroke={20}
          centerLabel={hasPractice ? undefined : '—'}
          centerNumeric={hasPractice ? summary.correctPct ?? 0 : undefined}
          centerSub={hasPractice ? 'doğru' : 'veri yok'}
          revealDelay={80}
          ariaLabel={
            hasPractice
              ? `Doğru cevap yüzdesi yüzde ${summary.correctPct ?? 0}`
              : 'Bu hafta soru verisi yok'
          }
        />
        <div className="week-report__hero-copy">
          <p className="week-report__encouragement">
            {encouragementMessage(report.encouragementKey ?? 'practice')}
          </p>
          {hasPractice ? (
            <p className="week-report__hero-stat">
              Toplam <strong>{summary.totalQuestions}</strong> soru çözüldü
            </p>
          ) : (
            <p className="week-report__hero-stat week-report__hero-stat--muted">
              Bu hafta test yapılmadı; konu anlatımı işlendi.
            </p>
          )}
          {lessonSessions > 0 ? (
            <p className="week-report__hero-stat week-report__hero-stat--sub">
              {lessonSessions} ders oturumu
            </p>
          ) : null}
        </div>
      </div>
      {hasPractice ? (
        <ul className="week-report__donut-legend" aria-hidden="true">
          {segments.map((segment) => (
            <li key={segment.key}>
              <span className="week-report__donut-legend-swatch" style={{ background: segment.color }} />
              {segment.label} · {segment.value}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

function AtlasSubjectGrid({ bySubject = [] }) {
  const active = bySubject.filter((item) => (item.totalQuestions ?? 0) > 0);
  if (!active.length) return null;

  return (
    <section className="week-report__panel">
      <p className="week-report__label">Ders bazında performans</p>
      <ul className="week-report__subject-grid">
        {active.map((item, index) => {
          const breakdown = formatAssessmentBreakdown(item.assessmentBreakdown);
          const variant = subjectVariant(item.subjectName);
          return (
            <li
              key={item.subjectName}
              className={`week-report__subject-card week-report__subject-card--${variant} anim-enter`}
              style={{ animationDelay: `${120 + index * 60}ms` }}
            >
              <div className="week-report__subject-card-head">
                <IconWell
                  name={subjectIcon(item.subjectName)}
                  variant={variant}
                  size={18}
                />
                <strong>{item.subjectName}</strong>
              </div>
              <div className="week-report__subject-card-body">
                <ReportDonut
                  segments={reportDonutSegments({
                    correct: item.correct ?? 0,
                    wrong: item.wrong ?? 0,
                    blank: item.blank ?? 0,
                  })}
                  size={72}
                  stroke={10}
                  centerNumeric={item.correctPct ?? undefined}
                  centerLabel={item.correctPct != null ? undefined : '—'}
                  centerSub="doğru"
                  className="week-report__subject-donut"
                  revealDelay={160 + index * 90}
                  ariaLabel={`${item.subjectName} doğru yüzdesi yüzde ${item.correctPct ?? 0}`}
                />
                <div className="week-report__subject-card-copy">
                  <span className="week-report__subject-card-stat">
                    <strong>{item.totalQuestions}</strong> soru
                  </span>
                  {breakdown ? (
                    <span className="week-report__subject-card-meta">{breakdown}</span>
                  ) : null}
                </div>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function ReportTopics({ report }) {
  const subjectActivityMix = report.subjectActivityMix ?? [];
  if (report.atlasMode && subjectActivityMix.length > 0) {
    return (
      <section className="week-report__panel">
        <p className="week-report__label">Bu hafta işlenen konular</p>
        <ul className="week-report__activity-list">
          {subjectActivityMix.map((item, index) => {
            const variant = subjectVariant(item.subjectName);
            return (
              <li
                key={item.subjectName}
                className={`week-report__activity-row week-report__activity-row--${variant} anim-enter`}
                style={{ animationDelay: `${index * 50}ms` }}
              >
                <div className="week-report__activity-head">
                  <IconWell
                    name={subjectIcon(item.subjectName)}
                    variant={variant}
                    size={18}
                  />
                  <div className="week-report__activity-head-copy">
                    <strong>{item.subjectName}</strong>
                    {item.unitTitles?.length > 0 ? (
                      <span className="week-report__activity-units">
                        {item.unitTitles.join(' · ')}
                      </span>
                    ) : null}
                  </div>
                </div>
                <div
                  className="week-report__activity-split"
                  role="img"
                  aria-label={`${item.subjectName}: yüzde ${item.lecturePct} konu anlatımı, yüzde ${item.practicePct} soru çözümü`}
                >
                  {item.lecturePct > 0 ? (
                    <span
                      className="week-report__activity-split-lecture"
                      style={{ width: `${item.lecturePct}%` }}
                    />
                  ) : null}
                  {item.practicePct > 0 ? (
                    <span
                      className="week-report__activity-split-practice"
                      style={{ width: `${item.practicePct}%` }}
                    />
                  ) : null}
                </div>
                <p className="week-report__activity-meta">
                  <span>%{item.lecturePct} konu anlatımı</span>
                  <span>%{item.practicePct} soru çözümü</span>
                </p>
              </li>
            );
          })}
        </ul>
      </section>
    );
  }

  const sessionTopics = report.sessionTopics ?? [];
  const useSessionTopics = sessionTopics.length > 0;
  const topics = useSessionTopics ? sessionTopics : report.konular;
  if (!topics.length) return null;

  return (
    <section className="week-report__panel">
      <p className="week-report__label">
        {useSessionTopics ? 'Bu hafta işlenen konular' : 'Bu haftanın konuları'}
      </p>
      <ul className="week-report__topic-grid">
        {topics.map((item, index) => {
          const key = useSessionTopics
            ? `${item.subjectName}-${item.unitTitle}-${item.lessonType}-${item.sessionDate ?? index}`
            : `${item.subjectName}-${item.unitTitle}`;
          const variant = subjectVariant(item.subjectName);
          return (
            <li key={key} className={`week-report__topic week-report__topic--${variant}`}>
              <IconWell
                name={subjectIcon(item.subjectName)}
                variant={variant}
                size={16}
              />
              <div className="week-report__topic-copy">
                <strong>{item.subjectName}</strong>
                <span>{item.unitTitle ?? item.banner}</span>
                {useSessionTopics && item.lessonType ? (
                  <span
                    className={`week-report__topic-badge${
                      item.lessonType === 'Test' ? ' week-report__topic-badge--test' : ''
                    }`}
                  >
                    {item.lessonType}
                  </span>
                ) : null}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function ReportSecondary({ report, showAttendance = true }) {
  const completedUnits = report.moved.filter((item) => item.completed);

  return (
    <>
      {showAttendance ? <ReportAttendance presence={report.presence} /> : null}

      {report.lessonCounts?.length > 0 ? (
        <section className="week-report__panel">
          <p className="week-report__label">Haftalık ders sayısı</p>
          <ul className="week-report__progress-list">
            {report.lessonCounts.map((item) => (
              <li key={item.subjectName} className="week-report__progress-item">
                <div className="week-report__progress-main">
                  <strong>{item.subjectName}</strong>
                  <span>{item.count} ders işlendi</span>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {completedUnits.length > 0 && !report.atlasMode ? (
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
    </>
  );
}

function AtlasWeeklyReportCard({ report }) {
  if (!reportHasContent(report)) {
    return (
      <article className="week-report__child week-report__child--atlas">
        <ReportHeroHeader report={report} />
        <p className="dash-hint">Bu hafta için henüz özet yok.</p>
      </article>
    );
  }

  return (
    <article className="week-report__child week-report__child--atlas">
      <ReportHeroHeader report={report} />
      <AtlasReportHero report={report} />
      <ReportAttendance presence={report.presence} />
      <AtlasSubjectGrid bySubject={report.bySubject} />
      <ReportTopics report={report} />
      <ReportSecondary report={report} showAttendance={false} />
    </article>
  );
}

function StandardWeeklyReportCard({ report }) {
  const stats = reportStats(report);
  const completedUnits = report.moved.filter((item) => item.completed);

  if (!reportHasContent(report)) {
    return (
      <article className="week-report__child">
        <ReportHeroHeader report={report} />
        <p className="dash-hint">Bu hafta için henüz özet yok.</p>
      </article>
    );
  }

  return (
    <article className="week-report__child">
      <ReportHeroHeader report={report} />

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
        <ReportAttendance presence={report.presence} />
      ) : null}

      {report.lessonCounts?.length > 0 ? (
        <section className="week-report__panel">
          <p className="week-report__label">Haftalık ders sayısı</p>
          <ul className="week-report__progress-list">
            {report.lessonCounts.map((item) => (
              <li key={item.subjectName} className="week-report__progress-item">
                <div className="week-report__progress-main">
                  <strong>{item.subjectName}</strong>
                  <span>{item.count} ders işlendi</span>
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {report.questionStats?.length > 0 ? (
        <section className="week-report__panel">
          <p className="week-report__label">Soru performansı</p>
          <ul className="week-report__progress-list">
            {report.questionStats.map((item) => (
              <li
                key={`${item.subjectName}-${item.assessmentType}`}
                className="week-report__progress-item"
              >
                <div className="week-report__progress-main">
                  <strong>
                    {item.subjectName} · {item.assessmentType}
                  </strong>
                  <span>
                    {item.correct} doğru · {item.wrong} yanlış · {item.blank} boş ({item.sessions}{' '}
                    oturum)
                  </span>
                </div>
              </li>
            ))}
          </ul>
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

      {completedUnits.length > 0 && !report.atlasMode ? (
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

function WeeklyReportCard({ report }) {
  if (report.atlasMode) {
    return <AtlasWeeklyReportCard report={report} />;
  }
  return <StandardWeeklyReportCard report={report} />;
}

export default function ParentWeeklyReport({
  students,
  schoolId,
  atlasSchedule = false,
  demoFallback = false,
}) {
  const [subjects, setSubjects] = useState([]);
  const [units, setUnits] = useState([]);
  const [classes, setClasses] = useState([]);
  const [progress, setProgress] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [records, setRecords] = useState([]);
  const [atlasPack, setAtlasPack] = useState({
    sessions: [],
    attendance: [],
    results: [],
    assessmentTypes: [],
  });
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
        if (atlasSchedule) {
          try {
            const pack = await loadAtlasForWeek({ schoolId, classIds, weekIndex });
            setAtlasPack(pack);
            setSessions([]);
            setRecords([]);
          } catch (atlasError) {
            const message = atlasError?.message ?? '';
            if (/atlas_lesson|schema cache|does not exist/i.test(message)) {
              setAtlasPack({ sessions: [], attendance: [], results: [], assessmentTypes: [] });
            } else {
              throw atlasError;
            }
          }
        } else {
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
            setAtlasPack({ sessions: [], attendance: [], results: [], assessmentTypes: [] });
          } catch (attendanceError) {
            const message = attendanceError?.message ?? '';
            if (/attendance_sessions|save_class_attendance|schema cache|does not exist/i.test(message)) {
              setSessions([]);
              setRecords([]);
            } else {
              throw attendanceError;
            }
          }
        }
      } else {
        setSessions([]);
        setRecords([]);
        setAtlasPack({ sessions: [], attendance: [], results: [], assessmentTypes: [] });
      }
    } catch (loadError) {
      setError(loadError);
    } finally {
      setLoading(false);
    }
  }, [atlasSchedule, classIds, range?.end, range?.start, schoolId, studentIds, today, weekIndex]);

  useEffect(() => {
    load();
  }, [load]);

  const reports = useMemo(
    () =>
      students.map((student) => {
        const report = atlasSchedule
          ? buildStudentWeeklyReportAtlas({
              student,
              klass: classes.find((klass) => klass.id === student.class_id) ?? null,
              weekIndex,
              subjects,
              units,
              atlasSessions: atlasPack.sessions,
              atlasAttendance: atlasPack.attendance,
              atlasResults: atlasPack.results,
              assessmentTypes: atlasPack.assessmentTypes,
              events,
              announcements,
              messages,
              weekNotes,
              today,
            })
          : buildStudentWeeklyReport({
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
        if (shouldUseDemoWeeklyReport(report, { atlasSchedule, demoFallback })) {
          const klass = classes.find((row) => row.id === student.class_id);
          const classLabel =
            report?.classLabel ?? (klass ? `${klass.grade}-${klass.name}` : '');
          return buildDemoWeeklyReport(student, classLabel, { atlasMode: atlasSchedule });
        }
        return report;
      }),
    [
      announcements,
      atlasPack,
      atlasSchedule,
      demoFallback,
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

  if (loading) return <WeeklyReportLoading />;
  if (error) {
    return <InlineError error={error} context="attendance" />;
  }
  if (!students.length) return null;

  return (
    <section className="dash-card week-report week-report--ready">
      <div className="week-report__head anim-enter">
        <h2 className="dash-section-title">Haftalık özet</h2>
        {showingDemo ? <span className="demo-pill demo-pill--lavender">Demo önizleme</span> : null}
      </div>
      {reports.map((report, index) => (
        <div key={report.student.id} className="anim-enter" style={{ animationDelay: `${index * 50}ms` }}>
          <WeeklyReportCard report={report} />
        </div>
      ))}
    </section>
  );
}
