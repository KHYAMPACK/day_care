import { useCallback, useEffect, useMemo, useState } from 'react';
import { istanbulDateIso, uniqueGrades } from '../../lib/calendar';
import {
  EXAM_KIND,
  examKindFromEvent,
  filterExamEvents,
  formatExamEventLabel,
  formatExamGrades,
  formatExamWhen,
  groupCommonExamsByTerm,
  importMebExamEvents,
  loadExamCalendarEvents,
  loadExamSessions,
  publishExamSession,
  splitExamsByTiming,
} from '../../lib/exams';
import {
  notifyExamDemoConfigChange,
  readExamDemoConfig,
  writeExamDemoConfig,
} from '../../lib/examDemoConfig';
import { InlineError, SuccessMessage } from '../dashboardUi';

function DemoToggle({ label, checked, onChange, hint }) {
  return (
    <label className="exam-demo-toggle">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <span>
        <strong>{label}</strong>
        {hint ? <span className="dash-hint">{hint}</span> : null}
      </span>
    </label>
  );
}

function ExamDemoBar() {
  const [config, setConfig] = useState(() => readExamDemoConfig());

  useEffect(() => {
    function sync() {
      setConfig(readExamDemoConfig());
    }
    window.addEventListener('exam-demo-config', sync);
    return () => window.removeEventListener('exam-demo-config', sync);
  }, []);

  function patch(next) {
    writeExamDemoConfig(next);
    notifyExamDemoConfigChange();
    setConfig(readExamDemoConfig());
  }

  return (
    <section className="dash-card exam-demo-bar">
      <h2 className="dash-section-title">Demo senaryosu</h2>
      <p className="dash-hint">
        Müşteri sunumunda canlı olarak açıp kapatın. Tercihler bu cihazda saklanır.
      </p>
      <div className="exam-demo-toggles">
        <DemoToggle
          label="Ortak sınav takvimi"
          hint="MEB ortak yazılı + LGS / İOKBS"
          checked={config.showCommonExams}
          onChange={(showCommonExams) => patch({ showCommonExams })}
        />
        <DemoToggle
          label="Deneme takibi"
          hint="ATLAS deneme sınavları"
          checked={config.showMockExams}
          onChange={(showMockExams) => patch({ showMockExams })}
        />
        <DemoToggle
          label="Sonuç kaydı"
          hint="Net girişi ve veli görünümü"
          checked={config.storeResults}
          onChange={(storeResults) => patch({ storeResults })}
        />
        {config.storeResults ? (
          <>
            <DemoToggle
              label="Deneme sonuçları"
              checked={config.storeMockResults}
              onChange={(storeMockResults) => patch({ storeMockResults })}
            />
            <DemoToggle
              label="Ortak sınav sonuçları"
              checked={config.storeCommonResults}
              onChange={(storeCommonResults) => patch({ storeCommonResults })}
            />
          </>
        ) : null}
      </div>
    </section>
  );
}

