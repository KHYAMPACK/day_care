import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { applySchoolTheme, clearSchoolTheme } from '../lib/schoolTheme';

const PROFILE_SELECT_BASE =
  'id, role, primary_role, full_name, email, username, school_id, phone, subject_id, subject_slug, curriculum_subjects ( id, name, grade, color, icon, slug )';
const PROFILE_SELECT = `${PROFILE_SELECT_BASE}, profile_roles ( role )`;
const SCHOOL_SELECT = 'id, name, logo_url, primary_color, secondary_color, custom_domain, features';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [profile, setProfile] = useState(null);
  const [school, setSchool] = useState(null);
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

  const fetchSchool = useCallback(async (schoolId) => {
    if (!schoolId) {
      setSchool(null);
      clearSchoolTheme();
      return null;
    }

    const { data, error } = await supabase
      .from('schools')
      .select(SCHOOL_SELECT)
      .eq('id', schoolId)
      .maybeSingle();

    if (error) {
      throw error;
    }

    setSchool(data ?? null);
    applySchoolTheme(data);
    return data ?? null;
  }, []);

  const fetchProfile = useCallback(async (userId, userEmail, userMetadata) => {
    let { data, error } = await supabase
      .from('profiles')
      .select(PROFILE_SELECT)
      .eq('id', userId)
      .maybeSingle();

    if (error && /profile_roles|schema cache/i.test(error.message ?? '')) {
      ({ data, error } = await supabase
        .from('profiles')
        .select(PROFILE_SELECT_BASE)
        .eq('id', userId)
        .maybeSingle());
    }

    if (error && /primary_role|schema cache/i.test(error.message ?? '')) {
      ({ data, error } = await supabase
        .from('profiles')
        .select(
          'id, role, full_name, email, username, school_id, phone, subject_id, subject_slug, curriculum_subjects ( id, name, grade, color, icon, slug ), profile_roles ( role )'
        )
        .eq('id', userId)
        .maybeSingle());
      if (data && data.primary_role == null) {
        data.primary_role = data.role;
      }
    }

    if (error) {
      throw error;
    }

    if (data) {
      if (!data.primary_role && data.role) {
        data.primary_role = data.role;
      }
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
      setSchool(null);
      setProfileError(null);
      setProfileLoading(false);
      clearSchoolTheme();
      return;
    }

    let mounted = true;

    async function loadProfileAndSchool() {
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

        if (nextProfile?.school_id) {
          await fetchSchool(nextProfile.school_id);
        } else if (mounted) {
          setSchool(null);
          clearSchoolTheme();
        }
      } catch (error) {
        if (!mounted) return;
        setProfile(null);
        setSchool(null);
        clearSchoolTheme();
        setProfileError(error);
      } finally {
        if (mounted) setProfileLoading(false);
      }
    }

    loadProfileAndSchool();

    return () => {
      mounted = false;
    };
  }, [session, fetchProfile, fetchSchool]);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
  }, []);

  const refreshSchool = useCallback(async () => {
    if (!profile?.school_id) {
      setSchool(null);
      clearSchoolTheme();
      return null;
    }

    return fetchSchool(profile.school_id);
  }, [profile?.school_id, fetchSchool]);

  const refreshProfile = useCallback(async () => {
    if (!session?.user) {
      setProfile(null);
      return null;
    }

    const nextProfile = await fetchProfile(
      session.user.id,
      session.user.email,
      session.user.user_metadata
    );
    setProfile(nextProfile);
    return nextProfile;
  }, [session, fetchProfile]);

  const value = useMemo(
    () => ({
      session,
      profile,
      school,
      schoolId: profile?.school_id ?? null,
      authLoading,
      profileLoading,
      profileError,
      signOut,
      refreshSchool,
      refreshProfile,
    }),
    [
      session,
      profile,
      school,
      authLoading,
      profileLoading,
      profileError,
      signOut,
      refreshSchool,
      refreshProfile,
    ]
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
