import { useMemo, useState } from 'react';
import {
  CALENDAR_EVENT_TYPES,
  formatCalendarRangeTr,
  formatStartsAtTr,
  formatStudentGrade,
  getCalendarTypeMeta,
} from '../../lib/calendar';
import { Icon } from '../ui/Icon';

function monthKeyFromIso(iso) {
  return iso.slice(0, 7);
}

function monthLabelFromKey(key) {
  const [year, month] = key.split('-').map(Number);
  return new Date(year, month - 1, 1).toLocaleDateString('tr-TR', {
    month: 'long',
    year: 'numeric',
  });
}

function applyEventFilters(events, { search, period, types, grade, today }) {
  let rows = events;
  const query = search.trim().toLowerCase();
  if (query) {
    rows = rows.filter(
      (event) =>
        event.title?.toLowerCase().includes(query) ||
        event.body?.toLowerCase().includes(query)
    );
  }
  if (period === 'upcoming') {
    rows = rows.filter((event) => event.ends_on >= today);
  } else if (period === 'past') {
    rows = rows.filter((event) => event.ends_on < today);
  }
  if (types.length) {
    rows = rows.filter((event) => types.includes(event.event_type));
  }
  if (grade != null) {
    rows = rows.filter(
      (event) =>
        !event.audience_grades?.length || event.audience_grades.includes(grade)
    );
  }
  return rows;
}

function groupEventsByMonth(events) {
  const map = new Map();
  for (const event of events) {
    const key = monthKeyFromIso(event.starts_on);
    const list = map.get(key) ?? [];
    list.push(event);
    map.set(key, list);
  }
  return [...map.entries()].sort(([left], [right]) => left.localeCompare(right));
}

function EventRow({ event, canEdit, onEdit, onDelete, deleting }) {
  const meta = getCalendarTypeMeta(event.event_type);
  const time = formatStartsAtTr(event.starts_at);
  const grades = event.audience_grades?.length
    ? event.audience_grades.map((g) => formatStudentGrade(g)).join(', ')
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

export default function CalendarEventBrowser({
  events,
  today,
  loading,
  canEdit,
  onEdit,
  onDelete,
  deletingId,
}) {
  const [search, setSearch] = useState('');
  const [period, setPeriod] = useState('all');
  const [types, setTypes] = useState([]);
  const [grade, setGrade] = useState(null);

  const currentMonthKey = today.slice(0, 7);
  const hasActiveFilters = Boolean(
    search.trim() || period !== 'all' || types.length || grade != null
  );

  const filtered = useMemo(
    () => applyEventFilters(events, { search, period, types, grade, today }),
    [events, search, period, types, grade, today]
  );

  const grouped = useMemo(() => groupEventsByMonth(filtered), [filtered]);

  function toggleType(typeId) {
    setTypes((current) =>
      current.includes(typeId) ? current.filter((id) => id !== typeId) : [...current, typeId]
    );
  }

  function clearFilters() {
    setSearch('');
    setPeriod('all');
    setTypes([]);
    setGrade(null);
  }

  return (
    <section className="dash-card cal-browser">
      <h2 className="dash-section-title">Tüm etkinlikler</h2>
      <p className="dash-hint">
        {filtered.length} etkinlik
        {hasActiveFilters ? (
          <>
            {' · '}
            <button type="button" className="demo-btn demo-btn--ghost cal-browser__clear" onClick={clearFilters}>
              Filtreleri temizle
            </button>
          </>
        ) : null}
      </p>

      <div className="cal-browser__filters">
        <label className="dash-label cal-browser__search">
          Ara
          <input
            className="dash-input"
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Başlık veya açıklama"
          />
        </label>

        <div className="cal-browser__filter-group">
          <p className="dash-label">Dönem</p>
          <div className="cur-assign-chips" role="group" aria-label="Dönem">
            {[
              { id: 'all', label: 'Tümü' },
              { id: 'upcoming', label: 'Yaklaşan' },
              { id: 'past', label: 'Geçmiş' },
            ].map((item) => (
              <button
                key={item.id}
                type="button"
                className={`cur-assign-chip${period === item.id ? ' cur-assign-chip--active' : ''}`}
                onClick={() => setPeriod(item.id)}
              >
                {item.label}
              </button>
            ))}
          </div>
        </div>

        <div className="cal-browser__filter-group">
          <p className="dash-label">Sınıf</p>
          <div className="cur-assign-chips" role="group" aria-label="Sınıf">
            <button
              type="button"
              className={`cur-assign-chip${grade == null ? ' cur-assign-chip--active' : ''}`}
              onClick={() => setGrade(null)}
            >
              Tümü
            </button>
            {[5, 6, 7, 8].map((value) => (
              <button
                key={value}
                type="button"
                className={`cur-assign-chip${grade === value ? ' cur-assign-chip--active' : ''}`}
                onClick={() => setGrade(value)}
              >
                {formatStudentGrade(value)}
              </button>
            ))}
          </div>
        </div>

        <div className="cal-browser__filter-group cal-browser__filter-group--types">
          <p className="dash-label">Tür</p>
          <div className="cur-assign-chips cal-browser__type-chips" role="group" aria-label="Etkinlik türü">
            {CALENDAR_EVENT_TYPES.map((type) => (
              <button
                key={type.id}
                type="button"
                className={`cur-assign-chip${types.includes(type.id) ? ' cur-assign-chip--active' : ''}`}
                onClick={() => toggleType(type.id)}
              >
                {type.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {loading ? (
        <p className="dash-hint">Takvim yükleniyor…</p>
      ) : grouped.length === 0 ? (
        <p className="dash-hint">Bu süzgeçte etkinlik yok.</p>
      ) : (
        <div className="cal-browser__groups">
          {grouped.map(([monthKey, monthEvents]) => {
            const isPastMonth = monthKey < currentMonthKey;
            return (
              <details
                key={monthKey}
                className="cal-month-group"
                open={!isPastMonth}
              >
                <summary className="cal-month-group__summary">
                  <span>{monthLabelFromKey(monthKey)}</span>
                  <span className="dash-hint">{monthEvents.length} etkinlik</span>
                </summary>
                <div className="cal-event-list cal-month-group__list">
                  {monthEvents.map((event) => (
                    <EventRow
                      key={event.id}
                      event={event}
                      canEdit={canEdit}
                      onEdit={onEdit}
                      onDelete={onDelete}
                      deleting={deletingId === event.id}
                    />
                  ))}
                </div>
              </details>
            );
          })}
        </div>
      )}
    </section>
  );
}
