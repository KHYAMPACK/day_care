import { Circle, Path, Svg, Text, View } from '@react-pdf/renderer';
import { formatNum } from './formatReport';
import { chartStyles } from './styles';

const CHART_COLORS = {
  correct: '#16a34a',
  wrong: '#dc2626',
  blank: '#94a3b8',
  bar: '#4f46e5',
  barMuted: '#e2e8f0',
  subject: '#2563eb',
};

function polar(cx, cy, radius, angleDeg) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return {
    x: cx + radius * Math.cos(rad),
    y: cy + radius * Math.sin(rad),
  };
}

function pieSlicePath(cx, cy, radius, startAngle, endAngle) {
  if (endAngle - startAngle >= 360) {
    return null;
  }
  const start = polar(cx, cy, radius, endAngle);
  const end = polar(cx, cy, radius, startAngle);
  const largeArc = endAngle - startAngle > 180 ? 1 : 0;
  return `M ${cx} ${cy} L ${start.x} ${start.y} A ${radius} ${radius} 0 ${largeArc} 0 ${end.x} ${end.y} Z`;
}

/** @param {{ label: string, value: string|number, hint?: string }} props */
export function StatBox({ label, value, hint }) {
  return (
    <View style={chartStyles.statBox}>
      <Text style={chartStyles.statLabel}>{label}</Text>
      <Text style={chartStyles.statValue}>{value}</Text>
      {hint ? <Text style={chartStyles.statHint}>{hint}</Text> : null}
    </View>
  );
}

/** @param {{ items: { label: string, value: number }[], unit?: string, title?: string }} props */
export function HorizontalBarChart({ items, unit = '', title }) {
  const max = Math.max(...items.map((item) => item.value), 1);

  return (
    <View style={chartStyles.chartCard}>
      {title ? <Text style={chartStyles.chartTitle}>{title}</Text> : null}
      {items.map((item) => {
        const widthPct = Math.max(6, (item.value / max) * 100);
        return (
          <View key={item.label} style={chartStyles.barRow}>
            <Text style={chartStyles.barLabel}>{item.label}</Text>
            <View style={chartStyles.barTrack}>
              <View style={[chartStyles.barFill, { width: `${widthPct}%` }]} />
            </View>
            <Text style={chartStyles.barValue}>
              {formatNum(item.value, 1)}
              {unit}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

/** @param {{ segments: { label: string, value: number, color: string }[], title?: string }} props */
export function DonutChart({ segments, title }) {
  const total = segments.reduce((sum, segment) => sum + segment.value, 0) || 1;
  const cx = 42;
  const cy = 42;
  const radius = 34;
  let cursor = 0;
  const slices = segments
    .filter((segment) => segment.value > 0)
    .map((segment) => {
      const angle = (segment.value / total) * 360;
      const start = cursor;
      const end = cursor + angle;
      cursor = end;
      return {
        ...segment,
        path: pieSlicePath(cx, cy, radius, start, end),
        pct: Math.round((segment.value / total) * 100),
      };
    });

  return (
    <View style={chartStyles.chartCard}>
      {title ? <Text style={chartStyles.chartTitle}>{title}</Text> : null}
      <View style={chartStyles.pieLayout}>
        <Svg width={84} height={84} viewBox="0 0 84 84">
          {slices.map((slice) =>
            slice.path ? <Path key={slice.label} d={slice.path} fill={slice.color} /> : null
          )}
          <Circle cx={cx} cy={cy} r={18} fill="#ffffff" />
        </Svg>
        <View style={chartStyles.legend}>
          {slices.map((slice) => (
            <View key={slice.label} style={chartStyles.legendRow}>
              <View style={[chartStyles.legendSwatch, { backgroundColor: slice.color }]} />
              <Text style={chartStyles.legendText}>
                {slice.label}: {formatNum(slice.value, 0)} (%{slice.pct})
              </Text>
            </View>
          ))}
        </View>
      </View>
    </View>
  );
}

/** @param {{ value: number, max?: number }} props */
export function ProgressBar({ value, max = 100 }) {
  const pct = Math.max(0, Math.min(100, (value / max) * 100));
  const tone =
    pct >= 75 ? CHART_COLORS.correct : pct >= 50 ? CHART_COLORS.bar : CHART_COLORS.wrong;

  return (
    <View style={chartStyles.progressTrack}>
      <View style={[chartStyles.progressFill, { width: `${pct}%`, backgroundColor: tone }]} />
    </View>
  );
}

/** @param {{ subjects: { label: string, net: number }[], title?: string }} props */
export function SubjectNetChart({ subjects, title = 'Ders ortalamaları' }) {
  const items = subjects
    .filter((subject) => subject.net != null)
    .map((subject) => ({
      label: subject.label.replace(/^LGS-/i, '').slice(0, 14),
      value: subject.net,
    }));

  return <HorizontalBarChart title={title} items={items} />;
}

export { CHART_COLORS };
