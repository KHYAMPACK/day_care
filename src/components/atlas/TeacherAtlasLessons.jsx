import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { withSchoolFilter } from '../../lib/tenant';
import { CALENDAR_SELECT, istanbulDateIso } from '../../lib/calendar';
import {
  UNIT_SELECT,
  formatPlannedUnitBanner,
  formatClassLabel,
  formatWeekRangeTr,
  loadSchoolClasses,
  loadCurriculumSubjects,
  getTeacherSubjectSlug,
  getTeacherBransDisplay,
  resolveSubjectForClass,
} from '../../lib/curriculum';
import {
  ATLAS_SLOT_COUNT,
  academicWeekIndex,
  buildAttendanceRecords,
  canLiveLogForDate,
  canLogAtlasSession,
  loadClassRoster,
  loadClassSessionsForDate,
  loadTeacherWeekSessions,
  nextEmptySlotIndex,
  resolveLessonDate,
  saveAtlasLessonAttendance,
  schoolDaysInWeek,
  snapshotForDate,
} from '../../lib/atlasLessons';
import { resolveMissedDayPromptForDate } from '../../lib/atlasAlerts';
import { recordSchoolActivity } from '../../lib/activityLog';
import { InlineError, SendButton, SuccessMessage } from '../dashboardUi';
import { Icon } from '../ui/Icon';
import { AnimatedView } from '../ui/AnimatedView';
import AtlasClassPicker from './AtlasClassPicker';

function SlotStrip({ sessions, selectedSlot, onSelectSlot, disabled }) {
  const filledBySlot = useMemo(() => {
    const map = new Map();
    for (const session of sessions) {
      map.set(session.slot_index, session);
    }
    return map;
  }, [sessions]);

  return (
    <div className="atlas-slot-strip" role="tablist" aria-label="Ders saatleri">
      {Array.from({ length: ATLAS_SLOT_COUNT }, (_, index) => {
        const slot = index + 1;
        const existing = filledBySlot.get(slot);
        const isFilled = Boolean(existing);
        const isSelected = selectedSlot === slot;
        return (
          <button
            key={slot}
            type="button"
            role="tab"
            className={[
              'atlas-slot-strip__btn',
              isFilled ? 'atlas-slot-strip__btn--filled' : '',
              isSelected ? 'atlas-slot-strip__btn--active' : '',
            ]
              .filter(Boolean)
              .join(' ')}
            disabled={disabled || isFilled}
            aria-selected={isSelected}
            onClick={() => onSelectSlot(slot)}
          >
            <span className="atlas-slot-strip__num">{slot}. ders</span>
            {existing ? (
              <span className="atlas-slot-strip__meta">
                {existing.curriculum_subjects?.name ?? 'Ders'}
                {existing.profiles?.full_name ? ` · ${existing.profiles.full_name.split(/\s+/)[0]}` : ''}
              </span>
            ) : (
              <span className="atlas-slot-strip__meta">Boş</span>
            )}
          </button>
        );
      })}
    </div>
  );
}

