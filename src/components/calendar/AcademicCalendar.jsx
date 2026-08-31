import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { withSchoolFilter } from '../../lib/tenant';
import {
  CALENDAR_EVENT_TYPES,
  CALENDAR_SELECT,
  addDaysIso,
  audienceGradesToSelection,
  buildReminderBody,
  eventVisibleForGrades,
  filterActiveCalendarEvents,
  formatCalendarRangeTr,
  formatStartsAtTr,
  formatStudentGrade,
  getCalendarTypeMeta,
  istanbulDateIso,
  normalizeAudienceGradesForSave,
} from '../../lib/calendar';
import { readExamDemoConfig } from '../../lib/examDemoConfig';
import { recordSchoolActivity } from '../../lib/activityLog';
import { useAuth } from '../../context/AuthContext';
import { InlineError, SuccessMessage } from '../dashboardUi';
import { Icon } from '../ui/Icon';
import { AsyncActionDialog } from '../ui/AsyncActionDialog';
import AudienceGradeCheckboxes from '../ui/AudienceGradeCheckboxes';
import { useAsyncAction } from '../../hooks/useAsyncAction';
import CalendarEventBrowser from './CalendarEventBrowser';

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
    audience_grades: audienceGradesToSelection(event.audience_grades),
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
  const { profile } = useAuth();
  const { asyncAction, closeAsyncAction, runAsyncAction } = useAsyncAction();
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
  const [eventFormOpen, setEventFormOpen] = useState(false);
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

  const calendarEvents = useMemo(
    () => filterActiveCalendarEvents(visibleEvents, today),
    [visibleEvents, today]
  );

  const loadEvents = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (canEdit) {
        const { error: pruneError } = await withSchoolFilter(
          supabase.from('calendar_events').delete().lt('ends_on', today),
          schoolId
        );
        if (pruneError) throw pruneError;
      }

      const rows = await loadCalendarRows(schoolId);
      setEvents(rows);
    } catch (loadError) {
      setError(loadError);
      setEvents([]);
    } finally {
      setLoading(false);
    }
  }, [canEdit, schoolId, today]);

  useEffect(() => {
    loadEvents();
  }, [loadEvents]);

  const cells = useMemo(
    () => buildMonthCells(cursor.year, cursor.monthIndex),
    [cursor.year, cursor.monthIndex]
  );

  const eventsByDay = useMemo(() => {
    const map = new Map();
    calendarEvents.forEach((event) => {
      let cursorDay = event.starts_on;
      while (cursorDay <= event.ends_on) {
        const list = map.get(cursorDay) ?? [];
        list.push(event);
        map.set(cursorDay, list);
        cursorDay = addDaysIso(cursorDay, 1);
      }
    });
    return map;
  }, [calendarEvents]);

  const selectedEvents = eventsByDay.get(selectedDay) ?? [];

  const upcoming = useMemo(
    () =>
      calendarEvents
        .slice()
        .sort((a, b) => a.starts_on.localeCompare(b.starts_on))
        .slice(0, 8),
    [calendarEvents]
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

  function startEdit(event) {
    setEditingId(event.id);
    setForm(eventToForm(event));
    setEventFormOpen(true);
    setSuccess(null);
    setError(null);
  }

  function resetForm() {
    setEditingId(null);
    setForm({ ...EMPTY_FORM, starts_on: selectedDay, ends_on: selectedDay });
  }

  function handleSave(submitEvent) {
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
      audience_grades: normalizeAudienceGradesForSave(form.audience_grades),
      notify: form.notify,
    };
    if (!editingId) {
      payload.source = 'director';
    }

    runAsyncAction({
      title: editingId ? 'Etkinliği kaydet' : 'Etkinlik ekle',
      loadingLabel: 'Kaydediliyor…',
      successMessage: editingId ? 'Etkinlik güncellendi.' : 'Etkinlik eklendi.',
      skipConfirm: true,
      runFn: async () => {
        const query = editingId
          ? supabase.from('calendar_events').update(payload).eq('id', editingId)
          : supabase.from('calendar_events').insert(payload);
        const { error: saveError } = await query;
        if (saveError) throw saveError;
      },
      onSuccess: async () => {
        recordSchoolActivity(supabase, profile, {
          schoolId,
          category: 'calendar',
          action: editingId ? 'updated' : 'created',
          summary: editingId
            ? `Takvim etkinliği güncellendi: ${title}`
            : `Takvim etkinliği eklendi: ${title}`,
        });
        resetForm();
        setEventFormOpen(false);
        await loadEvents();
      },
    });
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
    recordSchoolActivity(supabase, profile, {
      schoolId,
      category: 'calendar',
      action: 'deleted',
      summary: `Takvim etkinliği silindi: ${event.title}`,
    });
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
                onClick={() => {
                  setSelectedDay(iso);
                  if (!editingId) {
                    setForm((current) => ({
                      ...current,
                      starts_on: iso,
                      ends_on: iso,
                    }));
                  }
                }}
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

      <section className="dash-card cal-day-panel">
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

      {canEdit ? (
        <details
          className="cal-collapsible-form dash-card"
          open={eventFormOpen}
          onToggle={(event) => setEventFormOpen(event.currentTarget.open)}
        >
          <summary className="cal-collapsible-form__summary">
            <span className="cal-collapsible-form__chevron" aria-hidden="true" />
            <span className="dash-section-title">
              {editingId ? 'Etkinliği düzenle' : 'Yeni etkinlik'}
            </span>
          </summary>
          <form className="dash-form cal-collapsible-form__body" onSubmit={handleSave}>
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
          <AudienceGradeCheckboxes
            value={form.audience_grades}
            onChange={(grades) => updateForm({ audience_grades: grades })}
            hint="Seçim yapmazsanız etkinlik tüm okulda görünür."
          />
          <label className={`cal-form-option${form.notify ? ' cal-form-option--active' : ''}`}>
            <input
              type="checkbox"
              className="cal-form-option__input"
              checked={form.notify}
              onChange={(event) => updateForm({ notify: event.target.checked })}
            />
            <span className="cal-form-option__icon" aria-hidden="true">
              <Icon name="bell" size={18} />
            </span>
            <span className="cal-form-option__text">
              <strong>Hatırlatma bildirimi</strong>
              <span>Etkinlikten bir gün önce akşam velilere bildirim gönderilir.</span>
            </span>
            <span className="cal-form-toggle" aria-hidden="true">
              <span className="cal-form-toggle__knob" />
            </span>
          </label>
          <div className="ann-actions">
            <button type="submit" className="demo-btn demo-btn--primary">
              {editingId ? 'Kaydet' : 'Etkinlik ekle'}
            </button>
            {editingId ? (
              <button type="button" className="demo-btn" onClick={resetForm}>
                Vazgeç
              </button>
            ) : null}
          </div>
          </form>
        </details>
      ) : null}

      {canEdit ? (
        <CalendarEventBrowser
          events={calendarEvents}
          today={today}
          loading={loading}
          canEdit={canEdit}
          onEdit={startEdit}
          onDelete={handleDelete}
          deletingId={deletingId}
        />
      ) : (
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
      )}

      <AsyncActionDialog
        open={Boolean(asyncAction)}
        phase={asyncAction?.phase ?? 'confirm'}
        title={asyncAction?.title}
        message={asyncAction?.message}
        confirmLabel={asyncAction?.confirmLabel}
        loadingLabel={asyncAction?.loadingLabel}
        successTitle={asyncAction?.successTitle}
        credentials={asyncAction?.credentials}
        error={asyncAction?.error}
        errorContext="calendar"
        onConfirm={asyncAction?.onConfirm}
        onClose={closeAsyncAction}
      />
    </section>
  );
}
