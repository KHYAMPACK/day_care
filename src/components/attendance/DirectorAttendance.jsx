import { useCallback, useEffect, useMemo, useState } from 'react';
import { loadCurriculumCatalog, formatClassLabel } from '../../lib/curriculum';
import { formatCalendarDateTr } from '../../lib/calendar';
import {
  attendancePeriodBounds,
  formatLastAttendanceLine,
  loadAttendanceFlags,
  loadDirectorAttendanceData,
} from '../../lib/attendance';
import { InlineError } from '../dashboardUi';
import { Icon } from '../ui/Icon';
import SearchFilterToolbar from '../ui/SearchFilterToolbar';

const PERIOD_OPTIONS = [
  { id: 'week', label: 'Bu hafta' },
  { id: 'month', label: 'Bu ay' },
  { id: 'all', label: 'Tüm dönem' },
];

function rateClass(rate) {
  if (rate == null) return '';
  if (rate < 80) return ' att-director-rate--low';
  if (rate < 90) return ' att-director-rate--mid';
  return ' att-director-rate--high';
}

function AttendanceStatCard({ icon, label, value, variant = 'lavender' }) {
  return (
    <article className={`stat-card stat-card--${variant}`}>
      <span className="stat-card__icon" aria-hidden="true">
        <Icon name={icon} size={18} />
      </span>
      <p className="stat-card__value">{value}</p>
      <p className="stat-card__label">{label}</p>
    </article>
  );
}

