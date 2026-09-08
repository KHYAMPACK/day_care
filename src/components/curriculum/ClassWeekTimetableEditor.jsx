import { useCallback, useEffect, useMemo, useState } from 'react';
import { formatClassLabel, formatWeekRangeTr } from '../../lib/curriculum';
import { ATLAS_SLOT_COUNT } from '../../lib/atlasLessons';
import {
  TIMETABLE_WEEKDAYS,
  copyTimetableFromPreviousWeek,
  emptyTimetableGrid,
  loadTimetableForWeek,
  rowsToTimetableGrid,
  saveTimetableWeek,
  timetableSubjectsForGrade,
} from '../../lib/classWeekTimetable';
import { InlineError, SendButton, SuccessMessage } from '../dashboardUi';

export default function ClassWeekTimetableEditor({
  schoolId,
  classes = [],
  academicWeeks = 41,
  currentWeekIndex = 1,
}) {
  const [classId, setClassId] = useState(classes[0]?.id ?? '');
  const [weekIndex, setWeekIndex] = useState(() =>
    Math.min(academicWeeks, Math.max(1, currentWeekIndex))
  );
  const [grid, setGrid] = useState(() => emptyTimetableGrid());
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  const klass = classes.find((row) => row.id === classId) ?? null;
  const subjectOptions = useMemo(
    () => timetableSubjectsForGrade(klass?.grade),
    [klass?.grade]
  );

  useEffect(() => {
    if (!classId && classes[0]?.id) setClassId(classes[0].id);
  }, [classes, classId]);

  const load = useCallback(async () => {
    if (!schoolId || !classId || !weekIndex) return;
    setLoading(true);
    setError(null);
    try {
      const rows = await loadTimetableForWeek(schoolId, classId, weekIndex);
      setGrid(rowsToTimetableGrid(rows));
    } catch (loadError) {
      setError(loadError);
      setGrid(emptyTimetableGrid());
    } finally {
      setLoading(false);
    }
  }, [schoolId, classId, weekIndex]);

  useEffect(() => {
    load();
  }, [load]);

  function patchCell(weekday, slot, value) {
    setSuccess(null);
    setGrid((current) => ({
      ...current,
      [weekday]: {
        ...(current[weekday] ?? {}),
        [slot]: value,
      },
    }));
  }

  async function handleSave(event) {
    event.preventDefault();
    if (!klass?.id) return;
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      await saveTimetableWeek({
        schoolId,
        classId: klass.id,
        weekIndex,
        grid,
      });
      setSuccess('Haftalık program kaydedildi.');
    } catch (saveError) {
      setError(saveError);
    } finally {
      setSaving(false);
    }
  }

  async function handleCopyPrevious() {
    if (!klass?.id) return;
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const rows = await copyTimetableFromPreviousWeek({
        schoolId,
        classId: klass.id,
        weekIndex,
      });
      setGrid(rowsToTimetableGrid(rows));
      setSuccess(`Hafta ${weekIndex - 1} programı kopyalandı.`);
    } catch (copyError) {
      setError(copyError);
    } finally {
      setSaving(false);
    }
  }

  if (!classes.length) {
    return <p className="dash-hint">Önce şube oluşturun, ardından haftalık programı girin.</p>;
  }

  return (
    <form className="class-week-timetable" onSubmit={handleSave}>
      <p className="dash-hint">
        Her şube ve hafta için Pazartesi–Cuma günlerinde 4 dersi seçin. Atlas yoklaması bu
        programdaki derse göre kaydedilir.
      </p>

      <div className="class-week-timetable__toolbar">
        <label className="dash-label">
          Şube
          <select
            className="dash-input"
            value={classId}
            onChange={(event) => setClassId(event.target.value)}
            disabled={loading || saving}
          >
            {classes.map((row) => (
              <option key={row.id} value={row.id}>
                {formatClassLabel(row.grade, row.name)}
              </option>
            ))}
          </select>
        </label>
        <label className="dash-label">
          Hafta
          <select
            className="dash-input"
            value={weekIndex}
            onChange={(event) => setWeekIndex(Number(event.target.value))}
            disabled={loading || saving}
          >
            {Array.from({ length: academicWeeks }, (_, index) => index + 1).map((week) => (
              <option key={week} value={week}>
                Hafta {week}
                {week === currentWeekIndex ? ' · şu an' : ''}
              </option>
            ))}
          </select>
        </label>
        <p className="dash-hint class-week-timetable__range">{formatWeekRangeTr(weekIndex)}</p>
      </div>

      {error ? <InlineError error={error} context="general" /> : null}
      {success ? <SuccessMessage message={success} /> : null}

      <div className="class-week-timetable__table-wrap">
        <table className="class-week-timetable__table">
          <thead>
            <tr>
              <th>Gün</th>
              {Array.from({ length: ATLAS_SLOT_COUNT }, (_, index) => (
                <th key={index}>{index + 1}. ders</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {TIMETABLE_WEEKDAYS.map((day) => (
              <tr key={day.id}>
                <th scope="row">{day.label}</th>
                {Array.from({ length: ATLAS_SLOT_COUNT }, (_, index) => {
                  const slot = index + 1;
                  return (
                    <td key={slot}>
                      <select
                        className="dash-input"
                        value={grid[day.id]?.[slot] ?? ''}
                        onChange={(event) => patchCell(day.id, slot, event.target.value)}
                        disabled={loading || saving}
                        aria-label={`${day.label} ${slot}. ders`}
                      >
                        <option value="">Boş</option>
                        {subjectOptions.map((subject) => (
                          <option key={subject.slug} value={subject.slug}>
                            {subject.name}
                          </option>
                        ))}
                      </select>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="class-week-timetable__actions">
        <button
          type="button"
          className="demo-btn demo-btn--ghost"
          disabled={saving || loading || weekIndex <= 1}
          onClick={handleCopyPrevious}
        >
          Önceki haftayı kopyala
        </button>
        <SendButton sending={saving} disabled={loading} label="Programı kaydet" sendingLabel="Kaydediliyor…" />
      </div>
    </form>
  );
}
