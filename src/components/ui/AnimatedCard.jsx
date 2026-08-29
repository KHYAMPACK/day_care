import { prefersReducedMotion } from '../../lib/motion';

export function AnimatedCard({ index = 0, className, style, children, as: Component = 'div', ...props }) {
  const reduced = prefersReducedMotion();
  return (
    <Component
      className={['anim-card', className].filter(Boolean).join(' ')}
      style={{
        ...style,
        ...(reduced ? null : { '--anim-index': index }),
      }}
      {...props}
    >
      {children}
    </Component>
  );
}