export default function DirectorAttendance({ schoolId, students = [], classes = [] }) {
  const [subjects, setSubjects] = useState([]);
  const [flags, setFlags] = useState([]);
  const [pack, setPack] = useState({
    studentStats: [],
    sessionSummaries: [],
    sessions: [],
  });
  const [classId, setClassId] = useState('');
  const [subjectId, setSubjectId] = useState('');
  const [period, setPeriod] = useState('week');
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState('rate');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const { startOn, endOn } = useMemo(() => attendancePeriodBounds(period), [period]);

  const gradeForSubject = classes.find((klass) => klass.id === classId)?.grade;
  const subjectOptions = useMemo(() => {
    if (!gradeForSubject) return subjects;
    return subjects.filter((subject) => subject.grade === gradeForSubject);
  }, [subjects, gradeForSubject]);

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError(null);
      try {
        const catalog = await loadCurriculumCatalog();
        setSubjects(catalog.subjects);
      } catch (loadError) {
        setError(loadError);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const load = useCallback(async () => {
    if (!schoolId) return;
    setError(null);
    try {
      const [data, flagRows] = await Promise.all([
        loadDirectorAttendanceData({
          schoolId,
          classId: classId || undefined,
          subjectId: subjectId || undefined,
          startOn,
          endOn,
          students,
          classes,
        }),
        loadAttendanceFlags({
          schoolId,
          classId: classId || undefined,
          subjectId: subjectId || undefined,
        }),
      ]);
      setPack(data);
      setFlags(flagRows);
    } catch (loadError) {
      setError(loadError);
      setPack({ studentStats: [], sessionSummaries: [], sessions: [] });
      setFlags([]);
    }
  }, [schoolId, classId, subjectId, startOn, endOn, students, classes]);

  useEffect(() => {
    load();
  }, [load]);

  const filteredStudents = useMemo(() => {
    let rows = pack.studentStats;
    const query = search.trim().toLowerCase();
    if (query) {
      rows = rows.filter((row) => row.studentName.toLowerCase().includes(query));
    }
    const sorted = [...rows];
    sorted.sort((left, right) => {
      if (sortKey === 'name') {
        return left.studentName.localeCompare(right.studentName, 'tr');
      }
      if (sortKey === 'absent') {
        return right.absent - left.absent || left.studentName.localeCompare(right.studentName, 'tr');
      }
      const rateLeft = left.rate ?? 101;
      const rateRight = right.rate ?? 101;
      return rateLeft - rateRight || left.studentName.localeCompare(right.studentName, 'tr');
    });
    return sorted;
  }, [pack.studentStats, search, sortKey]);

  const summary = useMemo(() => {
    const totalSessions = pack.sessions.length;
    const totalPresent = pack.studentStats.reduce((sum, row) => sum + row.present, 0);
    const totalMarks = pack.studentStats.reduce((sum, row) => sum + row.total, 0);
    const totalAbsent = pack.studentStats.reduce((sum, row) => sum + row.absent, 0);
    const avgRate = totalMarks ? Math.round((totalPresent / totalMarks) * 100) : null;
    return { totalSessions, avgRate, totalAbsent, flagCount: flags.length };
  }, [pack, flags.length]);

  const activeFilterCount =
    (classId ? 1 : 0) +
    (subjectId ? 1 : 0) +
    (period !== 'week' ? 1 : 0) +
    (sortKey !== 'rate' ? 1 : 0);
  const hasActiveFilters = activeFilterCount > 0;

  function clearAttendanceFilters() {
    setClassId('');
    setSubjectId('');
    setPeriod('week');
    setSortKey('rate');
  }

  if (loading && !subjects.length) {
    return (
      <section className="dash-card">
        <p className="dash-hint">Yoklama özeti yükleniyor…</p>
      </section>
    );
  }

  return (
    <>
      <header className="dash-header">
        <h1 className="dash-title">Yoklama</h1>
        <p className="dash-subtitle">
          Öğrenci devam durumunu takip edin. Yoklama girişi öğretmen panelinden yapılır.
        </p>
      </header>

      {error && <InlineError error={error} context="attendance" />}

      <div className="stat-grid">
        <AttendanceStatCard icon="calendar" label="Yoklama sayısı" value={summary.totalSessions} variant="sky" />
        <AttendanceStatCard
          icon="check"
          label="Ort. katılım"
          value={summary.avgRate != null ? `%${summary.avgRate}` : '—'}
          variant="mint"
        />
        <AttendanceStatCard icon="users" label="Devamsız kayıt" value={summary.totalAbsent} variant="peach" />
        <AttendanceStatCard icon="star" label="Dikkat" value={summary.flagCount} variant="lavender" />
      </div>

      <section className="dash-card">
        <SearchFilterToolbar
          searchValue={search}
          onSearchChange={setSearch}
          searchPlaceholder="Öğrenci adı ara…"
          activeFilterCount={activeFilterCount}
          hasActiveFilters={hasActiveFilters}
          onClearFilters={clearAttendanceFilters}
          resultHint={
            search.trim()
              ? `${filteredStudents.length}/${pack.studentStats.length} öğrenci`
              : null
          }
        >
          <div className="search-filter-toolbar__fields">
            <label className="dash-label">
              Şube
              <select
                className="dash-input"
                value={classId}
                onChange={(event) => {
                  setClassId(event.target.value);
                  setSubjectId('');
                }}
              >
                <option value="">Tümü</option>
                {classes.map((klass) => (
                  <option key={klass.id} value={klass.id}>
                    {formatClassLabel(klass.grade, klass.name)}
                  </option>
                ))}
              </select>
            </label>
            <label className="dash-label">
              Ders
              <select
                className="dash-input"
                value={subjectId}
                onChange={(event) => setSubjectId(event.target.value)}
              >
                <option value="">Tümü</option>
                {subjectOptions.map((subject) => (
                  <option key={subject.id} value={subject.id}>
                    {subject.grade}. sınıf {subject.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="dash-label">
              Sırala
              <select className="dash-input" value={sortKey} onChange={(event) => setSortKey(event.target.value)}>
                <option value="rate">Oran (düşük → yüksek)</option>
                <option value="absent">Devamsız (çok → az)</option>
                <option value="name">Ad A → Z</option>
              </select>
            </label>
          </div>
          <div className="cal-browser__filter-group">
            <p className="dash-label">Dönem</p>
            <div className="cur-assign-chips" role="group" aria-label="Dönem">
              {PERIOD_OPTIONS.map((item) => (
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
        </SearchFilterToolbar>

        <h2 className="dash-section-title">Öğrenci devam</h2>
        {filteredStudents.length === 0 ? (
          <p className="dash-hint">Bu süzgeçte öğrenci yok.</p>
        ) : (
          <div className="att-director-table-wrap">
            <table className="att-director-table">
              <thead>
                <tr>
                  <th>Öğrenci</th>
                  <th>Şube</th>
                  <th>Katıldı</th>
                  <th>Devamsız</th>
                  <th>Oran</th>
                  <th>Son yoklama</th>
                </tr>
              </thead>
              <tbody>
                {filteredStudents.map((row) => (
                  <tr key={row.studentId}>
                    <td>{row.studentName}</td>
                    <td>{row.classLabel || '—'}</td>
                    <td>{row.present}</td>
                    <td>{row.absent}</td>
                    <td>
                      <span className={`att-director-rate${rateClass(row.rate)}`}>
                        {row.rate != null ? `%${row.rate}` : '—'}
                      </span>
                    </td>
                    <td>{formatLastAttendanceLine(row.lastSessionOn, row.lastStatus)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section className="dash-card">
        <h2 className="dash-section-title">Son yoklamalar</h2>
        {pack.sessionSummaries.length === 0 ? (
          <p className="dash-hint">Seçilen dönemde yoklama kaydı yok.</p>
        ) : (
          <div className="att-session-groups">
            {pack.sessionSummaries.map(({ session, classLabel, subjectName, present, absent, roster }) => (
              <details key={session.id} className="att-session-group">
                <summary className="att-session-group__summary">
                  <span>
                    <strong>{formatCalendarDateTr(session.taken_on)}</strong>
                    {' · '}
                    {classLabel} · {subjectName}
                  </span>
                  <span className="dash-hint">
                    {present} var · {absent} yok
                  </span>
                </summary>
                {roster.length ? (
                  <ul className="att-roster att-roster--readonly">
                    {roster.map((entry) => (
                      <li key={entry.studentId}>
                        <div
                          className={`att-roster__btn att-roster__btn--readonly${
                            entry.status === 'absent' ? ' att-roster__btn--absent' : ''
                          }`}
                        >
                          <span>{entry.studentName}</span>
                          <span className="att-roster__status">
                            {entry.status === 'absent' ? 'Yok' : 'Var'}
                          </span>
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="dash-hint">Bu oturumda kayıt yok.</p>
                )}
              </details>
            ))}
          </div>
        )}
      </section>

      <section className="dash-card">
        <details className="att-flags-collapse">
          <summary className="att-flags-collapse__summary">
            <span className="att-flags-collapse__title">Konu tekrarı gereken</span>
            <span className="dash-hint">Aynı konudan 2 ders ve üzeri kaçıran öğrenciler</span>
          </summary>
          <div className="att-flags-collapse__body">
            {flags.length === 0 ? (
              <p className="dash-hint">Bu süzgeçte işaretlenen öğrenci yok.</p>
            ) : (
              <ul className="att-flag-list">
                {flags.map((flag) => (
                  <li key={`${flag.studentId}-${flag.unitId}`} className="att-flag">
                    <strong>
                      {flag.studentName}
                      {flag.classLabel ? ` · ${flag.classLabel}` : ''}
                    </strong>
                    <span>
                      {flag.subjectName} · {flag.unitTitle} · {flag.absentCount} gün
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </details>
      </section>
    </>
  );
}
