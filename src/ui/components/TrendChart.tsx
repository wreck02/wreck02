/**
 * One series over sessions as an inline-SVG line with markers (hover titles carry
 * the date and value). One y axis only; a second measure gets its own chart.
 */
export interface TrendPoint {
  value: number;
  /** hover text, e.g. "16 Sep 14:03 · 80% of 10" */
  title: string;
  /** short x label, used for the first and last point */
  xLabel: string;
}

export function TrendChart({ points, yMax, ticks, format, refLine, label, height = 170 }: {
  points: TrendPoint[];
  yMax: number;
  ticks: number[];
  format: (v: number) => string;
  /** horizontal reference such as the 89 s pace */
  refLine?: { value: number; label: string };
  /** accessible name */
  label: string;
  height?: number;
}) {
  const W = 560, H = height;
  const left = 46, right = 14, top = 14, bottom = 24;
  const plotW = W - left - right, plotH = H - top - bottom;
  const n = points.length;
  const x = (i: number) => (n <= 1 ? left + plotW / 2 : left + (i / (n - 1)) * plotW);
  const y = (v: number) => top + plotH - (Math.min(yMax, Math.max(0, v)) / Math.max(yMax, 1e-9)) * plotH;
  const d = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(' ');
  const showMarkers = n <= 40;
  const last = n - 1;

  return (
    <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label}>
      <title>{label}</title>
      {ticks.map((t) => (
        <g key={t}>
          <line className="grid" x1={left} x2={W - right} y1={y(t)} y2={y(t)} />
          <text x={left - 6} y={y(t) + 4} textAnchor="end">{format(t)}</text>
        </g>
      ))}
      <line className="axis" x1={left} x2={W - right} y1={top + plotH} y2={top + plotH} />
      {refLine && refLine.value <= yMax && (
        <g>
          <line x1={left} x2={W - right} y1={y(refLine.value)} y2={y(refLine.value)} stroke="var(--bad)" strokeWidth={1.5} opacity={0.6} />
          <text x={W - right} y={y(refLine.value) - 4} textAnchor="end" className="strong">{refLine.label}</text>
        </g>
      )}
      {n > 1 && <path d={d} fill="none" stroke="var(--accent)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />}
      {points.map((p, i) => (
        <g key={i}>
          <title>{p.title}</title>
          <circle cx={x(i)} cy={y(p.value)} r={12} fill="transparent" />
          {(showMarkers || i === last) && <circle cx={x(i)} cy={y(p.value)} r={4} fill="var(--accent)" stroke="var(--surface)" strokeWidth={2} />}
        </g>
      ))}
      {n === 1 && <text x={x(0)} y={H - 6} textAnchor="middle">{points[0].xLabel}</text>}
      {n > 1 && (
        <>
          <text x={left} y={H - 6} textAnchor="start">{points[0].xLabel}</text>
          <text x={W - right} y={H - 6} textAnchor="end">{points[last].xLabel}</text>
        </>
      )}
      {n > 1 && <text x={left + plotW / 2} y={H - 6} textAnchor="middle">{n} sessions</text>}
    </svg>
  );
}

export default TrendChart;
