import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  buildYearTimelineFromAssignmentMap,
  formatScheduleWeekRange,
  formatWeekRangeTr,
  replaceSubjectWeekPlans,
  saveCurriculumSubjectPlan,
  serializeWeekAssignmentsMap,
  weekAssignmentsMapFromPlans,
  weekAssignmentsMapToRows,
} from '../../lib/curriculum';
import { InlineError, SendButton } from '../dashboardUi';
import CollapsibleSection from '../ui/CollapsibleSection';
import { SavingOverlay } from '../ui/SavingOverlay';

const AUTOSAVE_MS = 900;

function cloneUnitRows(units) {
  return [...(units ?? [])]
    .sort((left, right) => (left.sort_order ?? 0) - (right.sort_order ?? 0))
    .map((unit) => ({
      id: unit.id,
      title: unit.title ?? '',
      sections: unit.sections ?? [],
    }));
}

function serializeUnitCatalog(list) {
  return JSON.stringify(
    (list ?? []).map((row, index) => ({
      title: String(row.title ?? '').trim(),
      order: index,
    }))
  );
}

function orderedSavedUnits(units) {
  return [...(units ?? [])].sort(
    (left, right) => (left.sort_order ?? 0) - (right.sort_order ?? 0)
  );
}

function draftKey() {
  return `draft-${crypto.randomUUID()}`;
}

function SubjectYearTimeline({ spans, academicWeeks, currentWeekIndex, subjectColor }) {
  const assignedWeeks = spans
    .filter((span) => !span.unassigned)
    .reduce((total, span) => total + (span.spanEnd - span.spanStart + 1), 0);

  return (
    <div className="cur-schedule-timeline" style={{ '--cur-subject': subjectColor }}>
      <div className="cur-schedule-timeline__meta">
        <span className="cur-schedule-timeline__label">Eğitim yılı</span>
        <span className="cur-schedule-timeline__stats">
          {assignedWeeks}/{academicWeeks} hafta atandı
        </span>
      </div>
      <div
        className="cur-schedule-timeline__track"
        role="img"
        aria-label={`${assignedWeeks} hafta atandı, ${academicWeeks - assignedWeeks} atanmadı`}
      >
        {spans.map((span, index) => {
          const durationWeeks = span.spanEnd - span.spanStart + 1;
          const widthPct = (durationWeeks / academicWeeks) * 100;
          const isCurrent =
            currentWeekIndex >= span.spanStart && currentWeekIndex <= span.spanEnd;

          return (
            <div
              key={`${span.unitId ?? 'empty'}-${span.spanStart}`}
              className={[
                'cur-schedule-timeline__segment',
                span.unassigned ? 'cur-schedule-timeline__segment--empty' : '',
                isCurrent ? 'cur-schedule-timeline__segment--current' : '',
              ]
                .filter(Boolean)
                .join(' ')}
              style={{
                width: `${widthPct}%`,
                '--seg-index': index,
              }}
              title={
                span.unassigned
                  ? `Atanmamış · ${formatScheduleWeekRange(span.spanStart, span.spanEnd)}`
                  : `${span.unit?.title ?? 'Konu'} · ${formatScheduleWeekRange(span.spanStart, span.spanEnd)}`
              }
            />
          );
        })}
      </div>
      <div className="cur-schedule-timeline__axis">
        <span>Hafta 1</span>
        <span>Hafta {academicWeeks}</span>
      </div>
    </div>
  );
}

