import { useEffect, useMemo, useState } from 'react';
import { formatRoleLabel } from '../../lib/roles';
import { Avatar } from '../ui/Avatar';
import { Icon } from '../ui/Icon';

function NavGroup({ item, activeTab, expanded, onToggle, onTabChange }) {
  const childActive = item.children?.some((child) => child.id === activeTab) ?? false;
  const isOpen = expanded || childActive;

  return (
    <div className={`staff-sidebar__group${isOpen ? ' staff-sidebar__group--open' : ''}`}>
      <button
        type="button"
        className={`staff-sidebar__group-toggle${childActive ? ' staff-sidebar__group-toggle--active' : ''}`}
        onClick={onToggle}
        aria-expanded={isOpen}
      >
        <span className="staff-sidebar__item-icon" aria-hidden="true">
          <Icon name={item.icon} size={16} />
        </span>
        <span className="staff-sidebar__group-label">{item.label}</span>
        <span className="staff-sidebar__group-chevron" aria-hidden="true" />
      </button>
      {isOpen ? (
        <div className="staff-sidebar__group-children">
          {item.children.map((child) => {
            const isActive = child.id === activeTab;
            return (
              <button
                key={child.id}
                type="button"
                className={`staff-sidebar__item staff-sidebar__item--child${
                  isActive ? ' staff-sidebar__item--active' : ''
                }`}
                onClick={() => onTabChange?.(child.id)}
                aria-current={isActive ? 'page' : undefined}
              >
                <span className="staff-sidebar__item-icon" aria-hidden="true">
                  <Icon name={child.icon} size={14} />
                </span>
                {child.label}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

export default function StaffShell({
  tabs = [],
  activeTab,
  onTabChange,
  activeLabel: activeLabelOverride,
  schoolName = 'OkulTakip',
  logoUrl,
  userName,
  roleLabel,
  roleSwitcher = null,
  onSignOut,
  signOutLabel = 'Çıkış Yap',
  children,
}) {
  const groupIds = useMemo(
    () => tabs.filter((tab) => tab.children?.length).map((tab) => tab.id),
    [tabs]
  );

  const [expandedGroups, setExpandedGroups] = useState(() => new Set());

  useEffect(() => {
    setExpandedGroups((current) => {
      const next = new Set(current);
      for (const tab of tabs) {
        if (tab.children?.some((child) => child.id === activeTab)) {
          next.add(tab.id);
        }
      }
      return next;
    });
  }, [activeTab, tabs]);

  const activeLabel =
    activeLabelOverride ??
    tabs.find((tab) => tab.id === activeTab)?.label ??
    tabs.flatMap((tab) => tab.children ?? []).find((child) => child.id === activeTab)?.label ??
    roleLabel ??
    '';

  function toggleGroup(groupId) {
    setExpandedGroups((current) => {
      const next = new Set(current);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  }

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
            if (tab.children?.length) {
              return (
                <NavGroup
                  key={tab.id}
                  item={tab}
                  activeTab={activeTab}
                  expanded={expandedGroups.has(tab.id)}
                  onToggle={() => toggleGroup(tab.id)}
                  onTabChange={onTabChange}
                />
              );
            }

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
          {roleSwitcher?.staffRoles?.length > 1 ? (
            <div className="staff-sidebar__role-switch" role="group" aria-label="Aktif rol">
              {roleSwitcher.staffRoles.map((role) => (
                <button
                  key={role}
                  type="button"
                  className={`staff-sidebar__role-btn${
                    role === roleSwitcher.activeRole ? ' staff-sidebar__role-btn--active' : ''
                  }`}
                  aria-pressed={role === roleSwitcher.activeRole}
                  onClick={() => roleSwitcher.onSelectRole(role)}
                >
                  {formatRoleLabel(role)}
                </button>
              ))}
            </div>
          ) : null}
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
