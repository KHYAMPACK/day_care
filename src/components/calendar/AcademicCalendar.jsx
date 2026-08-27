import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { withSchoolFilter } from '../../lib/tenant';
import {
  CALENDAR_EVENT_TYPES,
  CALENDAR_SELECT,
  STUDENT_GRADES,
  addDaysIso,
  buildReminderBody,
  eventVisibleForGrades,
  formatCalendarRangeTr,
  formatStartsAtTr,
  formatStudentGrade,
  getCalendarTypeMeta,
  istanbulDateIso,
} from '../../lib/calendar';
import { readExamDemoConfig } from '../../lib/examDemoConfig';
import { InlineError, SendButton, SuccessMessage } from '../dashboardUi';
import { Icon } from '../ui/Icon';

async function loadCalendarRows(schoolId) {
  const { data, error } = await withSchoolFilter(
    supabase
      .from('calendar_events')
      .select(CALENDAR_SELECT)
      .order('starts_on', { ascending: true })
      .order('title', { ascending: true }),
    schoolId
  );
  if (error) throw error;
  return data ?? [];
}

const WEEKDAYS = ['Pzt', 'Sal', 'Çar', 'Per', 'Cum', 'Cmt', 'Paz'];

const DAY_FILL_PRIORITY = [
  'holiday',
  'common_exam',
  'exam',
  'camp',
  'school_start',
  'course_start',
  'parent_meeting',
  'activity',
  'school_end',
  'important_day',
];

function primaryEventType(events) {
  if (!events.length) return null;
  return DAY_FILL_PRIORITY.find((type) => events.some((event) => event.event_type === type))
    ?? events[0].event_type;
}

const EMPTY_FORM = {
  title: '',
  body: '',
  event_type: 'activity',
  starts_on: '',
  ends_on: '',
  starts_at: '',
  audience_grades: [],
  notify: true,
};

function monthLabel(year, monthIndex) {
  return new Date(year, monthIndex, 1).toLocaleDateString('tr-TR', {
    month: 'long',
    year: 'numeric',
  });
}