export default function SubjectPlanEditor({
  subject,
  units,
  weekPlans,
  grade,
  schoolId,
  academicWeeks,
  currentWeekIndex,
  onSaved,
  onWeekPlansBatchChange,
}) {
  const [unitRows, setUnitRows] = useState(() => cloneUnitRows(units));
  const [weekAssignments, setWeekAssignments] = useState(() =>
    weekAssignmentsMapFromPlans(weekPlans, {
      grade,
      subjectId: subject.id,
      academicWeeks,
    })
  );
  const [newUnitTitle, setNewUnitTitle] = useState('');
  const [saveStatus, setSaveStatus] = useState('idle');
  const [saveTarget, setSaveTarget] = useState(null);
  const [error, setError] = useState(null);

  const unitRowsRef = useRef(unitRows);
  const unitsRef = useRef(units);
  const weekAssignmentsRef = useRef(weekAssignments);
  const weekPlansRef = useRef(weekPlans);
  const savingRef = useRef(false);
  const queuedRef = useRef(false);
  const savedFlashTimerRef = useRef(null);
  const onSavedRef = useRef(onSaved);
  const onWeekPlansBatchChangeRef = useRef(onWeekPlansBatchChange);
  const persistRef = useRef(null);

  unitRowsRef.current = unitRows;
  unitsRef.current = units;
  weekAssignmentsRef.current = weekAssignments;
  weekPlansRef.current = weekPlans;
  onSavedRef.current = onSaved;
  onWeekPlansBatchChangeRef.current = onWeekPlansBatchChange;

  useEffect(() => {
    const cloned = cloneUnitRows(units);
    setUnitRows(cloned);
    setWeekAssignments(
      weekAssignmentsMapFromPlans(weekPlans, {
        grade,
        subjectId: subject.id,
        academicWeeks,
      })
    );
    setError(null);
    setSaveStatus('idle');
    setSaveTarget(null);
  }, [subject.id, academicWeeks]);

  useEffect(() => {
    const clonedUnits = cloneUnitRows(units);
    if (serializeUnitCatalog(clonedUnits) === serializeUnitCatalog(unitRowsRef.current)) {
      setUnitRows(clonedUnits);
    }

    const nextAssignments = weekAssignmentsMapFromPlans(weekPlans, {
      grade,
      subjectId: subject.id,
      academicWeeks,
    });
    if (
      serializeWeekAssignmentsMap(nextAssignments, academicWeeks) ===
      serializeWeekAssignmentsMap(weekAssignmentsRef.current, academicWeeks)
    ) {
      setWeekAssignments(nextAssignments);
    }
  }, [units, weekPlans, grade, subject.id, academicWeeks]);

  const savedUnitsOrdered = useMemo(() => orderedSavedUnits(units), [units]);

  const hasDuplicateUnitTitles = useMemo(() => {
    const titles = unitRows
      .map((row) => String(row.title ?? '').trim())
      .filter(Boolean);
    return new Set(titles).size !== titles.length;
  }, [unitRows]);

  const unitsDirty = useMemo(
    () => serializeUnitCatalog(unitRows) !== serializeUnitCatalog(savedUnitsOrdered),
    [unitRows, savedUnitsOrdered]
  );

  const savedWeekAssignments = useMemo(
    () =>
      weekAssignmentsMapFromPlans(weekPlans, {
        grade,
        subjectId: subject.id,
        academicWeeks,
      }),
    [weekPlans, grade, subject.id, academicWeeks]
  );

  const scheduleDirty = useMemo(
    () =>
      serializeWeekAssignmentsMap(weekAssignments, academicWeeks) !==
      serializeWeekAssignmentsMap(savedWeekAssignments, academicWeeks),
    [weekAssignments, savedWeekAssignments, academicWeeks]
  );

  const isDirty = unitsDirty || scheduleDirty;

  const hasEmptyUnitTitles = useMemo(
    () => unitRows.some((row) => !String(row.title ?? '').trim()),
    [unitRows]
  );

  const hasInvalidUnitTitles = hasEmptyUnitTitles || hasDuplicateUnitTitles;

  const localAssignedWeekCount = useMemo(() => {
    let count = 0;
    for (let week = 1; week <= academicWeeks; week += 1) {
      if (weekAssignments[week]) count += 1;
    }
    return count;
  }, [weekAssignments, academicWeeks]);

  const timelineSpans = useMemo(
    () => buildYearTimelineFromAssignmentMap(weekAssignments, unitRows, academicWeeks),
    [weekAssignments, unitRows, academicWeeks]
  );

  const persistChanges = useCallback(async () => {
    const currentUnits = unitRowsRef.current;
    const currentSavedUnits = unitsRef.current;
    const currentAssignments = weekAssignmentsRef.current;
    const shouldSaveUnits =
      serializeUnitCatalog(currentUnits) !== serializeUnitCatalog(orderedSavedUnits(currentSavedUnits));
    const shouldSaveSchedule =
      serializeWeekAssignmentsMap(currentAssignments, academicWeeks) !==
      serializeWeekAssignmentsMap(
        weekAssignmentsMapFromPlans(weekPlansRef.current, {
          grade,
          subjectId: subject.id,
          academicWeeks,
        }),
        academicWeeks
      );

    if (!shouldSaveUnits && !shouldSaveSchedule) return;
    if (shouldSaveUnits && currentUnits.some((row) => !String(row.title ?? '').trim())) {
      setSaveStatus('invalid');
      return;
    }
    if (shouldSaveUnits && hasDuplicateUnitTitles) {
      setSaveStatus('invalid');
      return;
    }

    if (savingRef.current) {
      queuedRef.current = true;
      return;
    }

    savingRef.current = true;
    setSaveStatus('saving');
    setSaveTarget(shouldSaveUnits && shouldSaveSchedule ? 'all' : shouldSaveUnits ? 'units' : 'schedule');
    setError(null);

    try {
      let savedUnits = currentSavedUnits;

      if (shouldSaveUnits) {
        savedUnits = await saveCurriculumSubjectPlan(
          subject.id,
          currentUnits.map((row) => ({
            ...row,
            duration_weeks: 1,
          })),
          { existingUnitIds: currentSavedUnits.map((unit) => unit.id) }
        );
        const cloned = cloneUnitRows(savedUnits);
        unitsRef.current = savedUnits;
        setUnitRows(cloned);
        await onSavedRef.current?.(savedUnits);

        const idByTitle = new Map(savedUnits.map((unit) => [unit.title, unit.id]));
        setWeekAssignments((current) => {
          const next = { ...current };
          for (let week = 1; week <= academicWeeks; week += 1) {
            const unitId = next[week];
            if (!unitId) continue;
            const row = currentUnits.find((unit) => unit.id === unitId);
            if (row?.title && idByTitle.has(row.title)) {
              next[week] = idByTitle.get(row.title);
            } else if (!savedUnits.some((unit) => unit.id === unitId)) {
              next[week] = null;
            }
          }
          weekAssignmentsRef.current = next;
          return next;
        });
      }

      if (shouldSaveSchedule) {
        const assignments = weekAssignmentsMapToRows(weekAssignmentsRef.current, academicWeeks);
        const syncedPlans = await replaceSubjectWeekPlans({
          schoolId,
          grade,
          subjectId: subject.id,
          assignments,
          academicWeeks,
        });
        onWeekPlansBatchChangeRef.current?.({ subjectId: subject.id, plans: syncedPlans });
      }

      setSaveStatus('saved');
      if (savedFlashTimerRef.current) clearTimeout(savedFlashTimerRef.current);
      savedFlashTimerRef.current = setTimeout(() => {
        setSaveStatus('idle');
        setSaveTarget(null);
      }, 2000);
    } catch (saveError) {
      setError(saveError);
      setSaveStatus('error');
      setSaveTarget(null);
    } finally {
      savingRef.current = false;
      if (queuedRef.current) {
        queuedRef.current = false;
        void persistRef.current?.();
      }
    }
  }, [academicWeeks, grade, schoolId, subject.id]);

  persistRef.current = persistChanges;

  useEffect(() => {
    if (!isDirty) {
      setSaveStatus((status) => (status === 'pending' ? 'idle' : status));
      return;
    }
    if (unitsDirty && (hasEmptyUnitTitles || hasDuplicateUnitTitles)) {
      setSaveStatus('invalid');
      return;
    }

    setSaveStatus('pending');
    const timer = setTimeout(() => {
      void persistRef.current?.();
    }, AUTOSAVE_MS);

    return () => clearTimeout(timer);
  }, [unitRows, weekAssignments, isDirty, unitsDirty, hasEmptyUnitTitles, hasDuplicateUnitTitles]);

  useEffect(
    () => () => {
      if (savedFlashTimerRef.current) clearTimeout(savedFlashTimerRef.current);
    },
    []
  );

  useEffect(() => {
    return () => {
      if (savingRef.current) return;
      const dirty =
        serializeUnitCatalog(unitRowsRef.current) !==
          serializeUnitCatalog(orderedSavedUnits(unitsRef.current)) ||
        serializeWeekAssignmentsMap(weekAssignmentsRef.current, academicWeeks) !==
          serializeWeekAssignmentsMap(
            weekAssignmentsMapFromPlans(weekPlansRef.current, {
              grade,
              subjectId: subject.id,
              academicWeeks,
            }),
            academicWeeks
          );
      const valid = !unitRowsRef.current.some((row) => !String(row.title ?? '').trim());
      if (dirty && valid) void persistRef.current?.();
    };
  }, [subject.id, academicWeeks, grade]);

  function updateUnitTitle(index, title) {
    setUnitRows((current) =>
      current.map((row, rowIndex) => (rowIndex === index ? { ...row, title } : row))
    );
    setError(null);
  }

  function commitUnitTitle(index) {
    setUnitRows((current) =>
      current.map((row, rowIndex) => {
        if (rowIndex !== index) return row;
        const trimmed = String(row.title ?? '').trim();
        const existingUnit = units.find((unit) => unit.title === trimmed);
        const keepRowId =
          row.id &&
          !String(row.id).startsWith('draft-') &&
          units.some((unit) => unit.id === row.id && unit.title === trimmed);

        return {
          ...row,
          title: trimmed,
          id: keepRowId ? row.id : existingUnit?.id ?? row.id ?? draftKey(),
          sections: existingUnit?.sections ?? row.sections ?? [],
        };
      })
    );
    setError(null);
  }

  function moveUnitRow(index, direction) {
    setUnitRows((current) => {
      const next = [...current];
      const target = index + direction;
      if (target < 0 || target >= next.length) return current;
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
    setError(null);
  }

  function removeUnitRow(index) {
    const removedId = unitRows[index]?.id;
    setUnitRows((current) => current.filter((_, rowIndex) => rowIndex !== index));
    if (removedId) {
      setWeekAssignments((current) => {
        const next = { ...current };
        for (let week = 1; week <= academicWeeks; week += 1) {
          if (next[week] === removedId) next[week] = null;
        }
        return next;
      });
    }
    setError(null);
  }

  function handleAddUnit(event) {
    event.preventDefault();
    const title = String(newUnitTitle ?? '').trim();
    if (!title) return;
    if (unitRows.some((row) => String(row.title ?? '').trim() === title)) {
      setError(new Error('Bu isimde bir ünite zaten var.'));
      return;
    }
    const existingUnit = units.find((unit) => unit.title === title);
    setUnitRows((current) => [
      ...current,
      {
        id: existingUnit?.id ?? draftKey(),
        title,
        sections: existingUnit?.sections ?? [],
      },
    ]);
    setNewUnitTitle('');
    setError(null);
  }

  function assignWeek(weekIndex, unitId) {
    setWeekAssignments((current) => ({
      ...current,
      [weekIndex]: unitId || null,
    }));
    setError(null);
  }

  const statusLabel = (() => {
    if (saveStatus === 'saved') return 'Kaydedildi';
    if (hasEmptyUnitTitles && unitsDirty) return 'Her ünite için ad girin';
    if (hasDuplicateUnitTitles && unitsDirty) return 'Ünite adları benzersiz olmalı';
    if (saveStatus === 'invalid') return 'Ünite adlarını kontrol edin';
    if (saveStatus === 'error') return 'Kaydedilemedi';
    if (isDirty) return 'Kaydedilecek…';
    return 'Güncel';
  })();

  const saveOverlayTitle =
    saveStatus === 'saved'
      ? `${subject.name} kaydedildi`
      : saveTarget === 'units'
        ? `${subject.name} üniteleri kaydediliyor…`
        : saveTarget === 'schedule'
          ? `${subject.name} hafta planı kaydediliyor…`
          : `${subject.name} kaydediliyor…`;

  const saveOverlayMessage =
    saveStatus === 'saved'
      ? saveTarget === 'units'
        ? 'Ünite listesi güncellendi.'
        : saveTarget === 'schedule'
          ? 'Haftalık atamalar güncellendi.'
          : 'Plan güncellendi.'
      : 'Kaydedilirken sayfadan ayrılmayın veya sekmeyi kapatmayın.';

  return (
    <div className="cur-subject-plan__editor">
      <SavingOverlay
        open={saveStatus === 'saving' || saveStatus === 'saved'}
        phase={saveStatus === 'saved' ? 'success' : 'loading'}
        title={saveOverlayTitle}
        message={saveOverlayMessage}
      />

      {error ? <InlineError error={error} context="curriculum" /> : null}

      <SubjectYearTimeline
        spans={timelineSpans}
        academicWeeks={academicWeeks}
        currentWeekIndex={currentWeekIndex}
        subjectColor={subject.color}
      />

      <CollapsibleSection
        title="Yıllık düzenleme"
        meta={`${localAssignedWeekCount}/${academicWeeks} hafta atandı${scheduleDirty ? ' · kaydedilecek' : ''}`}
        defaultOpen
      >
        <p className="dash-hint cur-year-schedule__lead">
          Hafta 1–{academicWeeks} arasında her haftaya bir ünite atayın. Boş bırakılan haftalar
          atanmamış görünür.
        </p>

        {unitRows.length === 0 ? (
          <p className="dash-hint cur-subject-plan__empty">
            Önce alttaki bölümden ünite ekleyin, sonra haftalara atayın.
          </p>
        ) : (
          <div className="cur-year-week-grid">
            {Array.from({ length: academicWeeks }, (_, index) => {
              const week = index + 1;
              const unitId = weekAssignments[week] ?? '';
              const isCurrentWeek = week === currentWeekIndex;

              return (
                <label
                  key={week}
                  className={`cur-year-week-grid__row${isCurrentWeek ? ' cur-year-week-grid__row--current' : ''}${!unitId ? ' cur-year-week-grid__row--empty' : ''}`}
                >
                  <span className="cur-year-week-grid__label">
                    <strong>Hafta {week}</strong>
                    <span className="cur-year-week-grid__dates">{formatWeekRangeTr(week)}</span>
                  </span>
                  <select
                    className="dash-input"
                    value={unitId}
                    onChange={(event) => assignWeek(week, event.target.value || null)}
                    aria-label={`Hafta ${week} ünite ataması`}
                  >
                    <option value="">Atanmamış</option>
                    {unitRows.map((row) => (
                      <option key={row.id} value={row.id}>
                        {row.title || 'Adsız ünite'}
                      </option>
                    ))}
                  </select>
                </label>
              );
            })}
          </div>
        )}
      </CollapsibleSection>

      <CollapsibleSection
        title="Üniteler"
        meta={`${unitRows.length} ünite${unitsDirty ? ' · kaydedilecek' : ''}`}
        variant="nested"
      >
        <p className="dash-hint">
          Ünite ekleyin, adını yazarak düzenleyin veya silin. Bu bölüm yıllık takvime doğrudan
          ekleme yapmaz; atama yukarıdaki hafta listesinden yapılır.
        </p>

        {unitRows.length === 0 ? (
          <p className="dash-hint cur-subject-plan__empty">Henüz ünite yok. Aşağıdan ekleyin.</p>
        ) : (
          <ol className="cur-unit-catalog-list">
            {unitRows.map((row, index) => (
              <li key={row.id} className="cur-unit-catalog-row">
                <span className="cur-year-schedule__order">{index + 1}</span>
                <input
                  className="dash-input"
                  type="text"
                  value={row.title}
                  onChange={(event) => updateUnitTitle(index, event.target.value)}
                  onBlur={() => commitUnitTitle(index)}
                  placeholder="Ünite adı"
                  aria-label={`${index + 1}. ünite adı`}
                />
                <div className="cur-year-schedule__actions">
                  <button
                    type="button"
                    className="demo-btn demo-btn--ghost demo-btn--sm"
                    disabled={index === 0}
                    onClick={() => moveUnitRow(index, -1)}
                    aria-label="Yukarı taşı"
                  >
                    ↑
                  </button>
                  <button
                    type="button"
                    className="demo-btn demo-btn--ghost demo-btn--sm"
                    disabled={index === unitRows.length - 1}
                    onClick={() => moveUnitRow(index, 1)}
                    aria-label="Aşağı taşı"
                  >
                    ↓
                  </button>
                  <button
                    type="button"
                    className="demo-btn demo-btn--danger demo-btn--sm"
                    onClick={() => removeUnitRow(index)}
                  >
                    Sil
                  </button>
                </div>
              </li>
            ))}
          </ol>
        )}

        <form className="cur-unit-add-form cur-year-schedule__add" onSubmit={handleAddUnit}>
          <label className="dash-label cur-unit-add-form__title">
            Yeni ünite
            <input
              className="dash-input"
              type="text"
              value={newUnitTitle}
              onChange={(event) => setNewUnitTitle(event.target.value)}
              placeholder="Ünite adını yazın…"
            />
          </label>
          <SendButton
            sending={false}
            disabled={!String(newUnitTitle ?? '').trim()}
            label="Ünite ekle"
          />
        </form>
      </CollapsibleSection>

      <div className="cur-subject-plan__footer">
        <p className="dash-hint">
          {unitRows.length} ünite · {localAssignedWeekCount}/{academicWeeks} hafta atandı
        </p>
        <p
          className={`cur-subject-plan__save-status cur-subject-plan__save-status--${hasInvalidUnitTitles ? 'invalid' : saveStatus}`}
          aria-live="polite"
        >
          {statusLabel}
        </p>
      </div>
    </div>
  );
}
