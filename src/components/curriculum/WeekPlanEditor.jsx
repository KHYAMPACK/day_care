import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  assignSubjectWeekSpan,
  getWeekPlanForSubject,
} from '../../lib/curriculum';
import { InlineError } from '../dashboardUi';
import { Icon } from '../ui/Icon';

const SPAN_AUTOSAVE_MS = 600;

export default function WeeklySubjectPicker({
  subjects,
  unitsBySubject,
  weekPlans,
  grade,
  weekIndex,
  schoolId,
  currentWeekIndex,
  onPlanChange,
}) {
  const [pendingKey, setPendingKey] = useState(null);
  const [error, setError] = useState(null);
  const timersRef = useRef(new Map());

  useEffect(
    () => () => {
      for (const timer of timersRef.current.values()) clearTimeout(timer);
      timersRef.current.clear();
    },
    []
  );

  const assignedBySubject = useMemo(() => {
    const map = new Map();
    for (const subject of subjects) {
      const plan = getWeekPlanForSubject(weekPlans, {
        grade,
        weekIndex,
        subjectId: subject.id,
      });
      map.set(subject.id, plan?.unit_id ?? '');
    }
    return map;
  }, [subjects, weekPlans, grade, weekIndex]);

  const persistAssignment = useCallback(
    async (subjectId, unitId) => {
      const key = `${subjectId}:${weekIndex}`;
      setPendingKey(key);
      setError(null);
      try {
        await assignSubjectWeekSpan({
          schoolId,
          grade,
          subjectId,
          spanStart: weekIndex,
          spanEnd: weekIndex,
          unitId: unitId || null,
        });
        onPlanChange?.({ subjectId, weekIndex, unitId: unitId || null });
      } catch (saveError) {
        setError(saveError);
      } finally {
        setPendingKey((current) => (current === key ? null : current));
      }
    },
    [grade, onPlanChange, schoolId, weekIndex]
  );

  function scheduleSave(subjectId, unitId) {
    const key = `${subjectId}:${weekIndex}`;
    const existing = timersRef.current.get(key);
    if (existing) clearTimeout(existing);
    const timer = setTimeout(() => {
      timersRef.current.delete(key);
      void persistAssignment(subjectId, unitId);
    }, SPAN_AUTOSAVE_MS);
    timersRef.current.set(key, timer);
  }

  if (!subjects.length) {
    return <p className="dash-hint">Bu sınıf için ders bulunamadı.</p>;
  }

  return (
    <div className="cur-week-subject-picker">
      {error ? <InlineError error={error} context="curriculum" /> : null}
      <ul className="cur-week-subject-list">
        {subjects.map((subject) => {
          const subjectUnits = unitsBySubject.get(subject.id) ?? [];
          const selectedUnitId = assignedBySubject.get(subject.id) ?? '';
          const saving = pendingKey === `${subject.id}:${weekIndex}`;

          return (
            <li key={subject.id} className="cur-week-subject-row">
              <span
                className="cur-week-subject-row__label"
                style={{ '--cur-subject': subject.color }}
              >
                <Icon name={subject.icon} size={16} /> {subject.name}
              </span>
              <label className="cur-week-subject-row__field">
                <select
                  className="dash-input"
                  value={selectedUnitId}
                  disabled={saving || subjectUnits.length === 0}
                  aria-label={`${subject.name} ünite seçimi`}
                  onChange={(event) => scheduleSave(subject.id, event.target.value)}
                >
                  <option value="">
                    {subjectUnits.length ? 'Ünite seçin…' : 'Ünite yok'}
                  </option>
                  {subjectUnits.map((unit) => (
                    <option key={unit.id} value={unit.id}>
                      {unit.sort_order}. {unit.title}
                    </option>
                  ))}
                </select>
              </label>
              {weekIndex === currentWeekIndex ? (
                <span className="cur-week-subject-row__badge">Şu an</span>
              ) : null}
              {saving ? <span className="cur-week-subject-row__status">Kaydediliyor…</span> : null}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
