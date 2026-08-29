import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { resolveExamConfig, saveExamFeatures } from '../../lib/examConfig';
import { notifyExamResultsPublished } from '../../lib/examNotifications';
import {
  formatExamWhen,
  loadExamSessions,
  publishExamSession,
} from '../../lib/exams';
import {
  aggregateClassSubjectAverages,
  loadSessionRankings,
  loadSubjectResults,
} from '../../lib/lgsExam';
import { InlineError, SuccessMessage } from '../dashboardUi';
import DirectorExamAnswerKey from './DirectorExamAnswerKey';
import DirectorExamAnalysis from './DirectorExamAnalysis';
import DirectorExamImport from './DirectorExamImport';
import ExamManualEntry from './ExamManualEntry';
import CreateMockExamForm from './CreateMockExamForm';
import ExamRankingTable from './ExamRankingTable';
import ExamReportsPanel from './ExamReportsPanel';

function ExamSessionWorkspace({
  session,
  school,
  schoolId,
  students,
  classes,
  sessions,
  showManualEntry,
  rankings,
  classAvgs,
  onResultsSaved,
}) {
  const tabs = useMemo(() => {
    const items = [];
    if (showManualEntry) items.push({ id: 'manual', label: 'Manuel giriş' });
    items.push(
      { id: 'csv', label: 'CSV import' },
      { id: 'answer-key', label: 'Cevap anahtarı' },
      { id: 'results', label: 'Sonuçlar' },
      { id: 'analysis', label: 'Analiz' }
    );
    return items;
  }, [showManualEntry]);

  const [tab, setTab] = useState(() => (showManualEntry ? 'manual' : 'csv'));

  useEffect(() => {
    setTab(showManualEntry ? 'manual' : 'csv');
  }, [session.id, showManualEntry]);

  return (
    <div className="exam-session-workspace">
      <nav className="exam-workspace-pills" aria-label={`${session.title} işlemleri`}>
        <div className="exam-workspace-pills__track">
          {tabs.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`exam-workspace-pill${tab === item.id ? ' exam-workspace-pill--active' : ''}`}
              onClick={() => setTab(item.id)}
              aria-current={tab === item.id ? 'page' : undefined}
            >
              {item.label}
            </button>
          ))}
        </div>
      </nav>

      <div className="exam-session-workspace__panel">
        {tab === 'manual' && showManualEntry ? (
          <ExamManualEntry
            embedded
            hideTitle
            school={school}
            students={students}
            sessionId={session.id}
            sessionTitle={session.title}
            onSaved={onResultsSaved}
          />
        ) : null}

        {tab === 'csv' ? (
          <DirectorExamImport
            embedded
            hideTitle
            schoolId={schoolId}
            sessionId={session.id}
            students={students}
          />
        ) : null}

        {tab === 'answer-key' ? (
          <DirectorExamAnswerKey embedded schoolId={schoolId} sessions={sessions} />
        ) : null}

        {tab === 'results' ? (
          <>
            <div className="exam-workspace-block">
              <h3 className="exam-workspace-block__title">Sıralama</h3>
              <ExamRankingTable rows={rankings} students={students} classes={classes} />
            </div>
            <div className="exam-workspace-block">
              <h3 className="exam-workspace-block__title">Şube ortalamaları</h3>
              {classAvgs.length ? (
                <ul className="exam-list">
                  {classAvgs.map((row) => (
                    <li key={row.classId}>
                      <strong>{row.studentCount} öğrenci</strong>
                      <span className="dash-hint">
                        Ort. net {row.totalNet?.toFixed(2)} · LGS{' '}
                        {row.lgsScore != null ? Math.round(row.lgsScore) : '—'}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="dash-hint">Henüz sonuç girilmedi.</p>
              )}
            </div>
          </>
        ) : null}

        {tab === 'analysis' ? (
          <DirectorExamAnalysis embedded session={session} classStudentIds={students.map((s) => s.id)} />
        ) : null}
      </div>
    </div>
  );
}

function SettingsToggle({ label, checked, onChange, hint }) {
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

function ExamSettingsBar({ school, onSaved }) {
  const [config, setConfig] = useState(() => resolveExamConfig(school));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    setConfig(resolveExamConfig(school));
  }, [school]);

  async function patch(next) {
    const merged = { ...config, ...next };
    setConfig(merged);
    setSaving(true);
    setError(null);
    try {
      await saveExamFeatures(supabase, school.id, school.features, merged);
      onSaved?.(merged);
    } catch (saveError) {
      setError(saveError);
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="dash-card exam-demo-bar">
      <details className="exam-settings-details">
        <summary className="exam-settings-details__summary">Sınav ayarları</summary>
        {error && <InlineError error={error} context="calendar" />}
        <div className="exam-demo-toggles">
          <SettingsToggle label="Deneme takibi" checked={config.showMockExams} onChange={(v) => patch({ showMockExams: v })} />
          <SettingsToggle label="Sonuç kaydı" checked={config.storeResults} onChange={(v) => patch({ storeResults: v })} />
          <SettingsToggle label="Detaylı ders girişi" checked={config.detailedEntry} onChange={(v) => patch({ detailedEntry: v })} />
          <SettingsToggle label="Deneme sonuçları" checked={config.storeMockResults} onChange={(v) => patch({ storeMockResults: v })} />
          <SettingsToggle label="Ortak sınav sonuçları" checked={config.storeCommonResults} onChange={(v) => patch({ storeCommonResults: v })} />
        </div>
        {saving ? <p className="dash-hint">Kaydediliyor…</p> : null}
      </details>
    </section>
  );
}

export default function ExamOperationsPanel({
  schoolId,
  school,
  students = [],
  classes = [],
  showManualEntry = true,
  showCreateMock = true,
  showReports = true,
}) {
  const [sessions, setSessions] = useState([]);
  const [selectedSessionId, setSelectedSessionId] = useState('');
  const [rankings, setRankings] = useState([]);
  const [subjectResults, setSubjectResults] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const sessionRows = await loadExamSessions(schoolId);
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
    if (!selectedSessionId) return;
    (async () => {
      try {
        const [rankRows, subjectRows] = await Promise.all([
          loadSessionRankings(selectedSessionId),
          loadSubjectResults(selectedSessionId),
        ]);
        setRankings(rankRows);
        setSubjectResults(subjectRows);
      } catch (loadError) {
        setError(loadError);
      }
    })();
  }, [selectedSessionId]);

  const classAvgs = useMemo(
    () => aggregateClassSubjectAverages(subjectResults, students),
    [subjectResults, students]
  );

  async function refreshSessionStats(sessionId) {
    const [rankRows, subjectRows] = await Promise.all([
      loadSessionRankings(sessionId),
      loadSubjectResults(sessionId),
    ]);
    setRankings(rankRows);
    setSubjectResults(subjectRows);
  }

  async function handlePublish(sessionId, publish) {
    setError(null);
    try {
      await publishExamSession(sessionId, publish);
      if (publish) {
        try {
          await notifyExamResultsPublished({ sessionId, schoolId });
        } catch (notifyError) {
          console.warn('exam notify:', notifyError);
        }
      }
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
        <p className="dash-subtitle">Deneme oluştur, sonuç gir, rapor al</p>
      </header>

      {error && <InlineError error={error} context="calendar" />}
      {success && <SuccessMessage message={success} />}

      {showCreateMock ? (
        <CreateMockExamForm
          schoolId={schoolId}
          onCreated={(sessionId) => {
            if (sessionId) setSelectedSessionId(sessionId);
            load();
          }}
        />
      ) : null}

      <section className="dash-card">
        <h2 className="dash-section-title">Mevcut denemeler</h2>
        <p className="dash-hint">Bir denemeye dokunun; sonuç girişi o satırın içinde açılır.</p>
        {loading ? (
          <p className="dash-hint">Yükleniyor…</p>
        ) : sessions.length === 0 ? (
          <p className="dash-hint">
            Henüz deneme yok. {showCreateMock ? 'Yukarıdan yeni deneme oluşturun.' : 'Deneme sonrası oturum açılır.'}
          </p>
        ) : (
          <ul className="exam-session-list">
            {sessions.map((session) => {
              const expanded = selectedSessionId === session.id;
              return (
                <li
                  key={session.id}
                  className={`exam-session-item${expanded ? ' exam-session-item--open' : ''}`}
                >
                  <div className="exam-session-item__head">
                    <button
                      type="button"
                      className="exam-session-item__toggle"
                      onClick={() => setSelectedSessionId(expanded ? '' : session.id)}
                      aria-expanded={expanded}
                    >
                      <strong>{session.title}</strong>
                      <span className="dash-hint">{formatExamWhen(session)}</span>
                    </button>
                    <div className="exam-session-row__actions">
                      <button
                        type="button"
                        className={`demo-btn${expanded ? ' demo-btn--active' : ''}`}
                        onClick={() => setSelectedSessionId(expanded ? '' : session.id)}
                      >
                        {expanded ? 'Kapat' : 'Seç'}
                      </button>
                      <button
                        type="button"
                        className="demo-btn"
                        onClick={() => handlePublish(session.id, !session.published_at)}
                      >
                        {session.published_at ? 'Yayını kaldır' : 'Velilere aç'}
                      </button>
                    </div>
                  </div>

                  {expanded ? (
                    <div className="exam-session-item__body">
                      <ExamSessionWorkspace
                        session={session}
                        school={school}
                        schoolId={schoolId}
                        students={students}
                        classes={classes}
                        sessions={sessions}
                        showManualEntry={showManualEntry}
                        rankings={rankings}
                        classAvgs={classAvgs}
                        onResultsSaved={() => refreshSessionStats(session.id)}
                      />
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {showReports ? (
        <ExamReportsPanel
          embedded
          schoolId={schoolId}
          school={school}
          students={students}
          classes={classes}
        />
      ) : null}

      {school ? <ExamSettingsBar school={school} /> : null}
    </>
  );
}

export { ExamSettingsBar as ExamDemoBar };
