import { useMemo, useState } from 'react';
import { CALENDAR_EVENT_TYPES, formatStudentGrade } from '../../lib/calendar';
import CalendarEventCard from './CalendarEventCard';
import SearchFilterToolbar from '../ui/SearchFilterToolbar';

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

function EventRow(props) {
  return <CalendarEventCard {...props} />;
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
  const [period, setPeriod] = useState('upcoming');
  const [types, setTypes] = useState([]);
  const [grade, setGrade] = useState(null);

  const currentMonthKey = today.slice(0, 7);
  const activeFilterCount =
    (period !== 'upcoming' ? 1 : 0) + (grade != null ? 1 : 0) + types.length;
  const hasActiveFilters = activeFilterCount > 0;

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
    setPeriod('upcoming');
    setTypes([]);
    setGrade(null);
  }

  return (
    <details className="cal-collapsible-form cal-browser dash-card">
      <summary className="cal-collapsible-form__summary cal-browser__summary">
        <span className="cal-collapsible-form__chevron" aria-hidden="true" />
        <span className="cal-browser__summary-text">
          <span className="dash-section-title">Tüm etkinlikler</span>
          <span className="dash-hint">{filtered.length} etkinlik</span>
        </span>
      </summary>

      <div className="cal-collapsible-form__body cal-browser__body">
      <SearchFilterToolbar
        searchValue={search}
        onSearchChange={setSearch}
        searchPlaceholder="Başlık veya açıklama ara…"
        disabled={loading}
        activeFilterCount={activeFilterCount}
        hasActiveFilters={hasActiveFilters}
        onClearFilters={clearFilters}
        resultHint={
          search.trim() ? `${filtered.length}/${events.length} etkinlik` : null
        }
      >
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
      </SearchFilterToolbar>

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
      </div>
    </details>
  );
}