function WeekCatchUpList({ teacherId, calendarEvents, onSelectDay }) {
  const weekIndex = academicWeekIndex();
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;
    (async () => {
      setLoading(true);
      try {
        const rows = await loadTeacherWeekSessions(teacherId, weekIndex);
        if (mounted) setSessions(rows);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [teacherId, weekIndex]);

  const schoolDays = useMemo(
    () => schoolDaysInWeek(weekIndex, calendarEvents),
    [weekIndex, calendarEvents]
  );

  const sessionsByDate = useMemo(() => {
    const map = new Map();
    for (const session of sessions) {
      const list = map.get(session.session_date) ?? [];
      list.push(session);
      map.set(session.session_date, list);
    }
    return map;
  }, [sessions]);

  if (loading) {
    return <p className="dash-hint">Haftalık telafi listesi yükleniyor…</p>;
  }

  return (
    <div className="atlas-week-catchup">
      <h3 className="dash-section-title">Bu hafta · telafi</h3>
      <p className="dash-hint">
        Canlı kayıt 20:00&apos;a kadar. Sonrasında aynı hafta içinde telafi edebilirsiniz.{' '}
        {formatWeekRangeTr(weekIndex)}
      </p>
      <ul className="atlas-week-catchup__days">
        {schoolDays.map((day) => {
          const daySessions = sessionsByDate.get(day) ?? [];
          const isToday = day === istanbulDateIso();
          const dayLabel = new Date(`${day}T12:00:00`).toLocaleDateString('tr-TR', {
            weekday: 'long',
            day: 'numeric',
            month: 'long',
          });
          return (
            <li key={day} className="atlas-week-catchup__day">
              <div className="atlas-week-catchup__day-head">
                <span>
                  {dayLabel}
                  {isToday ? ' · bugün' : ''}
                </span>
                <button type="button" className="demo-btn demo-btn--ghost" onClick={() => onSelectDay(day)}>
                  Yoklama gir
                </button>
              </div>
              {daySessions.length ? (
                <ul className="atlas-week-catchup__sessions">
                  {daySessions.map((session) => {
                    const complete = Boolean(session.activity_completed_at);
                    const label = `${formatClassLabel(session.classes?.grade, session.classes?.name)} · ${session.slot_index}. ders · ${session.curriculum_subjects?.name ?? 'Ders'}`;
                    return (
                      <li key={session.id} className="atlas-week-catchup__session">
                        <span>{label}</span>
                        <span className={`atlas-week-catchup__status${complete ? '' : ' atlas-week-catchup__status--pending'}`}>
                          {complete ? 'Tamam' : 'Sorular eksik'}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="dash-hint">Bu gün için kayıt yok.</p>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export default function TeacherAtlasLessons({
  profile,
  schoolId,
  catchUpPreset,
  onCatchUpConsumed,
}) {
  const subjectSlug = getTeacherSubjectSlug(profile);
  const bransDisplay = getTeacherBransDisplay(profile);

  const [classes, setClasses] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [units, setUnits] = useState([]);
  const [students, setStudents] = useState([]);
  const [classSessions, setClassSessions] = useState([]);
  const [calendarEvents, setCalendarEvents] = useState([]);
  const [selectedClassId, setSelectedClassId] = useState(null);
  const [slotIndex, setSlotIndex] = useState(1);
  const [absentIds, setAbsentIds] = useState(() => new Set());
  const [sessionId, setSessionId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [localCatchUp, setLocalCatchUp] = useState(null);

  const effectiveCatchUp = catchUpPreset ?? localCatchUp;
  const klass = classes.find((row) => row.id === selectedClassId) ?? null;
  const subject = useMemo(
    () => resolveSubjectForClass(subjects, subjectSlug, klass?.grade),
    [subjects, subjectSlug, klass?.grade]
  );

  const sessionDate = useMemo(
    () => resolveLessonDate({ catchUpDate: effectiveCatchUp?.sessionDate, calendarEvents }),
    [effectiveCatchUp?.sessionDate, calendarEvents]
  );

  const subjectUnits = useMemo(
    () => units.filter((unit) => unit.subject_id === subject?.id),
    [units, subject]
  );

  const snapshot = useMemo(
    () => (sessionDate ? snapshotForDate({ units: subjectUnits, takenOn: sessionDate }) : null),
    [subjectUnits, sessionDate]
  );

  const liveMode = sessionDate ? canLiveLogForDate(sessionDate) : false;
  const canLog = sessionDate ? canLogAtlasSession(sessionDate, calendarEvents) : false;
  const showWeekList =
    Boolean(sessionDate) &&
    !canLog &&
    !effectiveCatchUp?.sessionDate &&
    !effectiveCatchUp?.sessionId &&
    !effectiveCatchUp?.resumeActivity;

  const showClassPicker = !showWeekList && !selectedClassId;

  const filledSlots = useMemo(
    () => classSessions.map((session) => session.slot_index),
    [classSessions]
  );

  const refreshClassSessions = useCallback(async (classId, date) => {
    if (!classId || !date) {
      setClassSessions([]);
      return;
    }
    const rows = await loadClassSessionsForDate(classId, date);
    setClassSessions(rows);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [allClasses, catalogSubjects, unitsRes, eventsRes] = await Promise.all([
        loadSchoolClasses(schoolId),
        loadCurriculumSubjects(),
        supabase.from('curriculum_units').select(UNIT_SELECT).order('sort_order'),
        withSchoolFilter(
          supabase.from('calendar_events').select(CALENDAR_SELECT),
          schoolId
        ),
      ]);
      setClasses(allClasses);
      setSubjects(catalogSubjects);
      if (unitsRes.error) throw unitsRes.error;
      setUnits(unitsRes.data ?? []);
      if (eventsRes.error) throw eventsRes.error;
      setCalendarEvents(eventsRes.data ?? []);

      if (effectiveCatchUp?.classId) {
        setSelectedClassId(effectiveCatchUp.classId);
      }
    } catch (loadError) {
      setError(loadError);
    } finally {
      setLoading(false);
    }
  }, [schoolId, effectiveCatchUp?.classId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (effectiveCatchUp?.classId) {
      setSelectedClassId(effectiveCatchUp.classId);
    }
    if (effectiveCatchUp?.slotIndex) {
      setSlotIndex(effectiveCatchUp.slotIndex);
    }
  }, [effectiveCatchUp?.classId, effectiveCatchUp?.slotIndex]);

  useEffect(() => {
    if (!klass?.id || !sessionDate) return;
    let mounted = true;
    (async () => {
      try {
        const roster = await loadClassRoster(schoolId, klass.id);
        if (!mounted) return;
        setStudents(roster);
        await refreshClassSessions(klass.id, sessionDate);
      } catch (loadError) {
        if (mounted) setError(loadError);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [klass?.id, schoolId, sessionDate, refreshClassSessions]);

  useEffect(() => {
    if (effectiveCatchUp?.slotIndex) {
      setSlotIndex(effectiveCatchUp.slotIndex);
      return;
    }
    const next = nextEmptySlotIndex(filledSlots);
    if (next) setSlotIndex(next);
  }, [filledSlots, effectiveCatchUp?.slotIndex, klass?.id, sessionDate, sessionId]);

  useEffect(() => {
    setAbsentIds(new Set());
    setSessionId(null);
    setSuccess(null);
  }, [selectedClassId, slotIndex, sessionDate]);

  function toggleAbsent(studentId) {
    setAbsentIds((current) => {
      const next = new Set(current);
      if (next.has(studentId)) next.delete(studentId);
      else next.add(studentId);
      return next;
    });
  }

  function handleSelectClass(classId) {
    setSelectedClassId(classId);
    setError(null);
    setSuccess(null);
  }

  function handleBackToClasses() {
    setSelectedClassId(null);
    setSessionId(null);
    setError(null);
    setSuccess(null);
  }

  function finishSession() {
    setSessionId(null);
    setAbsentIds(new Set());
    const next = nextEmptySlotIndex([...filledSlots, slotIndex]);
    if (next) setSlotIndex(next);
  }

  async function handleSaveAttendance(event) {
    event.preventDefault();
    if (!klass?.id || !subject?.id || !sessionDate || !snapshot) return;
    if (!canLog) {
      setError(new Error('Canlı kayıt 20:00\'a kadar. Haftalık telafi listesini kullanın.'));
      return;
    }
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const id = await saveAtlasLessonAttendance({
        classId: klass.id,
        subjectId: subject.id,
        sessionDate,
        slotIndex,
        weekIndex: snapshot.weekIndex,
        unitId: snapshot.planned?.unit?.id ?? null,
        records: buildAttendanceRecords(students, absentIds),
        sessionId,
      });
      setSuccess('Yoklama kaydedildi. Sorular sekmesinden ders türünü işaretleyin.');
      recordSchoolActivity(supabase, profile, {
        schoolId,
        category: 'atlas',
        action: 'saved',
        summary: `Atlas ders yoklaması kaydedildi: ${formatClassLabel(klass?.grade, klass?.name)}`,
      });
      await refreshClassSessions(klass.id, sessionDate);
      await resolveMissedDayPromptForDate(profile.id, sessionDate);
      onCatchUpConsumed?.();
      setLocalCatchUp((current) => (current?.sessionDate === sessionDate ? current : { sessionDate }));
      finishSession();
    } catch (saveError) {
      if (/unique|doldurulmuş|slot/i.test(saveError.message ?? '')) {
        setError(new Error('Bu ders saati az önce dolduruldu. Liste yenileniyor.'));
        await refreshClassSessions(klass.id, sessionDate);
      } else {
        setError(saveError);
      }
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <section className="director-panel">
        <p className="dash-hint">Ders paneli yükleniyor…</p>
      </section>
    );
  }

  if (!sessionDate) {
    return (
      <section className="director-panel">
        <h2 className="dash-section-title">Ders</h2>
        <p className="dash-hint">Bugün okul günü değil veya tatil.</p>
      </section>
    );
  }

  if (!subjectSlug) {
    return (
      <section className="director-panel">
        <h2 className="dash-section-title">Ders</h2>
        <p className="dash-hint">
          Branşınız tanımlı değil. Müdürünüz Öğretmen Yönetimi sekmesinden branş ataması yapmalı.
        </p>
      </section>
    );
  }

  if (!classes.length) {
    return (
      <section className="director-panel">
        <h2 className="dash-section-title">Ders</h2>
        <p className="dash-hint">Henüz şube tanımlı değil. Müdürden şube oluşturmasını isteyin.</p>
      </section>
    );
  }

  if (selectedClassId && !subject?.id) {
    return (
      <section className="director-panel">
        <h2 className="dash-section-title">Ders</h2>
        <p className="dash-hint">
          Seçilen sınıf için {bransDisplay?.name ?? 'branş'} müfredatı bulunamadı.
        </p>
        <button type="button" className="demo-btn" onClick={handleBackToClasses}>
          ← Sınıflar
        </button>
      </section>
    );
  }

  if (showWeekList) {
    return (
      <AnimatedView viewKey="week" enterOnMount={false}>
      <section className="director-panel atlas-lessons">
        <header className="atlas-lessons__header">
          <h2 className="dash-section-title">Ders</h2>
        </header>
        {error && <InlineError error={error} context="general" />}
        <WeekCatchUpList
          teacherId={profile.id}
          calendarEvents={calendarEvents}
          onSelectDay={(day) => setLocalCatchUp({ sessionDate: day })}
        />
      </section>
      </AnimatedView>
    );
  }

  if (showClassPicker) {
    const dateLabel = sessionDate
      ? new Date(`${sessionDate}T12:00:00`).toLocaleDateString('tr-TR', {
          weekday: 'long',
          day: 'numeric',
          month: 'long',
        })
      : null;

    return (
      <AnimatedView viewKey="classes" enterOnMount={false}>
      <section className="director-panel atlas-lessons">
        <header className="atlas-lessons__header">
          <h2 className="dash-section-title">Ders</h2>
          {dateLabel ? <p className="dash-hint">{dateLabel}</p> : null}
          {!liveMode && effectiveCatchUp?.sessionDate ? (
            <button
              type="button"
              className="demo-btn demo-btn--ghost atlas-lessons__back"
              onClick={() => {
                setLocalCatchUp(null);
                onCatchUpConsumed?.();
              }}
            >
              ← Hafta listesi
            </button>
          ) : null}
        </header>
        {error && <InlineError error={error} context="general" />}
        <AtlasClassPicker
          classes={classes}
          subjectName={bransDisplay?.name}
          hint="Yoklama girmek için sınıf seçin."
          onSelectClass={handleSelectClass}
        />
      </section>
      </AnimatedView>
    );
  }

  const banner = formatPlannedUnitBanner(snapshot?.planned);
  const dateLabel = new Date(`${sessionDate}T12:00:00`).toLocaleDateString('tr-TR', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });

  return (
    <AnimatedView viewKey={`session-${selectedClassId ?? 'none'}`} enterOnMount={false}>
    <section className="director-panel atlas-lessons">
      <header className="atlas-lessons__header">
        <button
          type="button"
          className="demo-btn demo-btn--ghost atlas-lessons__back"
          onClick={handleBackToClasses}
        >
          ← Sınıflar
        </button>
        <h2 className="dash-section-title">
          {klass ? formatClassLabel(klass.grade, klass.name) : 'Ders'}
        </h2>
        <p className="dash-hint">
          {dateLabel}
          {!liveMode ? ' · Telafi modu' : ''}
          {subject?.name ? ` · ${subject.name}` : ''}
        </p>
        {!liveMode && effectiveCatchUp?.sessionDate ? (
          <button
            type="button"
            className="demo-btn demo-btn--ghost atlas-lessons__back"
            onClick={() => {
              setLocalCatchUp(null);
              onCatchUpConsumed?.();
              handleBackToClasses();
            }}
          >
            ← Hafta listesi
          </button>
        ) : null}
      </header>

      {error && <InlineError error={error} context="general" />}
      {success && <SuccessMessage message={success} />}

      {klass ? (
        <>
          {banner ? <p className="dash-hint">{banner}</p> : null}
          <SlotStrip
            sessions={classSessions}
            selectedSlot={slotIndex}
            onSelectSlot={setSlotIndex}
            disabled={saving}
          />
        </>
      ) : null}

      <form className="dash-form" onSubmit={handleSaveAttendance}>
        <h3 className="dash-section-title">Yoklama · {slotIndex}. ders</h3>
        <p className="dash-hint">Varsayılan: var. Devamsız öğrenciye dokunun.</p>
        <ul className="atlas-roster">
          {students.map((student) => {
            const absent = absentIds.has(student.id);
            return (
              <li key={student.id}>
                <button
                  type="button"
                  className={`atlas-roster__btn${absent ? ' atlas-roster__btn--absent' : ''}`}
                  onClick={() => toggleAbsent(student.id)}
                >
                  <span>{student.full_name}</span>
                  <span>{absent ? 'Yok' : 'Var'}</span>
                </button>
              </li>
            );
          })}
        </ul>
        {students.length === 0 ? (
          <p className="dash-hint">Bu şubede öğrenci yok.</p>
        ) : (
          <SendButton
            sending={saving}
            disabled={filledSlots.includes(slotIndex)}
            label="Yoklamayı kaydet"
            sendingLabel="Kaydediliyor…"
          />
        )}
      </form>
    </section>
    </AnimatedView>
  );
}
