import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import { useActiveRole } from '../context/ActiveRoleContext';
import {
  getUnseenStaffChangelog,
  getVisibleStaffChangelog,
  isStaffProfile,
  markStaffChangelogSeen,
} from '../lib/staffChangelog';
import StaffWhatsNewDialog from './StaffWhatsNewDialog';

const StaffPatchNotesContext = createContext({
  available: false,
  openArchive: () => {},
});

export function useStaffPatchNotes() {
  return useContext(StaffPatchNotesContext);
}

export default function StaffWhatsNewHost({ profile, children }) {
  const { staffRoles } = useActiveRole();
  const [openEntries, setOpenEntries] = useState([]);
  const [archiveOpen, setArchiveOpen] = useState(false);

  const isStaff = useMemo(() => isStaffProfile(profile), [profile]);
  const archiveEntries = useMemo(
    () => (isStaff ? getVisibleStaffChangelog(staffRoles) : []),
    [isStaff, staffRoles]
  );

  useEffect(() => {
    if (!profile?.id || !isStaff || !staffRoles.length) {
      setOpenEntries([]);
      return;
    }

    const unseen = getUnseenStaffChangelog(profile, staffRoles);
    setOpenEntries(unseen);
  }, [profile, isStaff, staffRoles]);

  function handleDismissUnseen() {
    if (profile?.id && openEntries.length) {
      markStaffChangelogSeen(
        profile.id,
        openEntries.map((entry) => entry.id)
      );
    }
    setOpenEntries([]);
  }

  const contextValue = useMemo(
    () => ({
      available: isStaff && archiveEntries.length > 0,
      openArchive: () => setArchiveOpen(true),
    }),
    [isStaff, archiveEntries.length]
  );

  return (
    <StaffPatchNotesContext.Provider value={contextValue}>
      {children}
      {openEntries.length && !archiveOpen ? (
        <StaffWhatsNewDialog entries={openEntries} onDismiss={handleDismissUnseen} />
      ) : null}
      {archiveOpen ? (
        <StaffWhatsNewDialog
          archive
          entries={archiveEntries}
          onDismiss={() => setArchiveOpen(false)}
        />
      ) : null}
    </StaffPatchNotesContext.Provider>
  );
}
