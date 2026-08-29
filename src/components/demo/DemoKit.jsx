import { useState } from 'react';
import { Icon } from '../ui/Icon';

export function getTabFromSearch(fallback = 'home') {
  if (typeof window === 'undefined') return fallback;
  const tab = new URLSearchParams(window.location.search).get('tab');
  return tab || fallback;
}

export function useDemoNav(initialTab = 'home') {
  const [tab, setTab] = useState(() => getTabFromSearch(initialTab));

  function selectTab(nextTab) {
    setTab(nextTab);
  }

  return {
    tab,
    selectTab,
  };
}

export function DemoBottomNav({ tabs, active, onChange }) {
  const columnCount = Math.min(Math.max(tabs.length, 1), 7);
  return (
    <nav
      className={`demo-tabbar${tabs.length > 6 ? ' demo-tabbar--dense' : ''}`}
      aria-label="Ana gezinme"
      style={{ gridTemplateColumns: `repeat(${columnCount}, minmax(0, 1fr))` }}
    >
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          className={`demo-tabbar__btn${active === tab.id ? ' demo-tabbar__btn--active' : ''}`}
          onClick={() => onChange(tab.id)}
          aria-current={active === tab.id ? 'page' : undefined}
        >
          <span className="demo-tabbar__icon" aria-hidden="true">
            <Icon name={tab.icon} size={20} />
          </span>
          {tab.label}
        </button>
      ))}
    </nav>
  );
}
