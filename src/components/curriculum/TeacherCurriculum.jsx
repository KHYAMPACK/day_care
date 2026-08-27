import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { withSchoolFilter } from '../../lib/tenant';
import { CALENDAR_SELECT, istanbulDateIso } from '../../lib/calendar';
import {
  PROGRESS_SELECT,
  UNIT_SELECT,
  academicWeekIndex,
  applyUnitProgressToClass,
  loadCurriculumWeekNote,
  upsertCurriculumWeekNote,
  classProgressForUnit,
  formatAssignmentLabel,
  formatPlannedUnitBanner,
  formatWeekRangeTr,
  expandSubjectSchedule,
  formatScheduleWeekRange,
  loadTeacherAssignments,
  plannedUnitForWeek,
  weekOverlapsHoliday,
} from '../../lib/curriculum';
import { InlineError, SendButton, SuccessMessage } from '../dashboardUi';
import { Icon } from '../ui/Icon';

function WeekHeader({ weekIndex, isHoliday, showSchedule, onToggleSchedule, subjectName }) {
  return (
    <div className="cal-month__nav">
      <span className="cal-month__nav-spacer" aria-hidden="true" />
      <div className="cur-week-title">
        {showSchedule ? (
          <h2 className="dash-section-title">
            {subjectName ? `${subjectName} · yıllık plan` : 'Yıllık plan'}
          </h2>
        ) : (
          <>
            <h2 className="dash-section-title">Hafta {weekIndex}</h2>
            <p className="dash-hint">{formatWeekRangeTr(weekIndex)}</p>
            {isHoliday ? <p className="dash-hint">Bu hafta takvimde tatil görünüyor.</p> : null}
          </>
        )}
      </div>
      <button type="button" className="demo-btn" onClick={onToggleSchedule}>
        {showSchedule ? 'Kayda dön' : 'Müfredatı gör'}
      </button>
    </div>
  );
}

