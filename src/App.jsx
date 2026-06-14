import { useEffect, useState } from 'react';
import { supabase } from './lib/supabase';
import AdminDashboard from './components/AdminDashboard';
import ParentDashboard from './components/ParentDashboard';
import {
  ErrorMessage,
  InlineError,
  LoadingPanel,
  OfflineBanner,
  AppLogo,
} from './components/dashboardUi';
import { APP_FULL_NAME } from './lib/branding';

export default function App() {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState(null);

  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [authError, setAuthError] = useState(null);
  const [authSubmitting, setAuthSubmitting] = useState(false);

  useEffect(() => {
    let mounted = true;

    supabase.auth.getSession().then(({ data: { session: currentSession } }) => {
      if (!mounted) return;
      setSession(currentSession);
      setAuthLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setAuthLoading(false);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    if (!session?.user) {
      setProfile(null);
      setProfileError(null);
      setProfileLoading(false);
      return;
    }

    let mounted = true;

    async function fetchProfile() {
      setProfileLoading(true);
      setProfileError(null);

      const userId = session.user.id;

      const { data, error } = await supabase
        .from('profiles')
        .select('id, role, full_name, email')
        .eq('id', userId)
        .maybeSingle();

      if (!mounted) return;

      if (error) {
        setProfile(null);
        setProfileError(error);
        setProfileLoading(false);
        return;
      }

      if (data) {
        setProfile(data);
        setProfileLoading(false);
        return;
      }

      const { data: createdProfile, error: createError } = await supabase
        .from('profiles')
        .insert({
          id: userId,
          email: session.user.email,
          full_name: session.user.user_metadata?.full_name ?? session.user.email,
        })
        .select('id, role, full_name, email')
        .maybeSingle();

      if (!mounted) return;

      if (createdProfile) {
        setProfile(createdProfile);
        setProfileLoading(false);
        return;
      }

      if (createError?.code === '23505') {
        const { data: retryProfile } = await supabase
          .from('profiles')
          .select('id, role, full_name, email')
          .eq('id', userId)
          .maybeSingle();

        if (!mounted) return;

        if (retryProfile) {
          setProfile(retryProfile);
          setProfileLoading(false);
          return;
        }

        setProfile(null);
        setProfileError(
          'Profil bulundu ancak hesabınızla eşleşmiyor. Yöneticinizden profilinizi kontrol etmesini isteyin.'
        );
        setProfileLoading(false);
        return;
      }

      setProfile(null);
      setProfileError(createError);
      setProfileLoading(false);
    }

    fetchProfile();

    return () => {
      mounted = false;
    };
  }, [session]);

  async function handleAuthSubmit(event) {
    event.preventDefault();
    setAuthError(null);
    setAuthSubmitting(true);

    try {
      if (mode === 'login') {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
      } else {
        const { error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: { full_name: fullName.trim() || undefined },
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

  async function handleSignOut() {
    setAuthError(null);
    await supabase.auth.signOut();
  }

  if (authLoading) {
    return (
      <>
        <OfflineBanner />
        <LoadingPanel message="Oturum kontrol ediliyor…" />
      </>
    );
  }

  if (!session) {
    return (
      <>
        <OfflineBanner />
        <main className="auth-page">
          <div className="auth-card">
            <AppLogo variant="full" className="auth-logo" />
            <h1 className="auth-brand">{APP_FULL_NAME}</h1>
            <p className="auth-tagline">
              Veliler ve yöneticiler için nazik, sade bildirim deneyimi.
            </p>

            <form className="auth-form" onSubmit={handleAuthSubmit}>
              {mode === 'signup' && (
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
          <button className="auth-submit" type="button" onClick={handleSignOut}>
            Çıkış Yap
          </button>
        </main>
      </>
    );
  }

  return (
    <div className="app-shell">
      <OfflineBanner />
      {profile?.role === 'admin' && (
        <AdminDashboard profile={profile} onSignOut={handleSignOut} />
      )}
      {profile?.role === 'parent' && (
        <ParentDashboard profile={profile} onSignOut={handleSignOut} />
      )}

      {profile && profile.role !== 'admin' && profile.role !== 'parent' && (
        <main className="app-centered app-centered--wide">
          <ErrorMessage
            error="Bu hesap türü desteklenmiyor."
            context="general"
            onRetry={handleSignOut}
            retryLabel="Çıkış Yap"
          />
        </main>
      )}
    </div>
  );
}
