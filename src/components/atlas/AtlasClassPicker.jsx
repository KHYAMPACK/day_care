import { formatClassLabel } from '../../lib/curriculum';
import { Icon } from '../ui/Icon';

export default function AtlasClassPicker({ classes, subjectName, hint, onSelectClass }) {
  return (
    <div className="atlas-class-picker">
      <p className="dash-hint">
        {hint}
        {subjectName ? ` · ${subjectName}` : ''}
      </p>
      <ul className="atlas-class-grid anim-stagger">
        {classes.map((klass) => (
          <li key={klass.id}>
            <button
              type="button"
              className="atlas-class-card"
              onClick={() => onSelectClass(klass.id)}
            >
              <span className="atlas-class-card__icon" aria-hidden>
                <Icon name="school" size={28} />
              </span>
              <span className="atlas-class-card__label">
                {formatClassLabel(klass.grade, klass.name)}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
