import { useEffect, useState } from 'react';
import { prefersReducedMotion } from '../../lib/motion';

export default function AnimatedBarFill({
  pct,
  variant,
  delay = 0,
  className = 'week-report__bar-fill',
  when = true,
}) {
  const reduced = prefersReducedMotion();
  const [active, setActive] = useState(reduced);

  useEffect(() => {
    if (reduced) {
      setActive(true);
      return undefined;
    }

    if (!when) {
      setActive(false);
      return undefined;
    }

    setActive(false);
    const timeoutId = window.setTimeout(() => {
      setActive(true);
    }, delay);

    return () => window.clearTimeout(timeoutId);
  }, [delay, pct, reduced, when]);

  return (
    <span
      className={[
        className,
        variant ? `${className}--${variant}` : null,
        reduced ? null : `${className}--animate`,
      ]
        .filter(Boolean)
        .join(' ')}
      style={{ width: active ? `${pct}%` : '0%' }}
    />
  );
}
