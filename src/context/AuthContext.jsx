import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';

const PROFILE_SELECT = 'id, role, full_name, email, school_id';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState(null);

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

  const fetchProfile = useCallback(async (userId, userEmail, userMetadata) => {
    const { data, error } = await supabase
      .from('profiles')
      .select(PROFILE_SELECT)
      .eq('id', userId)
      .maybeSingle();

    if (error) {
      throw error;
    }

    if (data) {
      return data;
    }

    const metadataSchoolId = userMetadata?.school_id ?? null;

    const { data: createdProfile, error: createError } = await supabase
      .from('profiles')
      .insert({
        id: userId,
        email: userEmail,
        full_name: userMetadata?.full_name ?? userEmail,
        ...(metadataSchoolId ? { school_id: metadataSchoolId } : {}),
      })
      .select(PROFILE_SELECT)
      .maybeSingle();

    if (createdProfile) {
      return createdProfile;
    }

    if (createError?.code === '23505') {
      const { data: retryProfile, error: retryError } = await supabase
        .from('profiles')
        .select(PROFILE_SELECT)
        .eq('id', userId)
        .maybeSingle();

      if (retryError) throw retryError;

      if (retryProfile) {
        return retryProfile;
      }

      throw new Error(
        'Profil bulundu ancak hesabınızla eşleşmiyor. Yöneticinizden profilinizi kontrol etmesini isteyin.'
      );
    }

    throw createError ?? new Error('Profil oluşturulamadı.');
  }, []);

  useEffect(() => {
    if (!session?.user) {
      setProfile(null);
      setProfileError(null);
      setProfileLoading(false);
      return;
    }

    let mounted = true;

    async function loadProfile() {
      setProfileLoading(true);
      setProfileError(null);

      try {
        const nextProfile = await fetchProfile(
          session.user.id,
          session.user.email,
          session.user.user_metadata
        );

        if (!mounted) return;
        setProfile(nextProfile);
      } catch (error) {
        if (!mounted) return;
        setProfile(null);
        setProfileError(error);
      } finally {
        if (mounted) setProfileLoading(false);
      }
    }

    loadProfile();

    return () => {
      mounted = false;
    };
  }, [session, fetchProfile]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  const value = useMemo(
    () => ({
      session,
      profile,
      schoolId: profile?.school_id ?? null,
      authLoading,
      profileLoading,
      profileError,
      signOut,
    }),
    [session, profile, authLoading, profileLoading, profileError, signOut]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within AuthProvider');
  }
  return context;
}
