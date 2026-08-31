import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { withSchoolFilter } from '../../lib/tenant';
import { CALENDAR_SELECT, STUDENT_GRADES, formatStudentGrade, istanbulDateIso } from '../../lib/calendar';
import {
  WEEK_PLAN_SELECT,
  academicWeekIndex,
  formatPlannedUnitBanner,
  formatWeekRangeTr,
  loadCurriculumCatalog,
  plannedUnitForWeek,
  weekOverlapsHoliday,
} from '../../lib/curriculum';
import { InlineError, SendButton, SuccessMessage } from '../dashboardUi';
import { Icon } from '../ui/Icon';
import DirectorAssessmentTypes from '../atlas/DirectorAssessmentTypes';

const CURRENT_WEEK = Math.max(1, academicWeekIndex(istanbulDateIso()));

export default function DirectorCurriculum({ schoolId, atlasSchedule = false }) {
  const [subjects, setSubjects] = useState([]);
  const [units, setUnits] = useState([]);
  const [weekPlans, setWeekPlans] = useState([]);
  const [holidays, setHolidays] = useState([]);
  const [grade, setGrade] = useState(5);
  const [weekIndex, setWeekIndex] = useState(CURRENT_WEEK);
  const [pinUnitId, setPinUnitId] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  const gradeSubjects = useMemo(
    () => subjects.filter((subject) => subject.grade === grade),
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
  const pinnedThisWeek = useMemo(
    () =>
      weekPlans.filter((plan) => plan.grade === grade && plan.week_index === weekIndex),
    [weekPlans, grade, weekIndex]
  );
  const pinnedUnitIds = useMemo(
    () => new Set(pinnedThisWeek.map((plan) => plan.unit_id)),
    [pinnedThisWeek]
  );
  const scheduledThisWeek = useMemo(
    () =>
      gradeSubjects
        .map((subject) => {
          const subjectUnits = unitsBySubject.get(subject.id) ?? [];
          const plan = plannedUnitForWeek({ units: subjectUnits, weekIndex });
          return plan ? { subject, plan } : null;
        })
        .filter(Boolean),
    [gradeSubjects, unitsBySubject, weekIndex]
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const catalog = await loadCurriculumCatalog();
      setSubjects(catalog.subjects);
      setUnits(catalog.units);

      const [plansRes, eventsRes] = await Promise.all([
        withSchoolFilter(supabase.from('curriculum_week_plans').select(WEEK_PLAN_SELECT), schoolId),
        withSchoolFilter(
          supabase.from('calendar_events').select(CALENDAR_SELECT).eq('event_type', 'holiday'),
          schoolId
        ),
      ]);
      if (plansRes.error) throw plansRes.error;
      setWeekPlans(plansRes.data ?? []);
      setHolidays(eventsRes.error ? [] : eventsRes.data ?? []);
    } catch (loadError) {
      setError(loadError);
    } finally {
      setLoading(false);
    }
  }, [schoolId]);

  useEffect(() => {
    load();
  }, [load]);

  async function handlePin(event) {
    event.preventDefault();
    if (!pinUnitId) return;
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const { error: insertError } = await supabase.from('curriculum_week_plans').insert({
        school_id: schoolId,
        grade,
        week_index: weekIndex,
        unit_id: pinUnitId,
      });
      if (insertError) throw insertError;
      setPinUnitId('');
      setSuccess(
        `${formatStudentGrade(grade)} · Hafta ${weekIndex} için ünite sabitlendi. Bu kayıt okul planınız içindir; öğretmen kendi ilerlemesini yine panelinden işaretler.`
      );
      await load();
    } catch (pinError) {
      setError(pinError);
    } finally {
      setSaving(false);
    }
  }

  async function handleUnpin(planId) {
    setError(null);
    const { error: deleteError } = await withSchoolFilter(
      supabase.from('curriculum_week_plans').delete().eq('id', planId),
      schoolId
    );
    if (deleteError) {
      setError(deleteError);
      return;
    }
    setSuccess('Sabitleme kaldırıldı.');
    await load();
  }

  if (loading) {
    return (
      <section className="dash-card">
        <p className="dash-hint">Müfredat yükleniyor…</p>
      </section>
    );
  }

  return (
    <section className="director-panel">
      <div className="dash-card cur-grade-picker">
        <p className="cur-director-step-label">Sınıf</p>
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
      </div>

      <details className="cal-collapsible-form dash-card">
        <summary className="cal-collapsible-form__summary cal-browser__summary">
          <span className="cal-collapsible-form__chevron" aria-hidden="true" />
          <span className="cal-browser__summary-text">
            <span className="dash-section-title">Haftalık plan</span>
            <span className="dash-hint">
              {formatStudentGrade(grade)} · Hafta {weekIndex}
            </span>
          </span>
        </summary>

        <div className="cal-collapsible-form__body">
          <p className="dash-hint">
            Hafta seçin. Yıllık planda o hafta hangi ünitelerin geldiğini görün; isterseniz ek
            olarak müdür sabitlemesi ekleyin.
          </p>

          <p className="cur-director-step-label">Hafta</p>
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
                  onClick={() => setWeekIndex(CURRENT_WEEK)}
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
              onClick={() => setWeekIndex((value) => Math.min(52, value + 1))}
            >
              Sonraki
            </button>
          </div>

          {error && <InlineError error={error} context="curriculum" />}
          {success && <SuccessMessage message={success} />}

          <div className="cur-week-block">
            <h3 className="cur-week-block__title">Yıllık planda bu hafta</h3>
            <p className="dash-hint">
              Her dersin ünite sürelerine göre otomatik hesaplanır. Öğretmen panelinde de bu plan
              referans alınır.
            </p>
            {scheduledThisWeek.length === 0 ? (
              <p className="dash-hint">Bu sınıf için bu haftaya denk gelen ünite yok.</p>
            ) : (
              <ul className="cur-week-plan-list">
                {scheduledThisWeek.map(({ subject, plan }) => (
                  <li key={subject.id} className="cur-week-plan-item">
                    <span
                      className="cur-week-plan-item__subject"
                      style={{ '--cur-subject': subject.color }}
                    >
                      <Icon name={subject.icon} size={14} /> {subject.name}
                    </span>
                    <span className="cur-week-plan-item__unit">{plan.unit.title}</span>
                    <span className="cur-week-plan-item__meta">
                      {formatPlannedUnitBanner(plan)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="cur-week-block cur-week-block--pin">
            <h3 className="cur-week-block__title">Müdür sabitlemesi (isteğe bağlı)</h3>
            <p className="dash-hint">
              Belirli bir üniteyi bu hafta için not olarak işaretleyin. Öğretmen yine kendi sınıfının
              ilerlemesini işaretler; sabitleme okul içi planlama içindir.
            </p>

            <form className="dash-form cur-pin-form" onSubmit={handlePin}>
              <label className="dash-label">
                Ünite seçin
                <select
                  className="dash-input"
                  value={pinUnitId}
                  onChange={(event) => setPinUnitId(event.target.value)}
                  disabled={saving}
                >
                  <option value="">Seçin…</option>
                  {gradeSubjects.map((subject) => (
                    <optgroup key={subject.id} label={subject.name}>
                      {(unitsBySubject.get(subject.id) ?? [])
                        .filter((unit) => !pinnedUnitIds.has(unit.id))
                        .map((unit) => (
                          <option key={unit.id} value={unit.id}>
                            {unit.sort_order}. {unit.title}
                          </option>
                        ))}
                    </optgroup>
                  ))}
                </select>
              </label>
              <SendButton
                sending={saving}
                disabled={!pinUnitId}
                label="Bu haftaya sabitle"
                sendingLabel="Ekleniyor…"
              />
            </form>

            {pinnedThisWeek.length === 0 ? (
              <p className="dash-hint">Bu hafta için sabitlenmiş ünite yok.</p>
            ) : (
              <ul className="history-list">
                {pinnedThisWeek.map((plan) => {
                  const unit = units.find((item) => item.id === plan.unit_id);
                  const subject = subjects.find((item) => item.id === unit?.subject_id);
                  return (
                    <li key={plan.id} className="history-item">
                      <div className="history-meta">
                        <strong>{unit?.title ?? 'Ünite'}</strong>
                        <span>
                          {subject?.name} · {formatStudentGrade(grade)} · Hafta {weekIndex}
                        </span>
                      </div>
                      <button
                        type="button"
                        className="match-item__remove"
                        onClick={() => handleUnpin(plan.id)}
                      >
                        Kaldır
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      </details>

      <div className="dash-card">
        <h2 className="dash-section-title">{formatStudentGrade(grade)} ders kataloğu</h2>
        <p className="dash-hint">
          Hazır müfredat listesi — düzenlenemez. Her kartta o dersteki toplam ünite sayısı
          gösterilir.
        </p>
        <div className="cur-subject-grid">
          {gradeSubjects.map((subject) => (
            <article
              key={subject.id}
              className="cur-subject-card"
              style={{ '--cur-subject': subject.color }}
            >
              <p className="cur-subject-card__name">
                <Icon name={subject.icon} size={16} /> {subject.name}
              </p>
              <p className="cur-subject-card__icon" aria-hidden="true">
                <Icon name={subject.icon} size={22} />
              </p>
              <p className="cur-subject-card__meta">
                {(unitsBySubject.get(subject.id) ?? []).length} ünite
              </p>
            </article>
          ))}
        </div>
      </div>

      {atlasSchedule ? (
        <div className="cur-director-assessment-types">
          <DirectorAssessmentTypes schoolId={schoolId} />
        </div>
      ) : null}
    </section>
  );
}
