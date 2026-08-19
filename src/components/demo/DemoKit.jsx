import { useCallback, useEffect, useRef, useState } from 'react';
import { SCREEN_TITLES } from '../../lib/demoData';

export function useDemoNav(initialTab = 'home') {
  const [tab, setTab] = useState(initialTab);
  const [moduleId, setModuleId] = useState(null);
  const [toast, setToast] = useState(null);
  const toastTimer = useRef(null);

  const notify = useCallback((message) => {
    setToast(message);
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 2400);
  }, []);

  useEffect(
    () => () => {
      if (toastTimer.current) window.clearTimeout(toastTimer.current);
    },
    []
  );

  function selectTab(nextTab) {
    setModuleId(null);
    setTab(nextTab);
  }

  return {
    tab,
    selectTab,
    moduleId,
    openModule: setModuleId,
    closeModule: () => setModuleId(null),
    view: moduleId ?? tab,
    isModule: Boolean(moduleId),
    toast,
    notify,
  };
}

export function DemoToast({ message }) {
  if (!message) return null;
  return (
    <div className="demo-toast" role="status">
      <span aria-hidden="true">✨</span>
      {message}
    </div>
  );
}

export function DemoSubHeader({ title, onBack }) {
  return (
    <header className="demo-subheader">
      <button type="button" className="demo-back" onClick={onBack} aria-label="Geri">
        ←
      </button>
      <h1 className="demo-subheader__title">{title}</h1>
    </header>
  );
}

export function ModuleGrid({ modules, onOpen }) {
  return (
    <section className="demo-grid-wrap">
      <h2 className="dash-section-title">Modüller</h2>
      <p className="dash-hint">Kreş gününün tamamı tek yerde — bir modüle dokunun.</p>
      <ul className="demo-grid">
        {modules.map((module) => (
          <li key={module.id}>
            <button
              type="button"
              className={`demo-grid-tile demo-grid-tile--${module.tint ?? 'lavender'}`}
              onClick={() => onOpen(module.id)}
            >
              <span className="demo-grid-tile__icon" aria-hidden="true">
                {module.icon}
              </span>
              <span className="demo-grid-tile__label">{module.label}</span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function DemoBottomNav({ tabs, active, onChange }) {
  return (
    <nav className="demo-tabbar" aria-label="Ana gezinme">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          className={`demo-tabbar__btn${active === tab.id ? ' demo-tabbar__btn--active' : ''}`}
          onClick={() => onChange(tab.id)}
          aria-current={active === tab.id ? 'page' : undefined}
        >
          <span className="demo-tabbar__icon" aria-hidden="true">
            {tab.icon}
          </span>
          {tab.label}
        </button>
      ))}
    </nav>
  );
}

export function moduleTitle(id) {
  return SCREEN_TITLES[id] ?? 'Modül';
}
