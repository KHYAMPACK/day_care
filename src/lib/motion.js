import { useEffect, useRef, useState } from 'react';

export const MOTION_VIEW_MS = 220;
export const MOTION_OVERLAY_MS = 200;

export function prefersReducedMotion() {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return false;
  }
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function usePresence(open, durationMs = MOTION_OVERLAY_MS) {
  const [mounted, setMounted] = useState(open);

  useEffect(() => {
    if (open) {
      setMounted(true);
      return undefined;
    }

    if (!mounted) return undefined;

    if (prefersReducedMotion()) {
      setMounted(false);
      return undefined;
    }

    const timeoutId = window.setTimeout(() => setMounted(false), durationMs);
    return () => window.clearTimeout(timeoutId);
  }, [open, durationMs, mounted]);

  return mounted;
}

export function useCountUp(target, active = true, duration = 900) {
  const reduced = prefersReducedMotion();
  const [value, setValue] = useState(reduced ? target : 0);

  useEffect(() => {
    if (target == null) return undefined;
    if (!active || reduced) {
      setValue(target);
      return undefined;
    }

    setValue(0);
    let start = null;
    let frameId = 0;

    const step = (timestamp) => {
      if (start == null) start = timestamp;
      const progress = Math.min((timestamp - start) / duration, 1);
      const eased = 1 - (1 - progress) ** 3;
      setValue(Math.round(eased * target));
      if (progress < 1) {
        frameId = window.requestAnimationFrame(step);
      }
    };

    frameId = window.requestAnimationFrame(step);
    return () => window.cancelAnimationFrame(frameId);
  }, [active, duration, reduced, target]);

  return value;
}

export function useInView({
  root = null,
  rootMargin = '0px 0px -6% 0px',
  threshold = 0.25,
  once = true,
} = {}) {
  const ref = useRef(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return undefined;

    if (prefersReducedMotion()) {
      setInView(true);
      return undefined;
    }

    if (typeof IntersectionObserver === 'undefined') {
      setInView(true);
      return undefined;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          if (once) observer.disconnect();
        } else if (!once) {
          setInView(false);
        }
      },
      { root, rootMargin, threshold }
    );

    observer.observe(node);
    return () => observer.disconnect();
  }, [once, root, rootMargin, threshold]);

  return [ref, inView];
}