export default function TeacherCurriculum({ profile, schoolId }) {
  const [assignments, setAssignments] = useState([]);
  const [units, setUnits] = useState([]);
  const [students, setStudents] = useState([]);
  const [progress, setProgress] = useState([]);
  const [holidays, setHolidays] = useState([]);
  const [assignmentId, setAssignmentId] = useState('');
  const [weekIndex, setWeekIndex] = useState(() => Math.max(1, academicWeekIndex(istanbulDateIso())));
  const [completed, setCompleted] = useState(false);
  const [questions, setQuestions] = useState('0');
  const [weekNote, setWeekNote] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showSchedule, setShowSchedule] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  const selected = assignments.find((row) => row.id === assignmentId) ?? assignments[0] ?? null;
  const subject = selected?.curriculum_subjects ?? null;
  const klass = selected?.classes ?? null;
  const subjectUnits = useMemo(
    () => units.filter((unit) => unit.subject_id === subject?.id),
    [units, subject]
  );
  const studentIds = useMemo(() => students.map((student) => student.id), [students]);
  const planned = useMemo(
    () => plannedUnitForWeek({ units: subjectUnits, weekIndex }),
    [subjectUnits, weekIndex]
  );
  const focusUnit = planned?.unit ?? null;
  const plannedBanner = formatPlannedUnitBanner(planned);
  const scheduleRows = useMemo(() => expandSubjectSchedule(subjectUnits), [subjectUnits]);

  useEffect(() => {
    setShowSchedule(false);
  }, [assignmentId]);

  const loadRoster = useCallback(async (classId) => {
    if (!classId) {
      setStudents([]);
      setProgress([]);
      return;
    }
    const studentsRes = await withSchoolFilter(
      supabase
        .from('students')
        .select('id, full_name, class_id')
        .eq('class_id', classId)
        .order('full_name'),
      schoolId
    );
    if (studentsRes.error) throw studentsRes.error;
    const classStudents = studentsRes.data ?? [];
    setStudents(classStudents);
    const ids = classStudents.map((student) => student.id);
    if (!ids.length) {
      setProgress([]);
      return;
    }
    const progressRes = await supabase
      .from('student_unit_progress')
      .select(PROGRESS_SELECT)
      .in('student_id', ids);
    if (progressRes.error) throw progressRes.error;
    setProgress(progressRes.data ?? []);
  }, [schoolId]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const rows = await loadTeacherAssignments(profile.id);
      setAssignments(rows);
      setAssignmentId((current) => {
        if (current && rows.some((row) => row.id === current)) return current;
        return rows[0]?.id ?? '';
      });

      const [unitsRes, eventsRes] = await Promise.all([
        supabase.from('curriculum_units').select(UNIT_SELECT).order('sort_order'),
        withSchoolFilter(
          supabase
            .from('calendar_events')
            .select(CALENDAR_SELECT)
            .eq('event_type', 'holiday'),
          schoolId
        ),
      ]);
      if (unitsRes.error && /duration_weeks/i.test(unitsRes.error.message ?? '')) {
        const fallback = await supabase
          .from('curriculum_units')
          .select('id, subject_id, title, sort_order, sections')
          .order('sort_order');
        if (fallback.error) throw fallback.error;
        setUnits(fallback.data ?? []);
      } else if (unitsRes.error) {
        throw unitsRes.error;
      } else {
        setUnits(unitsRes.data ?? []);
      }
      if (eventsRes.error && !/calendar_events/i.test(eventsRes.error.message ?? '')) throw eventsRes.error;
      setHolidays(eventsRes.error ? [] : eventsRes.data ?? []);
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
    loadRoster(klass?.id).catch((rosterError) => setError(rosterError));
  }, [klass?.id, loadRoster]);

  useEffect(() => {
    if (!focusUnit) {
      setCompleted(false);
      setQuestions('0');
      return;
    }
    const state = classProgressForUnit(progress, studentIds, focusUnit.id);
    setCompleted(state.completed);
    setQuestions(String(state.questions_solved ?? 0));
  }, [focusUnit, progress, studentIds]);

  useEffect(() => {
    if (!klass?.id || !subject?.id || !weekIndex) {
      setWeekNote('');
      return;
    }
    let mounted = true;
    loadCurriculumWeekNote({
      classId: klass.id,
      subjectId: subject.id,
      weekIndex,
    })
      .then((row) => {
        if (mounted) setWeekNote(row?.note ?? '');
      })
      .catch((noteError) => {
        if (mounted) setError(noteError);
      });
    return () => {
      mounted = false;
    };
  }, [klass?.id, subject?.id, weekIndex]);

  async function handleSave(event) {
    event.preventDefault();
    if (!klass?.id || !subject?.id) return;
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      let updated = 0;
      if (focusUnit) {
        const count = Number.parseInt(questions, 10);
        if (Number.isNaN(count) || count < 0) {
          throw new Error('Soru sayısı 0 veya daha büyük bir sayı olmalıdır.');
        }
        updated = await applyUnitProgressToClass({
          classId: klass.id,
          unitId: focusUnit.id,
          completed,
          questionsSolved: count,
        });
      }
      await upsertCurriculumWeekNote({
        schoolId,
        classId: klass.id,
        subjectId: subject.id,
        weekIndex,
        note: weekNote,
      });
      if (focusUnit) {
        setSuccess(
          updated
            ? `${formatAssignmentLabel(selected)} kaydı ${updated} öğrenciye işlendi.`
            : 'Bu şubede henüz öğrenci yok. Müdür şubeye öğrenci yerleştirsin.'
        );
        await loadRoster(klass.id);
      } else {
        setSuccess('Haftalık not kaydedildi.');
      }
    } catch (saveError) {
      setError(saveError);
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <section className="dash-card">
        <p className="dash-hint">Müfredat yükleniyor…</p>
      </section>
    );
  }

  return (
    <>
      <header className="dash-header">
        <h1 className="dash-title">Müfredat</h1>
        <p className="dash-subtitle">
          Bu haftanın konusunu işaretleyip soru sayısını yazın. Kayıt sınıftaki her öğrenciye gider.
        </p>
      </header>

      {error && <InlineError error={error} context="curriculum" />}

      {!error && assignments.length === 0 ? (
        <section className="dash-card">
          <p className="dash-hint">
            Size atanmış şube ve ders yok. Müdürünüz Öğretmen Atama sekmesinden şube + ders
            eşleştirmesi yapsın.
          </p>
        </section>
      ) : assignments.length > 0 ? (
        <>
          {assignments.length > 1 ? (
            <div className="cur-assign-chips" role="tablist" aria-label="Şube ve ders">
              {assignments.map((assignment) => (
                <button
                  key={assignment.id}
                  type="button"
                  role="tab"
                  className={`cur-assign-chip${assignment.id === selected?.id ? ' cur-assign-chip--active' : ''}`}
                  onClick={() => setAssignmentId(assignment.id)}
                  aria-selected={assignment.id === selected?.id}
                >
                  {formatAssignmentLabel(assignment)}
                </button>
              ))}
            </div>
          ) : (
            <p className="dash-hint">{formatAssignmentLabel(selected)}</p>
          )}

          <section className="dash-card">
            <WeekHeader
              weekIndex={weekIndex}
              isHoliday={weekOverlapsHoliday(weekIndex, holidays)}
              showSchedule={showSchedule}
              onToggleSchedule={() => setShowSchedule((current) => !current)}
              subjectName={subject?.name}
            />

            {showSchedule ? (
              <>
                <p className="dash-hint">
                  Konuya dokunun; o haftanın kaydına gidersiniz. Tamamlandı bilgisi şubenin sınıf
                  kaydıdır.
                </p>
                {scheduleRows.length === 0 ? (
                  <p className="dash-hint">Bu ders için ünite bulunamadı.</p>
                ) : (
                  <ol className="cur-schedule-list">
                    {scheduleRows.map((row) => {
                      const state = classProgressForUnit(progress, studentIds, row.unit.id);
                      const isCurrentWeek =
                        weekIndex >= row.spanStart && weekIndex <= row.spanEnd;
                      return (
                        <li key={row.unit.id}>
                          <button
                            type="button"
                            className={`cur-schedule-item${isCurrentWeek ? ' cur-schedule-item--current' : ''}`}
                            onClick={() => {
                              setWeekIndex(row.spanStart);
                              setShowSchedule(false);
                            }}
                          >
                            <span className="cur-schedule-item__weeks">
                              {formatScheduleWeekRange(row.spanStart, row.spanEnd)}
                            </span>
                            <span className="cur-schedule-item__title">{row.unit.title}</span>
                            <span className="cur-schedule-item__status">
                              {state.completed ? 'Tamamlandı' : 'Tamamlanmadı'}
                              {state.hasRow && state.questions_solved
                                ? ` · ${state.questions_solved} soru`
                                : ''}
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ol>
                )}
              </>
            ) : (
              <>
            {subject ? (
              <article
                className="cur-subject-card"
                style={{ '--cur-subject': subject.color }}
              >
                <p className="cur-subject-card__name">
                  <Icon name={subject.icon} size={16} /> {subject.name}
                </p>
                <p className="cur-subject-card__meta">{subjectUnits.length} ünite</p>
              </article>
            ) : null}

            {focusUnit ? (
              <form className="dash-form" onSubmit={handleSave}>
                <h3 className="dash-section-title">{focusUnit.title}</h3>
                {plannedBanner ? <p className="dash-hint">{plannedBanner}</p> : null}
                {Array.isArray(focusUnit.sections) && focusUnit.sections.length > 0 ? (
                  <p className="dash-hint">{focusUnit.sections.join(' · ')}</p>
                ) : null}

                <div className="cur-status-row">
                  <button
                    type="button"
                    className={`cur-status-btn${completed ? ' cur-status-btn--active' : ''}`}
                    aria-pressed={completed}
                    onClick={() => setCompleted((current) => !current)}
                  >
                    {completed ? 'Tamamlandı' : 'Tamamlanmadı'}
                  </button>
                </div>

                <label className="dash-label">
                  Sınıfta çözülen soru
                  <input
                    className="dash-input"
                    type="number"
                    min="0"
                    inputMode="numeric"
                    value={questions}
                    onChange={(event) => setQuestions(event.target.value)}
                    disabled={saving}
                  />
                </label>

                <label className="dash-label">
                  Haftalık not (isteğe bağlı)
                  <textarea
                    className="dash-input dash-textarea"
                    rows={3}
                    maxLength={500}
                    placeholder="Velilerin görebileceği kısa bir not…"
                    value={weekNote}
                    onChange={(event) => setWeekNote(event.target.value)}
                    disabled={saving}
                  />
                </label>

                {success && <SuccessMessage message={success} />}

                <SendButton
                  sending={saving}
                  label="Sınıfa kaydet"
                  sendingLabel="Kaydediliyor…"
                  className="dash-send-btn--wide"
                />
              </form>
            ) : (
              <form className="dash-form" onSubmit={handleSave}>
                <p className="dash-hint">Bu hafta için planlı konu yok.</p>
                <label className="dash-label">
                  Haftalık not (isteğe bağlı)
                  <textarea
                    className="dash-input dash-textarea"
                    rows={3}
                    maxLength={500}
                    placeholder="Velilerin görebileceği kısa bir not…"
                    value={weekNote}
                    onChange={(event) => setWeekNote(event.target.value)}
                    disabled={saving}
                  />
                </label>
                {success && <SuccessMessage message={success} />}
                <SendButton
                  sending={saving}
                  label="Notu kaydet"
                  sendingLabel="Kaydediliyor…"
                  className="dash-send-btn--wide"
                />
              </form>
            )}
              </>
            )}
          </section>
        </>
      ) : null}
    </>
  );
}
