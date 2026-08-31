import DirectorSubNav from './DirectorSubNav';
import { getCommunicationsSubNavItems } from '../../lib/directorNav';

export default function DirectorCommunicationsTab({
  activeTab,
  onTabChange,
  announcements,
  templates,
}) {
  const items = getCommunicationsSubNavItems();
  const currentTab = activeTab === 'templates' ? 'templates' : 'announcements';

  return (
    <div className="director-section-hub">
      <DirectorSubNav items={items} active={currentTab} onChange={onTabChange} />
      {currentTab === 'announcements' ? announcements : templates}
    </div>
  );
}
