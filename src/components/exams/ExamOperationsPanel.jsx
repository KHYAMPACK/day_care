import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { resolveExamConfig, saveExamFeatures } from '../../lib/examConfig';
import { notifyExamResultsPublished } from '../../lib/examNotifications';
import { STUDENT_GRADES, formatStudentGrade } from '../../lib/calendar';
import {
  filterExamSessions,
  formatExamSessionGrades,
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
import { recordSchoolActivity } from '../../lib/activityLog';
import { useAuth } from '../../context/AuthContext';
import DirectorExamAnswerKey from './DirectorExamAnswerKey';
import DirectorExamAnalysis from './DirectorExamAnalysis';
import DirectorExamImport from './DirectorExamImport';
import ExamCsvImportWizard from './ExamCsvImportWizard';
import ExamManualEntry from './ExamManualEntry';
import CreateMockExamForm from './CreateMockExamForm';
import ExamRankingTable from './ExamRankingTable';
import ExamReportsPanel from './ExamReportsPanel';
import SearchFilterToolbar from '../ui/SearchFilterToolbar';

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
  onAnswerKeySaved,
}) {
  const [tab, setTab] = useState('');

  useEffect(() => {
    setTab('');
  }, [session.id]);

  const secondaryTabs = useMemo(
    () => [
      { id: 'results', label: 'Sonuçlar' },
      { id: 'analysis', label: 'Analiz' },
    ],
    []
  );

  return (
    <div className="exam-session-workspace">
      <ExamCsvImportWizard
        session={session}
        schoolId={schoolId}
        students={students}
        answerKeyId={session.answer_key_id}
        onAnswerKeySaved={onAnswerKeySaved}
        onResultsSaved={onResultsSaved}
        onNavigateToResults={() => setTab('results')}
        onNavigateToAnalysis={() => setTab('analysis')}
      />

      <nav className="exam-workspace-pills" aria-label={`${session.title} sonuç ve analiz`}>
        <div className="exam-workspace-pills__track">
          {secondaryTabs.map((item) => (
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

      <details className="exam-workspace-section">
        <summary className="exam-workspace-section__summary">
          <span className="exam-workspace-section__title">Gelişmiş giriş</span>
          <span className="exam-workspace-section__hint">Manuel giriş, net CSV ve JSON cevap anahtarı</span>
        </summary>
        <div className="exam-workspace-section__body">
          {showManualEntry ? (
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
          <DirectorExamImport
            embedded
            hideTitle
            schoolId={schoolId}
            sessionId={session.id}
            sessionTitle={session.title}
            students={students}
          />
          <DirectorExamAnswerKey
            embedded
            schoolId={schoolId}
            sessions={sessions}
            defaultSessionId={session.id}
          />
        </div>
      </details>
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
  const { profile } = useAuth();
  const [sessions, setSessions] = useState([]);
  const [selectedSessionId, setSelectedSessionId] = useState('');
  const [rankings, setRankings] = useState([]);
  const [subjectResults, setSubjectResults] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [search, setSearch] = useState('');
  const [publisherFilter, setPublisherFilter] = useState('');
  const [gradeFilter, setGradeFilter] = useState(null);
  const [statusFilter, setStatusFilter] = useState('all');
  const [sort, setSort] = useState('date-desc');

  const publisherOptions = useMemo(
    () =>
      [...new Set(sessions.map((session) => session.publisher).filter(Boolean))].sort((a, b) =>
        a.localeCompare(b, 'tr')
      ),
    [sessions]
  );

  const filteredSessions = useMemo(
    () =>
      filterExamSessions(sessions, {
        search,
        publisher: publisherFilter,
        grade: gradeFilter,
        status: statusFilter,
        sort,
      }),
    [sessions, search, publisherFilter, gradeFilter, statusFilter, sort]
  );

  const hasSessionFilters = Boolean(
    publisherFilter || gradeFilter != null || statusFilter !== 'all' || sort !== 'date-desc'
  );

  const activeSessionFilterCount =
    (publisherFilter ? 1 : 0) +
    (gradeFilter != null ? 1 : 0) +
    (statusFilter !== 'all' ? 1 : 0) +
    (sort !== 'date-desc' ? 1 : 0);

  function clearSessionFilters() {
    setPublisherFilter('');
    setGradeFilter(null);
    setStatusFilter('all');
    setSort('date-desc');
  }

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

  async function handleAnswerKeySaved() {
    await load();
  }

  async function handlePublish(sessionId, publish) {
    setError(null);
    try {
      await publishExamSession(sessionId, publish);
      const session = sessions.find((row) => row.id === sessionId);
      if (publish) {
        try {
          await notifyExamResultsPublished({ sessionId, schoolId });
        } catch (notifyError) {
          console.warn('exam notify:', notifyError);
        }
        recordSchoolActivity(supabase, profile, {
          schoolId,
          category: 'exam',
          action: 'published',
          summary: `Sınav sonuçları yayımlandı: ${session?.title ?? 'Deneme'}`,
          targetType: 'exam_session',
          targetId: sessionId,
        });
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

      <details className="cal-collapsible-form exam-sessions-browser dash-card">
        <summary className="cal-collapsible-form__summary cal-browser__summary">
          <span className="cal-collapsible-form__chevron" aria-hidden="true" />
          <span className="cal-browser__summary-text">
            <span className="dash-section-title">Mevcut denemeler</span>
            <span className="dash-hint">{filteredSessions.length} deneme</span>
          </span>
        </summary>

        <div className="cal-collapsible-form__body">
        {sessions.length > 0 ? (
          <SearchFilterToolbar
            searchValue={search}
            onSearchChange={setSearch}
            searchPlaceholder="Başlık veya yayın ara…"
            activeFilterCount={activeSessionFilterCount}
            hasActiveFilters={hasSessionFilters}
            onClearFilters={clearSessionFilters}
            resultHint={
              search.trim()
                ? `${filteredSessions.length}/${sessions.length} deneme`
                : null
            }
          >
            <div className="search-filter-toolbar__fields">
              <label className="dash-label">
                Yayın
                <select
                  className="dash-input"
                  value={publisherFilter}
                  onChange={(event) => setPublisherFilter(event.target.value)}
                >
                  <option value="">Tümü</option>
                  {publisherOptions.map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </select>
              </label>
              <label className="dash-label">
                Durum
                <select
                  className="dash-input"
                  value={statusFilter}
                  onChange={(event) => setStatusFilter(event.target.value)}
                >
                  <option value="all">Tümü</option>
                  <option value="published">Velilere açık</option>
                  <option value="draft">Taslak</option>
                </select>
              </label>
              <label className="dash-label">
                Sırala
                <select className="dash-input" value={sort} onChange={(event) => setSort(event.target.value)}>
                  <option value="date-desc">Tarih (yeni → eski)</option>
                  <option value="date-asc">Tarih (eski → yeni)</option>
                  <option value="title-asc">Başlık A → Z</option>
                  <option value="publisher-asc">Yayınevi A → Z</option>
                </select>
              </label>
            </div>
            <div className="exam-session-filters__grades">
              <p className="dash-label">Sınıf</p>
              <div className="cur-assign-chips" role="group" aria-label="Sınıf filtresi">
                <button
                  type="button"
                  className={`cur-assign-chip${gradeFilter == null ? ' cur-assign-chip--active' : ''}`}
                  onClick={() => setGradeFilter(null)}
                >
                  Tümü
                </button>
                {STUDENT_GRADES.map((grade) => (
                  <button
                    key={grade}
                    type="button"
                    className={`cur-assign-chip${gradeFilter === grade ? ' cur-assign-chip--active' : ''}`}
                    onClick={() => setGradeFilter(grade)}
                  >
                    {formatStudentGrade(grade)}
                  </button>
                ))}
              </div>
            </div>
          </SearchFilterToolbar>
        ) : null}

        <p className="dash-hint">Bir denemeye dokunun; sonuç girişi o satırın içinde açılır.</p>
        {loading ? (
          <p className="dash-hint">Yükleniyor…</p>
        ) : sessions.length === 0 ? (
          <p className="dash-hint">
            Henüz deneme yok. {showCreateMock ? 'Yukarıdan yeni deneme oluşturun.' : 'Deneme sonrası oturum açılır.'}
          </p>
        ) : filteredSessions.length === 0 ? (
          <p className="dash-hint">Bu süzgeçte deneme yok.</p>
        ) : (
          <ul className="exam-session-list">
            {filteredSessions.map((session) => {
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
                      {session.publisher ? (
                        <span className="demo-pill exam-session-publisher">{session.publisher}</span>
                      ) : null}
                      <span className="dash-hint">
                        {formatExamSessionGrades(session)} · {formatExamWhen(session)}
                      </span>
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
                        onAnswerKeySaved={handleAnswerKeySaved}
                      />
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
        </div>
      </details>

      {showReports ? (
        <section className="dash-card">
          <details className="exam-reports-collapse">
            <summary className="exam-reports-collapse__summary">
              <span className="exam-reports-collapse__title">Raporlar</span>
              <span className="dash-hint">PDF rapor üretin — veli, sınıf veya karşılaştırma</span>
            </summary>
            <div className="exam-reports-collapse__body">
              <ExamReportsPanel
                embedded
                schoolId={schoolId}
                school={school}
                students={students}
                classes={classes}
              />
            </div>
          </details>
        </section>
      ) : null}

      {school ? <ExamSettingsBar school={school} /> : null}
    </>
  );
}

export { ExamSettingsBar as ExamDemoBar };
