import { useLayoutEffect, useRef, useState } from 'react';
import { MOTION_VIEW_MS, prefersReducedMotion } from '../../lib/motion';

export function AnimatedView({ viewKey, children, className, enterOnMount = true }) {
  const reduced = prefersReducedMotion();
  const keyRef = useRef(viewKey);
  const nodeRef = useRef(children);
  const [stack, setStack] = useState([
    {
      key: viewKey,
      node: children,
      phase: enterOnMount && !reduced ? 'in' : 'ready',
    },
  ]);

  if (keyRef.current === viewKey) {
    nodeRef.current = children;
  }

  useLayoutEffect(() => {
    if (keyRef.current === viewKey) return undefined;

    const previous = { key: keyRef.current, node: nodeRef.current };
    keyRef.current = viewKey;
    nodeRef.current = children;

    if (reduced) {
      setStack([{ key: viewKey, node: children, phase: 'ready' }]);
      return undefined;
    }

    setStack([
      { ...previous, phase: 'out' },
      { key: viewKey, node: children, phase: 'in' },
    ]);

    const timeoutId = window.setTimeout(() => {
      setStack((current) => current.filter((layer) => layer.phase !== 'out'));
    }, MOTION_VIEW_MS);

    return () => window.clearTimeout(timeoutId);
  }, [viewKey, children, reduced]);

  const layers = stack.map((layer) =>
    layer.key === viewKey && layer.phase !== 'out' ? { ...layer, node: children } : layer
  );

  return (
    <div className={['anim-view-stack', className].filter(Boolean).join(' ')}>
      {layers.map((layer) => (
        <div
          key={layer.key}
          className={`anim-view anim-view--${layer.phase}`}
          aria-hidden={layer.phase === 'out' ? true : undefined}
        >
          {layer.node}
        </div>
      ))}
    </div>
  );
}
