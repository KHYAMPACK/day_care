import { useState } from 'react';
import { supabase } from './lib/supabase';
import { useAuth } from './context/AuthContext';
import {
  INVALID_SCHOOL_CODE_MESSAGE,
  resolveSchoolIdByCode,
} from './lib/schoolInvite';
import AdminDashboard from './components/AdminDashboard';
import DirectorDashboard from './screens/pages/DirectorDashboard';
import ParentDashboard from './components/ParentDashboard';
import {
  ErrorMessage,
  InlineError,
  LoadingPanel,
  OfflineBanner,
} from './components/dashboardUi';
import { USER_ROLES } from './lib/roles';

function AuthScreen() {
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [schoolCode, setSchoolCode] = useState('');
  const [authError, setAuthError] = useState(null);
  const [authSubmitting, setAuthSubmitting] = useState(false);

  async function handleAuthSubmit(event) {
    event.preventDefault();
    setAuthError(null);
    setAuthSubmitting(true);

    try {
      if (mode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else {
        const trimmedCode = schoolCode.trim();
        if (!trimmedCode) {
          setAuthError('Okul kodu zorunludur.');
          return;
        }

        const resolvedSchoolId = await resolveSchoolIdByCode(trimmedCode);
        if (!resolvedSchoolId) {
          setAuthError(INVALID_SCHOOL_CODE_MESSAGE);
          return;
        }

        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              full_name: fullName.trim() || undefined,
              school_id: resolvedSchoolId,
            },
          },
        });
        if (error) throw error;
      }
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
          <h1 className="auth-brand">🎈 Kreş Takip Sistemi</h1>
          <p className="auth-tagline">
            Veliler ve yöneticiler için nazik, sade bildirim deneyimi.
          </p>

          <form className="auth-form" onSubmit={handleAuthSubmit}>
            {mode === 'signup' && (
              <>
                <label className="auth-label">
                  Ad Soyad
                  <input
                    className="auth-input"
                    type="text"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    autoComplete="name"
                    placeholder="Adınız Soyadınız"
                  />
                </label>

                <label className="auth-label">
                  Okul Kodu
                  <input
                    className="auth-input auth-input--code"
                    type="text"
                    value={schoolCode}
                    onChange={(e) => setSchoolCode(e.target.value.toUpperCase())}
                    required
                    autoComplete="off"
                    autoCapitalize="characters"
                    spellCheck={false}
                    placeholder="MEMNUN1"
                  />
                  <span className="auth-hint">
                    Kreş yönetiminizden aldığınız davet kodunu girin.
                  </span>
                </label>
              </>
            )}

            <label className="auth-label">
              E-posta
              <input
                className="auth-input"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                autoComplete="email"
                placeholder="ornek@email.com"
              />
            </label>

            <label className="auth-label">
              Şifre
              <input
                className="auth-input"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                placeholder="••••••••"
              />
            </label>

            {authError && (
              <div className="auth-error-wrap">
                <InlineError error={authError} context="auth" />
              </div>
            )}

            <button className="auth-submit" type="submit" disabled={authSubmitting}>
              {authSubmitting
                ? 'Lütfen bekleyin…'
                : mode === 'login'
                  ? 'Giriş Yap'
                  : 'Hesap Oluştur'}
            </button>

            <button
              className="auth-link"
              type="button"
              onClick={() => {
                setMode(mode === 'login' ? 'signup' : 'login');
                setAuthError(null);
                setSchoolCode('');
              }}
            >
              {mode === 'login'
                ? 'Hesabınız yok mu? Kaydolun'
                : 'Zaten hesabınız var mı? Giriş yapın'}
            </button>
          </form>
        </div>
      </main>
    </>
  );
}

function AppRoutes() {
  const { session, profile, schoolId, authLoading, profileLoading, profileError, signOut } =
    useAuth();

  if (authLoading) {
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

  return (
    <div className="app-shell">
      <OfflineBanner />
      {profile.role === USER_ROLES.director && (
        <DirectorDashboard profile={profile} schoolId={schoolId} onSignOut={signOut} />
      )}
      {profile.role === USER_ROLES.teacher && (
        <AdminDashboard profile={profile} schoolId={schoolId} onSignOut={signOut} />
      )}
      {profile.role === USER_ROLES.parent && (
        <ParentDashboard profile={profile} schoolId={schoolId} onSignOut={signOut} />
      )}

      {profile.role !== USER_ROLES.director &&
        profile.role !== USER_ROLES.teacher &&
        profile.role !== USER_ROLES.parent && (
          <main className="app-centered app-centered--wide">
            <ErrorMessage
              error="Bu hesap türü desteklenmiyor."
              context="general"
              onRetry={signOut}
              retryLabel="Çıkış Yap"
            />
          </main>
        )}
    </div>
  );
}

export default function App() {
  return <AppRoutes />;
}
