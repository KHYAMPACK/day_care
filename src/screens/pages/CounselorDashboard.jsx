import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase';
import { withSchoolFilter } from '../../lib/tenant';
import { useAuth } from '../../context/AuthContext';
import { USER_ROLES } from '../../lib/roles';
import { COUNSELOR_TABS, defaultCounselorTab } from '../../lib/demoData';
import { loadSchoolClasses } from '../../lib/curriculum';
import { loadRankingsForSessions } from '../../lib/lgsExam';
import { loadExamSessions } from '../../lib/exams';
import {
  AppNavbar,
  ErrorMessage,
  LoadingPanel,
} from '../../components/dashboardUi';
import { DemoBottomNav, useDemoNav } from '../../components/demo/DemoKit';
import { AnimatedView } from '../../components/ui/AnimatedView';
import StaffShell from '../../components/layout/StaffShell';
import AcademicCalendar from '../../components/calendar/AcademicCalendar';
import ExamOperationsPanel from '../../components/exams/ExamOperationsPanel';
import ExamReportsPanel from '../../components/exams/ExamReportsPanel';
import CounselorExamOverview from '../../components/exams/CounselorExamOverview';
import CounselorStudentsTab from '../../components/exams/CounselorStudentsTab';

function AccessDenied({ onSignOut }) {
  return (
    <main className="dash-page dash-error-page">
      <ErrorMessage
        error="Bu panele yalnızca rehberlikçi hesapları erişebilir."
        context="auth"
        onRetry={onSignOut}
        retryLabel="Çıkış Yap"
      />
    </main>
  );
}

export default function CounselorDashboard({ profile, schoolId, onSignOut }) {
  const { school } = useAuth();
  const demoNav = useDemoNav(defaultCounselorTab());
  const [students, setStudents] = useState([]);
  const [classes, setClasses] = useState([]);
  const [rankings, setRankings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);

  const displayName = profile?.full_name ?? profile?.email ?? 'Rehberlikçi';
  const schoolName = school?.name ?? 'OkulTakip';
  const navLogoUrl = school?.logo_url ?? null;

  const loadData = useCallback(async () => {
    setLoadError(null);
    let studentsRes = await withSchoolFilter(
      supabase
        .from('students')
        .select('id, full_name, grade, class_id, student_number')
        .order('full_name'),
      schoolId
    );
    if (studentsRes.error && /student_number|class_id/i.test(studentsRes.error.message ?? '')) {
      studentsRes = await withSchoolFilter(
        supabase.from('students').select('id, full_name, grade, class_id').order('full_name'),
        schoolId
      );
    }
    if (studentsRes.error) throw studentsRes.error;

    const schoolClasses = await loadSchoolClasses(schoolId).catch(() => []);
    const sessions = await loadExamSessions(schoolId);
    const sessionIds = sessions.map((s) => s.id);
    const rankRows = sessionIds.length ? await loadRankingsForSessions(sessionIds) : [];

    setStudents(studentsRes.data ?? []);
    setClasses(schoolClasses);
    setRankings(rankRows);
  }, [schoolId]);

  useEffect(() => {
    if (profile?.role !== USER_ROLES.counselor) return;
    let mounted = true;
    (async () => {
      setLoading(true);
      try {
        await loadData();
      } catch (error) {
        if (mounted) setLoadError(error);
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [profile?.role, loadData]);

  if (profile?.role !== USER_ROLES.counselor) {
    return (
      <>
        <AppNavbar schoolName={schoolName} roleLabel="Rehberlik" logoUrl={navLogoUrl} userName={displayName} onSignOut={onSignOut} />
        <AccessDenied onSignOut={onSignOut} />
      </>
    );
  }

  if (loading) {
    return (
      <>
        <AppNavbar schoolName={schoolName} roleLabel="Rehberlik" logoUrl={navLogoUrl} userName={displayName} onSignOut={onSignOut} />
        <LoadingPanel message="Rehberlik paneli yükleniyor…" />
      </>
    );
  }

  if (loadError) {
    return (
      <>
        <AppNavbar schoolName={schoolName} roleLabel="Rehberlik" logoUrl={navLogoUrl} userName={displayName} onSignOut={onSignOut} />
        <main className="dash-page dash-error-page">
          <ErrorMessage error={loadError} context="admin" onRetry={() => window.location.reload()} />
        </main>
      </>
    );
  }

  return (
    <StaffShell
      tabs={COUNSELOR_TABS}
      activeTab={demoNav.tab}
      onTabChange={demoNav.selectTab}
      schoolName={schoolName}
      logoUrl={navLogoUrl}
      userName={displayName}
      roleLabel="Rehberlik"
      onSignOut={onSignOut}
    >
      <AppNavbar schoolName={schoolName} roleLabel="Rehberlik" logoUrl={navLogoUrl} userName={displayName} onSignOut={onSignOut} />

      <main className="dash-page dash-page--flush dash-page--tabbar">
        <AnimatedView viewKey={demoNav.tab}>
          {demoNav.tab === 'overview' && (
            <>
              <section className="page-hero">
                <h1 className="page-hero__title">Rehberlik</h1>
                <p className="page-hero__subtitle">Hoş geldiniz, {displayName}.</p>
              </section>
              <CounselorExamOverview schoolId={schoolId} students={students} classes={classes} />
            </>
          )}

          {demoNav.tab === 'exams' && (
            <ExamOperationsPanel
              schoolId={schoolId}
              school={school}
              students={students}
              classes={classes}
              showManualEntry
              showCreateMock
              showReports={false}
            />
          )}

          {demoNav.tab === 'reports' && (
            <ExamReportsPanel
              schoolId={schoolId}
              school={school}
              students={students}
              classes={classes}
            />
          )}

          {demoNav.tab === 'students' && (
            <CounselorStudentsTab students={students} classes={classes} rankings={rankings} />
          )}

          {demoNav.tab === 'calendar' && (
            <AcademicCalendar schoolId={schoolId} canEdit />
          )}
        </AnimatedView>
      </main>

      <DemoBottomNav tabs={COUNSELOR_TABS} active={demoNav.tab} onChange={demoNav.selectTab} />
    </StaffShell>
  );
}
