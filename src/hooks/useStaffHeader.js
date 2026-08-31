import { useMemo } from 'react';
import { useActiveRole } from '../context/ActiveRoleContext';
import { formatRoleLabel, getStaffPanelLabel } from '../lib/roles';

export function useStaffHeader() {
  const { activeRole, staffRoles, setActiveRole, canSwitchRoles } = useActiveRole();

  const roleLabel = useMemo(
    () => getStaffPanelLabel(activeRole) ?? formatRoleLabel(activeRole),
    [activeRole]
  );

  const roleSwitcher = useMemo(
    () =>
      canSwitchRoles
        ? {
            staffRoles,
            activeRole,
            onSelectRole: setActiveRole,
          }
        : null,
    [canSwitchRoles, staffRoles, activeRole, setActiveRole]
  );

  return { roleLabel, roleSwitcher };
}
