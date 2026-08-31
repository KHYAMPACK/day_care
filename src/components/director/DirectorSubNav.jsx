import { Icon } from '../ui/Icon';

export default function DirectorSubNav({ items, active, onChange, className = '' }) {
  if (!items?.length) return null;

  return (
    <nav className={`director-subnav${className ? ` ${className}` : ''}`} aria-label="Alt bölümler">
      <div className="director-subnav__track">
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`director-subnav__btn${active === item.id ? ' director-subnav__btn--active' : ''}`}
            onClick={() => onChange(item.id)}
            aria-current={active === item.id ? 'page' : undefined}
          >
            <span className="director-subnav__icon" aria-hidden="true">
              <Icon name={item.icon} size={15} />
            </span>
            {item.label}
          </button>
        ))}
      </div>
    </nav>
  );
}