export default function DirectorExams({ schoolId }) {
  const [config, setConfig] = useState(() => readExamDemoConfig());
  const [events, setEvents] = useState([]);
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [calendarRows, sessionRows] = await Promise.all([
        loadExamCalendarEvents(schoolId),
        loadExamSessions(schoolId),
      ]);
      setEvents(calendarRows);
      setSessions(sessionRows);
    } catch (loadError) {
      setError(loadError);
    } finally {
      setLoading(false);
    }
  }, [schoolId]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    function sync() {
      setConfig(readExamDemoConfig());
    }
    window.addEventListener('exam-demo-config', sync);
    return () => window.removeEventListener('exam-demo-config', sync);
  }, []);

  const filtered = useMemo(
    () => filterExamEvents(events, { config, grades: null }),
    [events, config]
  );
  const commonGroups = useMemo(() => groupCommonExamsByTerm(events), [events]);
  const mockExams = useMemo(
    () => filtered.filter((event) => examKindFromEvent(event) === EXAM_KIND.mock),
    [filtered]
  );
  const { upcoming: upcomingMock } = useMemo(
    () => splitExamsByTiming(mockExams, istanbulDateIso()),
    [mockExams]
  );

  async function handleImportMeb() {
    setImporting(true);
    setError(null);
    setSuccess(null);
    try {
      await importMebExamEvents(schoolId);
      setSuccess('MEB ortak sınav takvimi içe aktarıldı (veya zaten mevcuttu).');
      await load();
    } catch (importError) {
      setError(importError);
    } finally {
      setImporting(false);
    }
  }

  async function handlePublish(sessionId, publish) {
    setError(null);
    try {
      await publishExamSession(sessionId, publish);
      await load();
      setSuccess(publish ? 'Sonuçlar velilere açıldı.' : 'Yayın geri alındı.');
    } catch (publishError) {
      setError(publishError);
    }
  }

  return (
    <>
      <header className="dash-header">
        <h1 className="dash-title">Sınavlar</h1>
        <p className="dash-subtitle">
          Ortak sınav takvimi (MEB) ve okul denemeleri. Demo anahtarlarıyla kapsamı gösterin.
        </p>
      </header>

      {error && <InlineError error={error} context="calendar" />}
      {success && <SuccessMessage message={success} />}

      <ExamDemoBar />

      <section className="dash-card">
        <div className="demo-row-between">
          <h2 className="dash-section-title">MEB ortak sınavlar</h2>
          <button type="button" className="demo-btn" disabled={importing} onClick={handleImportMeb}>
            {importing ? 'Aktarılıyor…' : 'Takvime aktar'}
          </button>
        </div>
        <p className="dash-hint">Salt okunur — tarihler MEB takviminden gelir.</p>
        {loading ? (
          <p className="dash-hint">Yükleniyor…</p>
        ) : !config.showCommonExams ? (
          <p className="dash-hint">Demo: Ortak sınav takvimi kapalı.</p>
        ) : commonGroups.length === 0 ? (
          <p className="dash-hint">Henüz ortak sınav kaydı yok. Takvime aktarın veya migration 026 çalıştırın.</p>
        ) : (
          commonGroups.map((group) => (
            <div key={group.key} className="exam-group">
              <h3 className="exam-group__title">{group.label}</h3>
              <ul className="exam-list">
                {group.items.map((event) => (
                  <li key={event.id ?? `${event.title}-${event.starts_on}`}>
                    <strong>{formatExamEventLabel(event)}</strong>
                    <span className="dash-hint">
                      {formatExamWhen(event)} · {formatExamGrades(event)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))
        )}
      </section>

      <section className="dash-card">
        <h2 className="dash-section-title">Deneme sınavları</h2>
        <p className="dash-hint">
          ATLAS takvimindeki denemeler. Yeni deneme eklemek için <strong>Takvim</strong> sekmesini
          kullanın (tür: Deneme).
        </p>
        {!config.showMockExams ? (
          <p className="dash-hint">Demo: Deneme takibi kapalı.</p>
        ) : upcomingMock.length === 0 ? (
          <p className="dash-hint">Yaklaşan deneme yok.</p>
        ) : (
          <ul className="exam-list">
            {upcomingMock.slice(0, 8).map((event) => (
              <li key={event.id}>
                <strong>{event.title}</strong>
                <span className="dash-hint">
                  {formatExamWhen(event)} · {formatExamGrades(event)}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {config.storeResults ? (
        <section className="dash-card">
          <h2 className="dash-section-title">Yayınlanan sonuçlar</h2>
          <p className="dash-hint">Öğretmen net girdikten sonra velilere açın.</p>
          {sessions.length === 0 ? (
            <p className="dash-hint">Henüz sınav oturumu yok. Öğretmen deneme sonrası net girer.</p>
          ) : (
            <ul className="exam-list">
              {sessions.map((session) => (
                <li key={session.id} className="exam-session-row">
                  <div>
                    <strong>{session.title}</strong>
                    <span className="dash-hint">{formatExamWhen(session)}</span>
                  </div>
                  <button
                    type="button"
                    className="demo-btn"
                    onClick={() => handlePublish(session.id, !session.published_at)}
                  >
                    {session.published_at ? 'Yayını kaldır' : 'Velilere aç'}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : null}
    </>
  );
}

export { ExamDemoBar };
