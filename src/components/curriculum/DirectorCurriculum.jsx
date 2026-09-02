import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { withSchoolFilter } from '../../lib/tenant';
import { CALENDAR_SELECT, STUDENT_GRADES, formatStudentGrade, istanbulDateIso } from '../../lib/calendar';
import {
  deriveAcademicWeeksFromCalendar,
  academicWeekIndex,
  countAssignedWeeksForSubject,
  filterSubjectsForGrade,
  formatAcademicYearLabel,
  formatWeekRangeTr,
  loadCurriculumContext,
  weekOverlapsHoliday,
} from '../../lib/curriculum';
import { useAuth } from '../../context/AuthContext';
import {
  MAX_ACADEMIC_WEEKS,
  MIN_ACADEMIC_WEEKS,
  resolveAcademicWeeks,
  saveAcademicWeeks,
} from '../../lib/schoolFeatures';
import { InlineError, SendButton } from '../dashboardUi';
import CollapsibleSection from '../ui/CollapsibleSection';
import { Icon } from '../ui/Icon';
import DirectorAssessmentTypes from '../atlas/DirectorAssessmentTypes';
import SubjectPlanEditor from './SubjectPlanEditor';
import WeeklySubjectOverview from './WeeklySubjectOverview';

const CURRENT_WEEK = Math.max(1, academicWeekIndex(istanbulDateIso()));
const ACADEMIC_YEAR = formatAcademicYearLabel();