function toIsoDate(year, monthIndex, day) {
  return `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function buildMonthCells(year, monthIndex) {
  const first = new Date(year, monthIndex, 1);
  const startOffset = (first.getDay() + 6) % 7;
  const daysInMonth = new Date(year, monthIndex + 1, 0).getDate();
  const cells = [];

  for (let index = 0; index < startOffset; index += 1) {
    cells.push(null);
  }
  for (let day = 1; day <= daysInMonth; day += 1) {
    cells.push(toIsoDate(year, monthIndex, day));
  }
  while (cells.length % 7 !== 0) {
    cells.push(null);
  }
  return cells;
}

function eventToForm(event) {
  return {
    title: event.title,
    body: event.body ?? '',
    event_type: event.event_type,
    starts_on: event.starts_on,
    ends_on: event.ends_on,
    starts_at: formatStartsAtTr(event.starts_at) ?? '',
    audience_grades: event.audience_grades ?? [],
    notify: event.notify !== false,
  };
}

function EventCard({ event, canEdit, onEdit, onDelete, deleting }) {
  const meta = getCalendarTypeMeta(event.event_type);
  const time = formatStartsAtTr(event.starts_at);
  const grades = event.audience_grades?.length
    ? event.audience_grades.map((grade) => formatStudentGrade(grade)).join(', ')
    : 'Tüm okul';

  return (
    <article className={`cal-event cal-event--${event.event_type}`}>
      <div className="demo-row-between">
        <h3 className="cal-event__title">{event.title}</h3>
        <span className={`demo-pill cal-pill cal-pill--${event.event_type}`}>
          <Icon name={meta.icon} size={14} /> {meta.label}
        </span>
      </div>
      <p className="demo-meta">
        {formatCalendarRangeTr(event.starts_on, event.ends_on)}
        {time ? ` · ${time}` : ''}
        {` · ${grades}`}
      </p>
      {event.body ? <p className="dash-hint">{event.body}</p> : null}
      {canEdit ? (
        <div className="ann-actions">
          <button type="button" className="demo-btn" onClick={() => onEdit(event)}>
            Düzenle
          </button>
          <button
            type="button"
            className="match-item__remove"
            onClick={() => onDelete(event)}
            disabled={deleting}
          >
            {deleting ? 'Siliniyor…' : 'Sil'}
          </button>
        </div>
      ) : null}
    </article>
  );
}

export function TomorrowEventsCard({ events, onOpenCalendar }) {
  if (!events.length) return null;

  return (
    <section className="cal-tomorrow">
      <div className="demo-row-between">
        <h2 className="dash-section-title">Yarın</h2>
        {onOpenCalendar ? (
          <button type="button" className="demo-btn" onClick={onOpenCalendar}>
            Takvime git
          </button>
        ) : null}
      </div>
      <ul className="cal-tomorrow__list">
        {events.map((event) => {
          const meta = getCalendarTypeMeta(event.event_type);
          return (
            <li key={event.id} className={`cal-tomorrow__item cal-event--${event.event_type}`}>
              <span aria-hidden="true">
                <Icon name={meta.icon} size={16} />
              </span>
              <div>
                <strong>{event.title}</strong>
                <p className="dash-hint">{buildReminderBody(event)}</p>
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

export default function AcademicCalendar({ schoolId, canEdit = false, viewerGrades = null }) {
  const today = istanbulDateIso();
  const [cursor, setCursor] = useState(() => {
    const [year, month] = today.split('-').map(Number);
    return { year, monthIndex: month - 1 };
  });
  const [selectedDay, setSelectedDay] = useState(today);
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [form, setForm] = useState({ ...EMPTY_FORM, starts_on: today, ends_on: today });
  const [editingId, setEditingId] = useState(null);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState(null);

  const visibleEvents = useMemo(() => {
    let rows = events;
    if (!canEdit) {
      const cfg = readExamDemoConfig();
      rows = rows.filter((event) => {
        if (event.event_type === 'common_exam' && !cfg.showCommonExams) return false;
        if (event.event_type === 'exam' && !cfg.showMockExams) return false;
        return true;
      });
    }
    if (canEdit || viewerGrades == null) return rows;
    return rows.filter((event) => eventVisibleForGrades(event, viewerGrades));
  }, [canEdit, events, viewerGrades]);

  const loadEvents = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const rows = await loadCalendarRows(schoolId);
      setEvents(rows);
    } catch (loadError) {
      setError(loadError);
      setEvents([]);
    } finally {
      setLoading(false);
    }
  }, [schoolId]);

  useEffect(() => {
    loadEvents();
  }, [loadEvents]);

  const cells = useMemo(
    () => buildMonthCells(cursor.year, cursor.monthIndex),
    [cursor.year, cursor.monthIndex]
  );

  const eventsByDay = useMemo(() => {
    const map = new Map();
    visibleEvents.forEach((event) => {
      let cursorDay = event.starts_on;
      while (cursorDay <= event.ends_on) {
        const list = map.get(cursorDay) ?? [];
        list.push(event);
        map.set(cursorDay, list);
        cursorDay = addDaysIso(cursorDay, 1);
      }
    });
    return map;
  }, [visibleEvents]);

  const selectedEvents = eventsByDay.get(selectedDay) ?? [];

  const upcoming = useMemo(
    () =>
      visibleEvents
        .filter((event) => event.ends_on >= today)
        .slice(0, 8),
    [today, visibleEvents]
  );

  function shiftMonth(delta) {
    setCursor((current) => {
      const date = new Date(current.year, current.monthIndex + delta, 1);
      return { year: date.getFullYear(), monthIndex: date.getMonth() };
    });
  }

  function updateForm(patch) {
    setForm((current) => {
      const next = { ...current, ...patch };
      if (patch.starts_on && !current.ends_on) {
        next.ends_on = patch.starts_on;
      }
      if (patch.starts_on && current.ends_on && current.ends_on < patch.starts_on) {
        next.ends_on = patch.starts_on;
      }
      return next;
    });
  }

  function toggleGrade(grade) {
    setForm((current) => {
      const selected = current.audience_grades.includes(grade)
        ? current.audience_grades.filter((item) => item !== grade)
        : [...current.audience_grades, grade].sort((a, b) => a - b);
      return { ...current, audience_grades: selected };
    });
  }

  function startEdit(event) {
    setEditingId(event.id);
    setForm(eventToForm(event));
    setSuccess(null);
    setError(null);
  }

  function resetForm() {
    setEditingId(null);
    setForm({ ...EMPTY_FORM, starts_on: selectedDay, ends_on: selectedDay });
  }

  async function handleSave(submitEvent) {
    submitEvent.preventDefault();
    setError(null);
    setSuccess(null);

    const title = form.title.trim();
    if (!title || !form.starts_on) {
      setError('Başlık ve başlangıç tarihi zorunludur.');
      return;
    }

    const endsOn = form.ends_on || form.starts_on;
    if (endsOn < form.starts_on) {
      setError('Bitiş tarihi başlangıçtan önce olamaz.');
      return;
    }

    const payload = {
      school_id: schoolId,
      title,
      body: form.body.trim(),
      event_type: form.event_type,
      starts_on: form.starts_on,
      ends_on: endsOn,
      starts_at: form.starts_at || null,
      audience_grades: form.audience_grades.length ? form.audience_grades : null,
      notify: form.notify,
    };
    if (!editingId) {
      payload.source = 'director';
    }

    setSaving(true);
    const query = editingId
      ? supabase.from('calendar_events').update(payload).eq('id', editingId)
      : supabase.from('calendar_events').insert(payload);
    const { error: saveError } = await query;
    setSaving(false);

    if (saveError) {
      setError(saveError);
      return;
    }

    setSuccess(editingId ? 'Etkinlik güncellendi.' : 'Etkinlik eklendi.');
    resetForm();
    await loadEvents();
  }

  async function handleDelete(event) {
    if (!window.confirm(`“${event.title}” silinsin mi?`)) return;
    setDeletingId(event.id);
    setError(null);
    const { error: deleteError } = await supabase
      .from('calendar_events')
      .delete()
      .eq('id', event.id);
    setDeletingId(null);
    if (deleteError) {
      setError(deleteError);
      return;
    }
    if (editingId === event.id) resetForm();
    await loadEvents();
  }

  return (
    <section className="demo-stack">
      <header className="dash-header">
        <h1 className="dash-title">Takvim</h1>
        <p className="dash-subtitle">
          2026–2027 ATLAS yılı: tatil, deneme sınavı ve önemli günler. Bildirimler bir gün önce
          akşam gönderilir.
        </p>
      </header>

      {error && <InlineError error={error} context="calendar" />}
      {success && <SuccessMessage message={success} />}

      <div className="cal-month dash-card">
        <div className="cal-month__nav">
          <button type="button" className="demo-btn" onClick={() => shiftMonth(-1)}>
            Önceki
          </button>
          <h2 className="dash-section-title">{monthLabel(cursor.year, cursor.monthIndex)}</h2>
          <button type="button" className="demo-btn" onClick={() => shiftMonth(1)}>
            Sonraki
          </button>
        </div>

        <div className="cal-grid" role="grid" aria-label="Ay takvimi">
          {WEEKDAYS.map((label) => (
            <div key={label} className="cal-grid__dow">
              {label}
            </div>
          ))}
          {cells.map((iso, index) => {
            if (!iso) {
              return <div key={`empty-${index}`} className="cal-grid__cell cal-grid__cell--empty" />;
            }
            const dayEvents = eventsByDay.get(iso) ?? [];
            const fillType = primaryEventType(dayEvents);
            const isToday = iso === today;
            const isSelected = iso === selectedDay;
            return (
              <button
                key={iso}
                type="button"
                className={`cal-grid__cell${fillType ? ` cal-grid__cell--${fillType}` : ''}${
                  isToday ? ' cal-grid__cell--today' : ''
                }${isSelected ? ' cal-grid__cell--selected' : ''}`}
                title={dayEvents.map((event) => event.title).join(' · ') || undefined}
                onClick={() => setSelectedDay(iso)}
              >
                <span className="cal-grid__num">{Number(iso.slice(-2))}</span>
              </button>
            );
          })}
        </div>

        <ul className="cal-legend">
          {CALENDAR_EVENT_TYPES.map((type) => (
            <li key={type.id}>
              <span className={`cal-dot cal-dot--${type.id}`} />
              {type.label}
            </li>
          ))}
        </ul>
      </div>

      {canEdit ? (
        <form className="dash-card dash-form" onSubmit={handleSave}>
          <h2 className="dash-section-title">{editingId ? 'Etkinliği düzenle' : 'Yeni etkinlik'}</h2>
          <label className="dash-label">
            Başlık
            <input
              className="dash-input"
              value={form.title}
              onChange={(event) => updateForm({ title: event.target.value })}
              required
            />
          </label>
          <label className="dash-label">
            Açıklama
            <textarea
              className="dash-textarea"
              rows={3}
              value={form.body}
              onChange={(event) => updateForm({ body: event.target.value })}
            />
          </label>
          <label className="dash-label">
            Tür
            <select
              className="dash-input"
              value={form.event_type}
              onChange={(event) => updateForm({ event_type: event.target.value })}
            >
              {CALENDAR_EVENT_TYPES.map((type) => (
                <option key={type.id} value={type.id}>
                  {type.label}
                </option>
              ))}
            </select>
          </label>
          <div className="cal-form-row">
            <label className="dash-label">
              Başlangıç
              <input
                className="dash-input"
                type="date"
                value={form.starts_on}
                onChange={(event) => updateForm({ starts_on: event.target.value })}
                required
              />
            </label>
            <label className="dash-label">
              Bitiş
              <input
                className="dash-input"
                type="date"
                value={form.ends_on}
                onChange={(event) => updateForm({ ends_on: event.target.value })}
              />
            </label>
          </div>
          <label className="dash-label">
            Saat (isteğe bağlı)
            <input
              className="dash-input"
              type="time"
              value={form.starts_at}
              onChange={(event) => updateForm({ starts_at: event.target.value })}
            />
          </label>
          <fieldset className="cal-grades">
            <legend className="dash-label-inline">Sınıflar (boş = tüm okul)</legend>
            {STUDENT_GRADES.map((grade) => (
              <label key={grade} className="ann-check">
                <input
                  type="checkbox"
                  checked={form.audience_grades.includes(grade)}
                  onChange={() => toggleGrade(grade)}
                />
                {grade}. sınıf
              </label>
            ))}
          </fieldset>
          <label className="ann-check">
            <input
              type="checkbox"
              checked={form.notify}
              onChange={(event) => updateForm({ notify: event.target.checked })}
            />
            Bir gün önce akşam bildirim gönder
          </label>
          <div className="ann-actions">
            <SendButton
              sending={saving}
              label={editingId ? 'Kaydet' : 'Etkinlik ekle'}
              sendingLabel="Kaydediliyor…"
            />
            {editingId ? (
              <button type="button" className="demo-btn" onClick={resetForm}>
                Vazgeç
              </button>
            ) : null}
          </div>
        </form>
      ) : null}

      <section className="dash-card">
        <h2 className="dash-section-title">
          {selectedDay === today ? 'Bugün' : formatCalendarRangeTr(selectedDay, selectedDay)}
        </h2>
        {loading ? (
          <p className="dash-hint">Takvim yükleniyor…</p>
        ) : selectedEvents.length === 0 ? (
          <p className="dash-hint">Bu günde kayıtlı etkinlik yok.</p>
        ) : (
          <div className="cal-event-list">
            {selectedEvents.map((event) => (
              <EventCard
                key={event.id}
                event={event}
                canEdit={canEdit}
                onEdit={startEdit}
                onDelete={handleDelete}
                deleting={deletingId === event.id}
              />
            ))}
          </div>
        )}
      </section>

      <section className="dash-card">
        <h2 className="dash-section-title">Yaklaşan</h2>
        {upcoming.length === 0 ? (
          <p className="dash-hint">Yaklaşan etkinlik yok.</p>
        ) : (
          <div className="cal-event-list">
            {upcoming.map((event) => (
              <EventCard
                key={event.id}
                event={event}
                canEdit={canEdit}
                onEdit={startEdit}
                onDelete={handleDelete}
                deleting={deletingId === event.id}
              />
            ))}
          </div>
        )}
      </section>
    </section>
  );
}
