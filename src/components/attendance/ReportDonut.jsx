import { useEffect, useMemo, useState } from 'react';
import { prefersReducedMotion, useCountUp, useInView } from '../../lib/motion';

const DONUT_COLORS = {
  correct: '#6ec8a0',
  wrong: '#f4a574',
  blank: '#d1d1d6',
};

const REVEAL_DURATION_MS = 900;

export function reportDonutSegments({ correct = 0, wrong = 0, blank = 0 }) {
  return [
    { key: 'correct', label: 'Doğru', value: correct, color: DONUT_COLORS.correct },
    { key: 'wrong', label: 'Yanlış', value: wrong, color: DONUT_COLORS.wrong },
    { key: 'blank', label: 'Boş', value: blank, color: DONUT_COLORS.blank },
  ].filter((segment) => segment.value > 0);
}

export default function ReportDonut({
  segments,
  size = 160,
  stroke = 18,
  centerLabel,
  centerSub,
  centerNumeric,
  className,
  ariaLabel,
  revealDelay = 0,
}) {
  const reduced = prefersReducedMotion();
  const [ref, inView] = useInView({ threshold: 0.35 });
  const [revealed, setRevealed] = useState(reduced);
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const total = segments.reduce((sum, segment) => sum + segment.value, 0);
  const animatedCenter = useCountUp(centerNumeric, revealed && centerNumeric != null, REVEAL_DURATION_MS);

  useEffect(() => {
    if (reduced) {
      setRevealed(true);
      return undefined;
    }

    if (!inView) {
      setRevealed(false);
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      setRevealed(true);
    }, revealDelay);

    return () => window.clearTimeout(timeoutId);
  }, [inView, reduced, revealDelay, segments, total]);

  const arcs = useMemo(() => {
    if (!total) return [];
    let offset = 0;
    return segments.map((segment) => {
      const length = (segment.value / total) * circumference;
      const arc = {
        ...segment,
        dashArray: `${length} ${circumference - length}`,
        dashOffset: -offset,
      };
      offset += length;
      return arc;
    });
  }, [circumference, segments, total]);

  const displayCenterLabel =
    centerNumeric != null ? `%${animatedCenter}` : centerLabel;

  if (!total) {
    return (
      <div
        ref={ref}
        className={['report-donut report-donut--empty', className].filter(Boolean).join(' ')}
        style={{ width: size, height: size }}
        role="img"
        aria-label={ariaLabel ?? 'Henüz soru verisi yok'}
      >
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="#ececee"
            strokeWidth={stroke}
          />
        </svg>
        <div className="report-donut__center">
          {displayCenterLabel ? (
            <span className="report-donut__value">{displayCenterLabel}</span>
          ) : null}
          {centerSub ? <span className="report-donut__sub">{centerSub}</span> : null}
        </div>
      </div>
    );
  }

  return (
    <div
      ref={ref}
      className={['report-donut', className].filter(Boolean).join(' ')}
      style={{ width: size, height: size }}
      role="img"
      aria-label={ariaLabel}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true">
        <g transform={`rotate(-90 ${size / 2} ${size / 2})`}>
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke="#ececee"
            strokeWidth={stroke}
          />
          {arcs.map((arc, index) => (
            <circle
              key={arc.key}
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke={arc.color}
              strokeWidth={stroke}
              strokeDasharray={revealed ? arc.dashArray : `0 ${circumference}`}
              strokeDashoffset={revealed ? arc.dashOffset : 0}
              strokeLinecap="butt"
              className={reduced ? undefined : 'report-donut__arc'}
              style={reduced ? undefined : { transitionDelay: `${index * 110}ms` }}
            />
          ))}
        </g>
      </svg>
      <div className="report-donut__center">
        {displayCenterLabel ? (
          <span className="report-donut__value">{displayCenterLabel}</span>
        ) : null}
        {centerSub ? <span className="report-donut__sub">{centerSub}</span> : null}
      </div>
    </div>
  );
}
