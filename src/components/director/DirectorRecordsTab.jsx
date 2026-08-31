import DirectorAttendance from '../attendance/DirectorAttendance';
import SchoolActivityLogTab from '../logs/SchoolActivityLogTab';
import { getRecordsSubNavItems } from '../../lib/directorNav';
import DirectorSubNav from './DirectorSubNav';

export default function DirectorRecordsTab({
  activeTab,
  onTabChange,
  schoolId,
  school,
  students,
  classes,
}) {
  const items = getRecordsSubNavItems();
  const currentTab = activeTab === 'attendance' ? 'attendance' : 'audit';

  return (
    <div className="director-section-hub">
      <DirectorSubNav items={items} active={currentTab} onChange={onTabChange} />
      {currentTab === 'audit' ? (
        <SchoolActivityLogTab schoolId={schoolId} school={school} />
      ) : (
        <DirectorAttendance schoolId={schoolId} students={students} classes={classes} />
      )}
    </div>
  );
}
