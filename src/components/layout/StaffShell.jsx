import { Avatar } from '../ui/Avatar';
import { Icon } from '../ui/Icon';

export default function StaffShell({
  tabs = [],
  activeTab,
  onTabChange,
  schoolName = 'OkulTakip',
  logoUrl,
  userName,
  roleLabel,
  onSignOut,
  signOutLabel = 'Çıkış Yap',
  children,
}) {
  const activeLabel = tabs.find((tab) => tab.id === activeTab)?.label ?? roleLabel ?? '';

  return (
    <div className="staff-shell">
      <aside className="staff-sidebar" aria-label="Ana gezinme">
        <div className="staff-sidebar__brand">
          <div className="staff-sidebar__logo-wrap" aria-hidden={logoUrl ? undefined : true}>
            {logoUrl ? (
              <img src={logoUrl} alt="" className="staff-sidebar__logo" />
            ) : (
              <Avatar name={schoolName} size={36} />
            )}
          </div>
          <div className="staff-sidebar__brand-text">
            <p className="staff-sidebar__school">{schoolName}</p>
            {roleLabel ? <p className="staff-sidebar__role">{roleLabel}</p> : null}
          </div>
        </div>

        <nav className="staff-sidebar__nav" aria-label="Panel sekmeleri">
          {tabs.map((tab) => {
            const isActive = tab.id === activeTab;
            return (
              <button
                key={tab.id}
                type="button"
                className={`staff-sidebar__item${isActive ? ' staff-sidebar__item--active' : ''}`}
                onClick={() => onTabChange?.(tab.id)}
                aria-current={isActive ? 'page' : undefined}
              >
                <span className="staff-sidebar__item-icon" aria-hidden="true">
                  <Icon name={tab.icon} size={16} />
                </span>
                {tab.label}
              </button>
            );
          })}
        </nav>

        <div className="staff-sidebar__footer">
          <div className="staff-sidebar__user">
            <Avatar name={userName || schoolName} size={36} />
            <div className="staff-sidebar__user-text">
              <p className="staff-sidebar__user-name">{userName || schoolName}</p>
              {roleLabel ? <p className="staff-sidebar__user-role">{roleLabel}</p> : null}
            </div>
          </div>
          {onSignOut ? (
            <button type="button" className="staff-sidebar__signout" onClick={onSignOut}>
              <Icon name="logout" size={15} />
              {signOutLabel}
            </button>
          ) : null}
        </div>
      </aside>

      <div className="staff-main">
        {activeLabel ? (
          <header className="staff-topbar">
            <h1 className="staff-topbar__title">{activeLabel}</h1>
          </header>
        ) : null}
        {children}
      </div>
    </div>
  );
}
