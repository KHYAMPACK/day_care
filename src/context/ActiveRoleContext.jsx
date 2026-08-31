import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { USER_ROLES } from '../lib/roles';
import {
  normalizeProfileRoles,
  profileHasRole,
  readStoredActiveRole,
  resolveActiveRole,
  staffRolesForProfile,
  storeActiveRole,
} from '../lib/profileRoles';

const ActiveRoleContext = createContext(null);

export function ActiveRoleProvider({ profile, children }) {
  const roles = useMemo(() => normalizeProfileRoles(profile), [profile]);
  const staffRoles = useMemo(() => staffRolesForProfile(profile), [profile]);
  const canSwitchRoles = staffRoles.length > 1;

  const [activeRole, setActiveRoleState] = useState(() =>
    profile ? resolveActiveRole(profile, readStoredActiveRole(profile.id)) : USER_ROLES.parent
  );

  useEffect(() => {
    if (!profile?.id) return;
    const stored = readStoredActiveRole(profile.id);
    setActiveRoleState(resolveActiveRole(profile, stored));
  }, [profile]);

  const setActiveRole = useCallback(
    (role) => {
      if (!profile?.id || !roles.includes(role)) return;
      storeActiveRole(profile.id, role);
      setActiveRoleState(role);
    },
    [profile?.id, roles]
  );

  const hasRole = useCallback((role) => profileHasRole(profile, role), [profile]);

  const value = useMemo(
    () => ({
      roles,
      staffRoles,
      activeRole,
      setActiveRole,
      hasRole,
      canSwitchRoles,
    }),
    [roles, staffRoles, activeRole, setActiveRole, hasRole, canSwitchRoles]
  );

  return <ActiveRoleContext.Provider value={value}>{children}</ActiveRoleContext.Provider>;
}

export function useActiveRole() {
  const context = useContext(ActiveRoleContext);
  if (!context) {
    throw new Error('useActiveRole must be used within ActiveRoleProvider');
  }
  return context;
}
