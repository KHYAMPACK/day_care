import { useState } from 'react';
import { supabase } from './lib/supabase';
import { useAuth } from './context/AuthContext';
import { ActiveRoleProvider, useActiveRole } from './context/ActiveRoleContext';
import { useTenant } from './context/TenantContext';
import { buildLoginEmail, normalizeUsername } from './lib/staffUsers';
import AdminDashboard from './components/AdminDashboard';
import DirectorDashboard from './screens/pages/DirectorDashboard';
import CounselorDashboard from './screens/pages/CounselorDashboard';
import ParentDashboard from './components/ParentDashboard';
import {
  ErrorMessage,
  InlineError,
  LoadingPanel,
  OfflineBanner,
} from './components/dashboardUi';
import { USER_ROLES } from './lib/roles';
import StaffWhatsNewHost from './components/StaffWhatsNewHost';

function AuthScreen() {
  const { tenant, tenantSchoolId } = useTenant();
  const [username, setUsername] = useState('');
  const [pin, setPin] = useState('');
  const [authError, setAuthError] = useState(null);
  const [authSubmitting, setAuthSubmitting] = useState(false);

  async function handleAuthSubmit(event) {
    event.preventDefault();
    setAuthError(null);

    if (!tenantSchoolId) {
      setAuthError('Giriş yapmak için okulunuzun web adresini kullanın.');
      return;
    }

    const normalizedUsername = normalizeUsername(username);
    const normalizedPin = pin.trim();

    if (!normalizedUsername) {
      setAuthError('Kullanıcı adı zorunludur.');
      return;
    }

    if (!/^\d{6}$/.test(normalizedPin)) {
      setAuthError('PIN 6 haneli olmalıdır.');
      return;
    }

    setAuthSubmitting(true);

    try {
      const email = buildLoginEmail(tenantSchoolId, normalizedUsername);
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password: normalizedPin,
      });
      if (error) throw error;
    } catch (error) {
      setAuthError(error);
    } finally {
      setAuthSubmitting(false);
    }
  }

  return (
    <>
      <OfflineBanner />
      <main className="auth-page">
        <div className="auth-card">
          <h1 className="auth-brand">{tenant.resolved ? tenant.name : 'OkulTakip'}</h1>
          {tenant.resolved ? (
            <p className="auth-tagline">Kullanıcı adı ve PIN ile giriş yapın</p>
          ) : (
            <p className="auth-tagline">
              Giriş yapmak için okulunuzun web adresini kullanın.
            </p>
          )}

          {tenantSchoolId ? (
            <form className="auth-form" onSubmit={handleAuthSubmit}>
              <label className="auth-label">
                Kullanıcı adı
                <input
                  className="auth-input"
                  type="text"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  required
                  autoComplete="username"
                  autoCapitalize="none"
                  spellCheck={false}
                  placeholder="ahmet.yilmaz"
                />
              </label>

              <label className="auth-label">
                PIN
                <input
                  className="auth-input"
                  type="password"
                  inputMode="numeric"
                  pattern="\d{6}"
                  maxLength={6}
                  value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  required
                  autoComplete="current-password"
                  placeholder="••••••"
                />
                <span className="auth-hint">Okul yönetiminizden aldığınız 6 haneli PIN.</span>
              </label>

              {authError && (
                <div className="auth-error-wrap">
                  <InlineError error={authError} context="auth" />
                </div>
              )}

              <button className="auth-submit" type="submit" disabled={authSubmitting}>
                {authSubmitting ? 'Lütfen bekleyin…' : 'Giriş Yap'}
              </button>
            </form>
          ) : null}
        </div>
      </main>
    </>
  );
}

function RoleBasedDashboard({ profile, schoolId, onSignOut }) {
  const { activeRole, hasRole } = useActiveRole();

  if (activeRole === USER_ROLES.director && hasRole(USER_ROLES.director)) {
    return <DirectorDashboard profile={profile} schoolId={schoolId} onSignOut={onSignOut} />;
  }

  if (activeRole === USER_ROLES.counselor && hasRole(USER_ROLES.counselor)) {
    return <CounselorDashboard profile={profile} schoolId={schoolId} onSignOut={onSignOut} />;
  }

  if (activeRole === USER_ROLES.teacher && hasRole(USER_ROLES.teacher)) {
    return <AdminDashboard profile={profile} schoolId={schoolId} onSignOut={onSignOut} />;
  }

  if (activeRole === USER_ROLES.parent && hasRole(USER_ROLES.parent)) {
    return <ParentDashboard profile={profile} schoolId={schoolId} onSignOut={onSignOut} />;
  }

  return (
    <main className="app-centered app-centered--wide">
      <ErrorMessage
        error="Bu hesap türü desteklenmiyor."
        context="general"
        onRetry={onSignOut}
        retryLabel="Çıkış Yap"
      />
    </main>
  );
}

function AppRoutes() {
  const { session, profile, schoolId, authLoading, profileLoading, profileError, signOut } =
    useAuth();
  const { tenantSchoolId, tenantLoading } = useTenant();

  if (authLoading || tenantLoading) {
    return (
      <>
        <OfflineBanner />
        <LoadingPanel message="Oturum kontrol ediliyor…" />
      </>
    );
  }

  if (!session) {
    return <AuthScreen />;
  }

  if (profileLoading) {
    return (
      <>
        <OfflineBanner />
        <LoadingPanel message="Profiliniz yükleniyor…" />
      </>
    );
  }

  if (profileError) {
    return (
      <>
        <OfflineBanner />
        <main className="app-centered app-centered--wide">
          <ErrorMessage
            error={profileError}
            context="profile"
            onRetry={() => window.location.reload()}
          />
          <button className="auth-submit" type="button" onClick={signOut}>
            Çıkış Yap
          </button>
        </main>
      </>
    );
  }

  if (!profile?.school_id) {
    return (
      <>
        <OfflineBanner />
        <main className="app-centered app-centered--wide">
          <ErrorMessage
            error="Hesabınıza bir okul atanmamış. Lütfen yöneticinizle iletişime geçin."
            context="profile"
            onRetry={() => window.location.reload()}
          />
          <button className="auth-submit" type="button" onClick={signOut}>
            Çıkış Yap
          </button>
        </main>
      </>
    );
  }

  if (tenantSchoolId && profile.school_id !== tenantSchoolId) {
    return (
      <>
        <OfflineBanner />
        <main className="app-centered app-centered--wide">
          <ErrorMessage
            error="Bu hesap bu okulun alan adıyla eşleşmiyor. Lütfen doğru okul adresinden giriş yapın."
            context="auth"
            onRetry={signOut}
            retryLabel="Çıkış Yap"
          />
        </main>
      </>
    );
  }

  return (
    <div className="app-shell">
      <OfflineBanner />
      <ActiveRoleProvider profile={profile}>
        <StaffWhatsNewHost profile={profile}>
          <RoleBasedDashboard profile={profile} schoolId={schoolId} onSignOut={signOut} />
        </StaffWhatsNewHost>
      </ActiveRoleProvider>
    </div>
  );
}

export default function App() {
  return <AppRoutes />;
}