export default function DirectorCurriculum({ schoolId, atlasSchedule = false }) {
  const { school, refreshSchool } = useAuth();
  const [calendarEvents, setCalendarEvents] = useState([]);
  const calendarSuggestedWeeks = useMemo(
    () => deriveAcademicWeeksFromCalendar(calendarEvents),
    [calendarEvents]
  );
  const academicWeeks = resolveAcademicWeeks(school, calendarEvents, { atlasSchedule });
  const [academicWeeksInput, setAcademicWeeksInput] = useState(String(academicWeeks));
  const [savingAcademicWeeks, setSavingAcademicWeeks] = useState(false);
  const [academicWeeksError, setAcademicWeeksError] = useState(null);
  const [academicWeeksSaved, setAcademicWeeksSaved] = useState(false);
  const [subjects, setSubjects] = useState([]);
  const [units, setUnits] = useState([]);
  const [weekPlans, setWeekPlans] = useState([]);
  const [holidays, setHolidays] = useState([]);
  const [grade, setGrade] = useState(5);
  const [weekIndex, setWeekIndex] = useState(CURRENT_WEEK);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const gradeSubjects = useMemo(
    () => filterSubjectsForGrade(subjects, grade),
    [subjects, grade]
  );
  const unitsBySubject = useMemo(() => {
    const map = new Map();
    for (const subject of gradeSubjects) {
      map.set(
        subject.id,
        units.filter((unit) => unit.subject_id === subject.id)
      );
    }
    return map;
  }, [gradeSubjects, units]);

  const gradeStats = useMemo(() => {
    let unitCount = 0;
    let assignedWeeks = 0;
    for (const subject of gradeSubjects) {
      const subjectUnits = unitsBySubject.get(subject.id) ?? [];
      unitCount += subjectUnits.length;
      assignedWeeks += countAssignedWeeksForSubject(
        weekPlans,
        grade,
        subject.id,
        academicWeeks
      );
    }
    return {
      subjectCount: gradeSubjects.length,
      unitCount,
      assignedWeeks,
      totalWeekSlots: gradeSubjects.length * academicWeeks,
    };
  }, [gradeSubjects, unitsBySubject, weekPlans, grade, academicWeeks]);

  useEffect(() => {
    setAcademicWeeksInput(String(academicWeeks));
  }, [academicWeeks]);

  useEffect(() => {
    setWeekIndex((current) => Math.min(Math.max(1, current), academicWeeks));
  }, [academicWeeks]);

  useEffect(() => {
    if (!atlasSchedule || !schoolId || !calendarEvents.length || !calendarSuggestedWeeks) {
      return;
    }

    const stored = school?.features?.academic_weeks;
    const shouldAutoSet =
      stored == null || (Number(stored) === 52 && calendarSuggestedWeeks !== 52);
    if (!shouldAutoSet) return;

    let cancelled = false;
    (async () => {
      try {
        await saveAcademicWeeks(
          supabase,
          schoolId,
          school?.features,
          calendarSuggestedWeeks
        );
        if (!cancelled) await refreshSchool?.();
      } catch {
        // Director can set manually if auto-save fails.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [
    atlasSchedule,
    calendarEvents.length,
    calendarSuggestedWeeks,
    refreshSchool,
    school?.features,
    schoolId,
  ]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [curriculum, eventsRes] = await Promise.all([
        loadCurriculumContext(schoolId),
        withSchoolFilter(supabase.from('calendar_events').select(CALENDAR_SELECT), schoolId),
      ]);
      setSubjects(curriculum.subjects);
      setUnits(curriculum.units);
      setWeekPlans(curriculum.weekPlans);
      const events = eventsRes.error ? [] : eventsRes.data ?? [];
      setCalendarEvents(events);
      setHolidays(events.filter((event) => event.event_type === 'holiday'));
    } catch (loadError) {
      setError(loadError);
    } finally {
      setLoading(false);
    }
  }, [schoolId]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleSaveAcademicWeeks(event) {
    event.preventDefault();
    setSavingAcademicWeeks(true);
    setAcademicWeeksError(null);
    setAcademicWeeksSaved(false);
    try {
      await saveAcademicWeeks(supabase, schoolId, school?.features, academicWeeksInput);
      await refreshSchool?.();
      setAcademicWeeksSaved(true);
    } catch (saveError) {
      setAcademicWeeksError(saveError);
    } finally {
      setSavingAcademicWeeks(false);
    }
  }

  function jumpToWeek(nextWeek) {
    setWeekIndex(nextWeek);
  }

  function handleSubjectPlanSaved(subjectId, savedUnits) {
    setUnits((current) => {
      const others = current.filter((unit) => unit.subject_id !== subjectId);
      return [...others, ...savedUnits].sort(
        (left, right) => (left.sort_order ?? 0) - (right.sort_order ?? 0)
      );
    });
  }

  const onSubjectPlanSaved = useCallback((subjectId, savedUnits) => {
    handleSubjectPlanSaved(subjectId, savedUnits);
  }, []);

  const onWeekPlansBatchChange = useCallback(({ subjectId, plans }) => {
    setWeekPlans((current) => {
      const others = current.filter(
        (plan) => !(plan.grade === grade && plan.subject_id === subjectId)
      );
      return [...others, ...(plans ?? [])];
    });
  }, [grade]);

  if (loading) {
    return (
      <section className="dash-card">
        <p className="dash-hint">Müfredat yükleniyor…</p>
      </section>
    );
  }

  return (
    <section className="director-panel cur-director">
      <div className="dash-card cur-director-step">
        <p className="cur-director-step-label">1 · Sınıf seçin</p>
        <div className="cur-assign-chips" role="tablist" aria-label="Sınıf">
          {STUDENT_GRADES.map((value) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={grade === value}
              className={`cur-assign-chip${grade === value ? ' cur-assign-chip--active' : ''}`}
              onClick={() => setGrade(value)}
            >
              {formatStudentGrade(value)}
            </button>
          ))}
        </div>
        <p className="cur-director-step__meta">
          {formatStudentGrade(grade)} · {gradeStats.subjectCount} ders · {gradeStats.unitCount}{' '}
          ünite · {gradeStats.assignedWeeks}/{gradeStats.totalWeekSlots} haftalık atama
        </p>
      </div>

      <details className="cal-collapsible-form dash-card" open>
        <summary className="cal-collapsible-form__summary cal-browser__summary">
          <span className="cal-collapsible-form__chevron" aria-hidden="true" />
          <span className="cal-browser__summary-text">
            <span className="dash-section-title">2 · Yıllık plan</span>
            <span className="dash-hint">
              {formatStudentGrade(grade)} · hafta atamaları ve ünite listesi
            </span>
          </span>
        </summary>

        <div className="cal-collapsible-form__body cur-director-year">
          <p className="dash-hint">
            Her ders için üniteleri yönetin ve Hafta 1–{academicWeeks} arasında hangi ünitenin
            işleneceğini atayın.
          </p>

          {gradeSubjects.length === 0 ? (
            <p className="dash-hint">Bu sınıf için ders bulunamadı.</p>
          ) : (
            <div className="cur-subject-plan-list">
              {gradeSubjects.map((subject) => {
                const subjectUnits = unitsBySubject.get(subject.id) ?? [];
                const subjectAssignedWeeks = countAssignedWeeksForSubject(
                  weekPlans,
                  grade,
                  subject.id,
                  academicWeeks
                );

                return (
                  <details key={subject.id} className="cur-subject-plan">
                    <summary
                      className="cur-subject-plan__summary"
                      style={{ '--cur-subject': subject.color }}
                    >
                      <span className="cur-subject-plan__title">
                        <Icon name={subject.icon} size={16} /> {subject.name}
                      </span>
                      <span className="cur-subject-plan__meta">
                        {subjectUnits.length} ünite · {subjectAssignedWeeks}/{academicWeeks} hafta
                      </span>
                    </summary>

                    <SubjectPlanEditor
                      subject={subject}
                      units={subjectUnits}
                      weekPlans={weekPlans}
                      grade={grade}
                      schoolId={schoolId}
                      academicWeeks={academicWeeks}
                      currentWeekIndex={CURRENT_WEEK}
                      onSaved={(savedUnits) => onSubjectPlanSaved(subject.id, savedUnits)}
                      onWeekPlansBatchChange={onWeekPlansBatchChange}
                    />
                  </details>
                );
              })}
            </div>
          )}
        </div>
      </details>

      <details className="cal-collapsible-form dash-card" open>
        <summary className="cal-collapsible-form__summary cal-browser__summary">
          <span className="cal-collapsible-form__chevron" aria-hidden="true" />
          <span className="cal-browser__summary-text">
            <span className="dash-section-title">3 · Haftalık takip</span>
            <span className="dash-hint">
              {formatStudentGrade(grade)} · Hafta {weekIndex}
              {weekIndex === CURRENT_WEEK ? ' · şu an' : ''}
            </span>
          </span>
        </summary>

        <div className="cal-collapsible-form__body">
          <p className="dash-hint">
            Yıllık plandan otomatik hesaplanır; bu ekranda yalnızca görüntülenir.
          </p>

          <div className="cal-month__nav">
            <button
              type="button"
              className="demo-btn"
              onClick={() => setWeekIndex((value) => Math.max(1, value - 1))}
            >
              Önceki
            </button>
            <div className="cur-week-title">
              <h3 className="dash-section-title">Hafta {weekIndex}</h3>
              <p className="dash-hint">{formatWeekRangeTr(weekIndex)}</p>
              {weekIndex !== CURRENT_WEEK ? (
                <button
                  type="button"
                  className="demo-btn cur-week-jump"
                  onClick={() => jumpToWeek(CURRENT_WEEK)}
                >
                  Bu haftaya dön
                </button>
              ) : (
                <p className="cur-week-badge">Şu anki hafta</p>
              )}
              {weekOverlapsHoliday(weekIndex, holidays) ? (
                <p className="dash-hint">Bu hafta takvimde tatil görünüyor.</p>
              ) : null}
            </div>
            <button
              type="button"
              className="demo-btn"
              onClick={() => setWeekIndex((value) => Math.min(academicWeeks, value + 1))}
            >
              Sonraki
            </button>
          </div>

          {error && <InlineError error={error} context="curriculum" />}

          <div className="cur-week-block">
            <h3 className="cur-week-block__title">Bu haftanın dersleri</h3>
            <WeeklySubjectOverview
              subjects={gradeSubjects}
              unitsBySubject={unitsBySubject}
              weekPlans={weekPlans}
              grade={grade}
              weekIndex={weekIndex}
              currentWeekIndex={CURRENT_WEEK}
            />
          </div>
        </div>
      </details>

      {atlasSchedule ? (
        <div className="cur-director-assessment-types">
          <DirectorAssessmentTypes schoolId={schoolId} />
        </div>
      ) : null}

      <div className="cur-director-settings">
        <CollapsibleSection
          variant="card"
          title="Müfredat yönetimi"
          meta={`${ACADEMIC_YEAR} · Hafta ${CURRENT_WEEK}`}
        >
          <div className="cur-director-hero">
            <div className="cur-director-hero__head">
              <p className="cur-director-hero__badge">
                Şu an · Hafta {CURRENT_WEEK}
                <span className="cur-director-hero__badge-sub">
                  {formatWeekRangeTr(CURRENT_WEEK)}
                </span>
              </p>
            </div>
            <p className="dash-hint cur-director-hero__lead">
              Eğitim yılı uzunluğunu bir kez ayarlayın; yıllık planda haftalara ünite atayın. Ünite
              listesi ayrı yönetilir. Haftalık takip salt okunurdur.
            </p>
          </div>
        </CollapsibleSection>

        <CollapsibleSection
          variant="card"
          title="Eğitim yılı · hafta sayısı"
          meta={`${academicWeeks} hafta`}
        >
          <form className="cur-academic-weeks-form" onSubmit={handleSaveAcademicWeeks}>
            <label className="dash-label cur-academic-weeks-form__field">
              Bu eğitim yılı kaç hafta?
              <input
                className="dash-input"
                type="number"
                min={MIN_ACADEMIC_WEEKS}
                max={MAX_ACADEMIC_WEEKS}
                value={academicWeeksInput}
                onChange={(event) => setAcademicWeeksInput(event.target.value)}
                disabled={savingAcademicWeeks}
              />
            </label>
            <SendButton
              sending={savingAcademicWeeks}
              label="Kaydet"
              sendingLabel="Kaydediliyor…"
            />
          </form>
          <p className="dash-hint">
            Yıllık düzenleme Hafta 1–{academicWeeks} arasını kapsar. Yıl başında bir kez ayarlanır.
            {atlasSchedule && calendarSuggestedWeeks ? (
              <> Atlas takvimine göre önerilen: {calendarSuggestedWeeks} hafta.</>
            ) : null}
          </p>
          {academicWeeksError ? (
            <InlineError error={academicWeeksError} context="general" />
          ) : null}
          {academicWeeksSaved ? (
            <p className="dash-hint cur-academic-weeks-form__saved">Hafta sayısı kaydedildi.</p>
          ) : null}
        </CollapsibleSection>
      </div>
    </section>
  );
}
