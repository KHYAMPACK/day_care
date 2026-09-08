import { useEffect, useMemo, useState } from 'react';
import { useActiveRole } from '../context/ActiveRoleContext';
import {
  getUnseenStaffChangelog,
  isStaffProfile,
  markStaffChangelogSeen,
} from '../lib/staffChangelog';
import StaffWhatsNewDialog from './StaffWhatsNewDialog';

export default function StaffWhatsNewHost({ profile, children }) {
  const { staffRoles } = useActiveRole();
  const [openEntries, setOpenEntries] = useState([]);

  const isStaff = useMemo(() => isStaffProfile(profile), [profile]);

  useEffect(() => {
    if (!profile?.id || !isStaff || !staffRoles.length) {
      setOpenEntries([]);
      return;
    }

    const unseen = getUnseenStaffChangelog(profile, staffRoles);
    setOpenEntries(unseen);
  }, [profile, isStaff, staffRoles]);

  function handleDismiss() {
    if (profile?.id && openEntries.length) {
      markStaffChangelogSeen(
        profile.id,
        openEntries.map((entry) => entry.id)
      );
    }
    setOpenEntries([]);
  }

  return (
    <>
      {children}
      {openEntries.length ? (
        <StaffWhatsNewDialog entries={openEntries} onDismiss={handleDismiss} />
      ) : null}
    </>
  );
}
