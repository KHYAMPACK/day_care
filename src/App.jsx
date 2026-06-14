import { useEffect, useState } from 'react';
import { supabase } from './lib/supabase';
import AdminDashboard from './components/AdminDashboard';
import ParentDashboard from './components/ParentDashboard';

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
        setProfileError(error.message);
        setProfileLoading(false);
        return;
      }

      if (data) {
        setProfile(data);
        setProfileLoading(false);
        return;
      }

      // No row returned — try to create one, or surface why read/insert failed.
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
        // Row exists but the initial SELECT could not see it (usually RLS or id mismatch).
        const { data: retryProfile, error: retryError } = await supabase
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
          `A profile row exists but does not match your login id (${userId}). ` +
            'In Supabase, open Authentication → Users, copy your User UID, and make sure public.profiles.id is exactly that value. ' +
            'Also run supabase/migrations/003_profiles_rls.sql so users can read their own profile.'
        );
        setProfileLoading(false);
        return;
      }

      setProfile(null);
      setProfileError(
        createError?.message ??
          'Profile not found. Run the backfill SQL in Supabase or check Row Level Security on public.profiles.'
      );
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
      setAuthError(error.message);
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
      <main style={styles.centered}>
        <p>Checking session…</p>
      </main>
    );
  }

  if (!session) {
    return (
      <main style={styles.authPage}>
        <form style={styles.authForm} onSubmit={handleAuthSubmit}>
          <h1>{mode === 'login' ? 'Log in' : 'Sign up'}</h1>

          {mode === 'signup' && (
            <label style={styles.label}>
              Full name
              <input
                style={styles.input}
                type="text"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                autoComplete="name"
              />
            </label>
          )}

          <label style={styles.label}>
            Email
            <input
              style={styles.input}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
          </label>

          <label style={styles.label}>
            Password
            <input
              style={styles.input}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={6}
              autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
            />
          </label>

          {authError && <p style={styles.error}>{authError}</p>}

          <button style={styles.button} type="submit" disabled={authSubmitting}>
            {authSubmitting ? 'Please wait…' : mode === 'login' ? 'Log in' : 'Create account'}
          </button>

          <button
            style={styles.linkButton}
            type="button"
            onClick={() => {
              setMode(mode === 'login' ? 'signup' : 'login');
              setAuthError(null);
            }}
          >
            {mode === 'login'
              ? 'Need an account? Sign up'
              : 'Already have an account? Log in'}
          </button>
        </form>
      </main>
    );
  }

  if (profileLoading) {
    return (
      <main style={styles.centered}>
        <p>Loading your profile…</p>
      </main>
    );
  }

  if (profileError) {
    return (
      <main style={styles.centered}>
        <p style={styles.error}>Could not load profile: {profileError}</p>
        <button style={styles.button} type="button" onClick={handleSignOut}>
          Sign out
        </button>
      </main>
    );
  }

  return (
    <div>
      <header style={styles.header}>
        <span>Signed in as {profile?.email ?? session.user.email}</span>
        <button style={styles.button} type="button" onClick={handleSignOut}>
          Sign out
        </button>
      </header>

      {profile?.role === 'admin' && <AdminDashboard profile={profile} />}
      {profile?.role === 'parent' && <ParentDashboard profile={profile} />}

      {profile && profile.role !== 'admin' && profile.role !== 'parent' && (
        <main style={styles.centered}>
          <p style={styles.error}>Unknown role: {profile.role}</p>
        </main>
      )}
    </div>
  );
}

const styles = {
  centered: {
    minHeight: '100vh',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    gap: '1rem',
    padding: '1.5rem',
  },
  authPage: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '1.5rem',
  },
  authForm: {
    width: '100%',
    maxWidth: '24rem',
    display: 'flex',
    flexDirection: 'column',
    gap: '0.75rem',
  },
  label: {
    display: 'flex',
    flexDirection: 'column',
    gap: '0.25rem',
    fontSize: '0.875rem',
  },
  input: {
    padding: '0.5rem 0.75rem',
    fontSize: '1rem',
    border: '1px solid #ccc',
    borderRadius: '4px',
  },
  button: {
    padding: '0.5rem 1rem',
    fontSize: '1rem',
    cursor: 'pointer',
  },
  linkButton: {
    background: 'none',
    border: 'none',
    padding: 0,
    color: '#2563eb',
    cursor: 'pointer',
    textAlign: 'left',
  },
  error: {
    color: '#b91c1c',
    margin: 0,
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '1rem 1.5rem',
    borderBottom: '1px solid #e5e7eb',
  },
};
