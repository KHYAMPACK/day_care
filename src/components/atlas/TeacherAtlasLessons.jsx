import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { withSchoolFilter } from '../../lib/tenant';
import { CALENDAR_SELECT, istanbulDateIso } from '../../lib/calendar';
import {
  formatPlannedUnitBanner,
  formatClassLabel,
  formatWeekRangeTr,
  loadCurriculumContext,
  loadSchoolClasses,
  loadCurriculumSubjects,
  getTeacherSubjectSlug,
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
import { notifyAttendanceFirstLesson } from '../../lib/attendanceNotifications';
import { InlineError, SendButton, SuccessMessage } from '../dashboardUi';
import { AnimatedView } from '../ui/AnimatedView';
import { ConfirmDialog } from '../ui/ConfirmDialog';
import AtlasClassPicker from './AtlasClassPicker';
import {
  fillEmptyTimetableSlot,
  formatTimetableSubject,
  isoWeekday,
  loadTimetableForWeek,
  resolveTimetableSubject,
  subjectSlugFromTimetableRows,
} from '../../lib/classWeekTimetable';

function SlotStrip({ sessions, selectedSlot, onSelectSlot, disabled, plannedBySlot }) {
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
        const planned = plannedBySlot?.get(slot);
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
                {existing.curriculum_subjects?.name ?? planned ?? 'Ders'}
                {existing.profiles?.full_name ? ` · ${existing.profiles.full_name.split(/\s+/)[0]}` : ''}
              </span>
            ) : (
              <span className="atlas-slot-strip__meta">{planned || 'Boş'}</span>
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
  const [classes, setClasses] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [units, setUnits] = useState([]);
  const [weekPlans, setWeekPlans] = useState([]);
  const [students, setStudents] = useState([]);
  const [classSessions, setClassSessions] = useState([]);
  const [timetableRows, setTimetableRows] = useState([]);
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
  const [mismatchConfirmOpen, setMismatchConfirmOpen] = useState(false);

  const effectiveCatchUp = catchUpPreset ?? localCatchUp;
  const klass = classes.find((row) => row.id === selectedClassId) ?? null;

  const sessionDate = useMemo(
    () => resolveLessonDate({ catchUpDate: effectiveCatchUp?.sessionDate, calendarEvents }),
    [effectiveCatchUp?.sessionDate, calendarEvents]
  );

  const slotSubject = useMemo(
    () =>
      resolveTimetableSubject({
        rows: timetableRows,
        sessionDate,
        slotIndex,
        subjects,
        classGrade: klass?.grade,
      }),
    [timetableRows, sessionDate, slotIndex, subjects, klass?.grade]
  );
  const plannedSubject = slotSubject.subject;
  const slotSubjectSlug = slotSubject.subjectSlug;

  // Own branş, resolved against this class's grade — used to log attendance even when the
  // weekly schedule is empty or planned for a different subject (director/counselor never
  // finished filling in the şube's timetable).
  const ownSubjectSlug = getTeacherSubjectSlug(profile);
  const ownSubject = useMemo(
    () => resolveSubjectForClass(subjects, ownSubjectSlug, klass?.grade),
    [subjects, ownSubjectSlug, klass?.grade]
  );

  const subject = ownSubject ?? plannedSubject;
  const isEmptySlot = !slotSubjectSlug;
  const isSubjectMismatch = Boolean(slotSubjectSlug) && Boolean(ownSubject) && slotSubjectSlug !== ownSubjectSlug;

  const subjectUnits = useMemo(
    () => units.filter((unit) => unit.subject_id === subject?.id),
    [units, subject]
  );

  const snapshot = useMemo(
    () =>
      sessionDate
        ? snapshotForDate({
            units: subjectUnits,
            takenOn: sessionDate,
            weekPlans,
            subjectId: subject?.id,
            grade: klass?.grade,
          })
        : null,
    [subjectUnits, sessionDate, weekPlans, subject?.id, klass?.grade]
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

  const plannedBySlot = useMemo(() => {
    const map = new Map();
    if (!sessionDate) return map;
    const weekday = isoWeekday(sessionDate);
    for (let slot = 1; slot <= ATLAS_SLOT_COUNT; slot += 1) {
      const slug = subjectSlugFromTimetableRows(timetableRows, weekday, slot);
      if (slug) map.set(slot, formatTimetableSubject(slug));
    }
    return map;
  }, [timetableRows, sessionDate]);

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
      const [allClasses, catalogSubjects, curriculum, eventsRes] = await Promise.all([
        loadSchoolClasses(schoolId),
        loadCurriculumSubjects(),
        loadCurriculumContext(schoolId),
        withSchoolFilter(
          supabase.from('calendar_events').select(CALENDAR_SELECT),
          schoolId
        ),
      ]);
      setClasses(allClasses);
      setSubjects(catalogSubjects);
      setUnits(curriculum.units);
      setWeekPlans(curriculum.weekPlans);
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
    if (!klass?.id || !sessionDate || !schoolId) {
      setTimetableRows([]);
      return;
    }
    let mounted = true;
    (async () => {
      try {
        const rows = await loadTimetableForWeek(
          schoolId,
          klass.id,
          academicWeekIndex(sessionDate)
        );
        if (mounted) setTimetableRows(rows);
      } catch (loadError) {
        if (mounted) {
          setTimetableRows([]);
          setError(loadError);
        }
      }
    })();
    return () => {
      mounted = false;
    };
  }, [klass?.id, schoolId, sessionDate]);

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

  function handleSaveAttendance(event) {
    event.preventDefault();
    if (!klass?.id || !subject?.id || !sessionDate || !snapshot) {
      if (!subject?.id) {
        setError(new Error('Bu ders saati için program girilmemiş.'));
      }
      return;
    }
    if (!canLog) {
      setError(new Error('Canlı kayıt 20:00\'a kadar. Haftalık telafi listesini kullanın.'));
      return;
    }
    if (isSubjectMismatch) {
      setMismatchConfirmOpen(true);
      return;
    }
    performSaveAttendance();
  }

  async function performSaveAttendance() {
    setMismatchConfirmOpen(false);
    const isFirstSaveForSlot = !filledSlots.includes(slotIndex);
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
      if (isFirstSaveForSlot && slotIndex === 1 && sessionDate === istanbulDateIso()) {
        try {
          await notifyAttendanceFirstLesson({ schoolId, source: 'atlas', sessionId: id });
        } catch {
          // Best-effort: attendance already saved either way.
        }
      }
      if (isEmptySlot) {
        try {
          const row = await fillEmptyTimetableSlot({
            classId: klass.id,
            weekIndex: snapshot.weekIndex,
            weekday: isoWeekday(sessionDate),
            slotIndex,
          });
          setTimetableRows((current) => [...current, row]);
        } catch {
          // Best-effort: attendance already saved; someone else may have filled the
          // cell in the meantime, or the teacher's branş isn't one of the fixed
          // timetable subjects. Either way it's not worth blocking on.
        }
      }
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

  if (!classes.length) {
    return (
      <section className="director-panel">
        <h2 className="dash-section-title">Ders</h2>
        <p className="dash-hint">Henüz şube tanımlı değil. Müdürden şube oluşturmasını isteyin.</p>
      </section>
    );
  }

  if (selectedClassId && slotSubjectSlug && !isSubjectMismatch && !plannedSubject?.id) {
    return (
      <section className="director-panel">
        <h2 className="dash-section-title">Ders</h2>
        <p className="dash-hint">
          Seçilen sınıf için {formatTimetableSubject(slotSubjectSlug)} müfredatı bulunamadı.
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
          subjectName="Haftalık program"
          hint="Yoklama girmek için sınıf seçin. Ders, o günün programından gelir."
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
            plannedBySlot={plannedBySlot}
          />
          {isEmptySlot && ownSubject ? (
            <p className="dash-hint">
              Bu ders saati için program girilmemiş. {ownSubject.name} olarak yoklama
              alabilirsiniz; kaydettiğinizde haftalık program da buna göre doldurulur.
            </p>
          ) : isEmptySlot ? (
            <p className="dash-hint">
              Bu ders saati için program girilmemiş. Müdür veya rehberlikçi Haftalık ders
              programından doldurmalı.
            </p>
          ) : isSubjectMismatch ? (
            <p className="dash-hint">
              Bu ders saati normalde {formatTimetableSubject(slotSubjectSlug)}. {ownSubject.name}{' '}
              olarak yoklama alabilirsiniz; haftalık programdaki plan değişmeden kalır.
            </p>
          ) : null}
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
            disabled={filledSlots.includes(slotIndex) || !subject?.id}
            label="Yoklamayı kaydet"
            sendingLabel="Kaydediliyor…"
          />
        )}
      </form>

      <ConfirmDialog
        open={mismatchConfirmOpen}
        title="Farklı ders için yoklama"
        confirmLabel="Yoklamayı kaydet"
        confirming={saving}
        onCancel={() => {
          if (!saving) setMismatchConfirmOpen(false);
        }}
        onConfirm={performSaveAttendance}
      >
        <p className="app-dialog__lead">
          Bu ders saati haftalık programda <strong>{formatTimetableSubject(slotSubjectSlug)}</strong>{' '}
          olarak planlı. Yoklamayı <strong>{ownSubject?.name}</strong> dersi için kaydetmek
          istiyor musunuz?
        </p>
        <p className="dash-hint">Haftalık programdaki plan değişmeden kalır.</p>
      </ConfirmDialog>
    </section>
    </AnimatedView>
  );
}
