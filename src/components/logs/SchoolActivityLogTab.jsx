import { useCallback, useEffect, useMemo, useState } from 'react';
import { getDemoActivityLogs } from '../../lib/activityLogDemoData';
import {
  ACTIVITY_CATEGORIES,
  ACTIVITY_CATEGORY_LABELS,
  ACTIVITY_DATE_RANGES,
  ACTIVITY_ROLE_LABELS,
  activityLogSchemaMissingError,
  filterActivityLogs,
  formatActivityActor,
  formatActivityLogTime,
  isActivityLogSchemaMissing,
  isDefaultActivityFilters,
  loadSchoolActivityLogs,
} from '../../lib/activityLog';
import { isDemoSchool } from '../../lib/parentDemoData';
import { supabase } from '../../lib/supabase';
import { InlineError } from '../dashboardUi';

function TabLoading({ message }) {
  return (
    <section className="director-panel">
      <div className="dash-card">
        <p className="dash-hint">{message}</p>
      </div>
    </section>
  );
}

function TabError({ error, onRetry }) {
  return (
    <section className="director-panel">
      <div className="dash-card">
        <InlineError error={error} context="general" />
        {onRetry ? (
          <button type="button" className="director-btn-secondary" onClick={onRetry}>
            Yenile
          </button>
        ) : null}
      </div>
    </section>
  );
}

export default function SchoolActivityLogTab({ schoolId, school }) {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [schemaMissing, setSchemaMissing] = useState(false);
  const [showDemo, setShowDemo] = useState(false);

  const [dateRange, setDateRange] = useState('7d');
  const [category, setCategory] = useState('');
  const [actorRole, setActorRole] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  const filters = useMemo(
    () => ({ dateRange, category, actorRole, searchQuery }),
    [dateRange, category, actorRole, searchQuery]
  );

  const refresh = useCallback(async () => {
    if (!schoolId) return;
    setLoading(true);
    setError(null);

    try {
      if (isDemoSchool(school)) {
        setSchemaMissing(false);
        setLogs([]);
        setShowDemo(true);
        return;
      }

      const rows = await loadSchoolActivityLogs(supabase, schoolId, {
        dateRange,
        category,
      });

      setSchemaMissing(false);
      setLogs(rows);

      if (rows.length === 0 && isDefaultActivityFilters(filters)) {
        setShowDemo(true);
      } else {
        setShowDemo(false);
      }
    } catch (loadError) {
      if (isActivityLogSchemaMissing(loadError)) {
        setSchemaMissing(true);
        setLogs([]);
        setShowDemo(true);
        setError(activityLogSchemaMissingError());
        return;
      }
      setError(loadError);
      setShowDemo(false);
    } finally {
      setLoading(false);
    }
  }, [schoolId, school, dateRange, category, filters]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const sourceRows = showDemo ? getDemoActivityLogs() : logs;
  const visibleLogs = useMemo(
    () => filterActivityLogs(sourceRows, filters),
    [sourceRows, filters]
  );

  if (loading) {
    return <TabLoading message="Kayıtlar yükleniyor…" />;
  }

  if (error && !showDemo) {
    return <TabError error={error} onRetry={refresh} />;
  }

  return (
    <section className="director-panel">
      <div className="dash-card">
        <div className="director-card-header">
          <div>
            <h2 className="dash-section-title">Okul kayıtları</h2>
            <p className="dash-hint">
              Öğretmen, rehber ve müdür işlemlerinin günlük özeti ({visibleLogs.length} kayıt).
            </p>
          </div>
          <button type="button" className="director-btn-secondary" onClick={refresh}>
            Yenile
          </button>
        </div>

        {showDemo ? (
          <div className="activity-log-demo-banner">
            <strong>Örnek kayıtlar gösteriliyor</strong>
            <span>Gerçek işlemler kaydedildikçe burada görünür.</span>
          </div>
        ) : null}

        {schemaMissing ? (
          <InlineError error={activityLogSchemaMissingError()} context="general" />
        ) : null}

        <div className="activity-log-toolbar">
          <select
            className="dash-input"
            value={dateRange}
            onChange={(event) => setDateRange(event.target.value)}
            aria-label="Tarih aralığı"
          >
            {ACTIVITY_DATE_RANGES.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>

          <select
            className="dash-input"
            value={category}
            onChange={(event) => setCategory(event.target.value)}
            aria-label="Kategori filtresi"
          >
            <option value="">Tüm kategoriler</option>
            {ACTIVITY_CATEGORIES.map((value) => (
              <option key={value} value={value}>
                {ACTIVITY_CATEGORY_LABELS[value]}
              </option>
            ))}
          </select>

          <select
            className="dash-input"
            value={actorRole}
            onChange={(event) => setActorRole(event.target.value)}
            aria-label="Rol filtresi"
          >
            <option value="">Tüm roller</option>
            <option value="teacher">Öğretmen</option>
            <option value="counselor">Rehber</option>
            <option value="director">Müdür</option>
          </select>

          <input
            className="dash-input activity-log-toolbar__search"
            type="search"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Özet veya isim ara…"
            aria-label="Kayıt ara"
          />
        </div>

        {visibleLogs.length === 0 ? (
          <p className="dash-hint">
            {showDemo || isDefaultActivityFilters(filters)
              ? 'Kayıt bulunamadı.'
              : 'Seçili filtreye uygun kayıt bulunamadı.'}
          </p>
        ) : (
          <div className="audit-table-wrap">
            <table className="audit-table activity-log-table">
              <thead>
                <tr>
                  <th scope="col">Tarih</th>
                  <th scope="col">Yapan</th>
                  <th scope="col">Rol</th>
                  <th scope="col">Kategori</th>
                  <th scope="col">Özet</th>
                </tr>
              </thead>
              <tbody>
                {visibleLogs.map((row) => (
                  <tr key={row.id}>
                    <td className="audit-table__time">
                      <time dateTime={row.created_at}>{formatActivityLogTime(row.created_at)}</time>
                    </td>
                    <td className="audit-table__teacher">{formatActivityActor(row)}</td>
                    <td>{ACTIVITY_ROLE_LABELS[row.actor_role] ?? row.actor_role}</td>
                    <td>
                      <span className="activity-log-chip">
                        {ACTIVITY_CATEGORY_LABELS[row.category] ?? row.category}
                      </span>
                    </td>
                    <td className="audit-table__body">{row.summary}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </section>
  );
}
