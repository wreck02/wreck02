/**
 * Tiny inline-SVG line for a single series (e.g. accuracy per session).
 * Theme colours come from CSS variables so it follows light/dark mode.
 */
export function Sparkline({ values, min = 0, max = 1, width = 84, height = 24, label }: {
  values: number[];
  min?: number;
  max?: number;
  width?: number;
  height?: number;
  /** accessible name; also the hover title */
  label?: string;
}) {
  const pts = values.filter((v) => Number.isFinite(v));
  if (pts.length === 0) return <span className="muted tiny">–</span>;
  const pad = 4;
  const span = max - min || 1;
  const x = (i: number) => (pts.length === 1 ? width / 2 : pad + (i / (pts.length - 1)) * (width - 2 * pad));
  const y = (v: number) => height - pad - ((Math.min(max, Math.max(min, v)) - min) / span) * (height - 2 * pad);
  const d = pts.map((v, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ');
  const last = pts.length - 1;
  return (
    <svg className="spark" width={width} height={height} viewBox={`0 0 ${width} ${height}`} role="img" aria-label={label}>
      {label && <title>{label}</title>}
      {pts.length > 1 && <path d={d} fill="none" stroke="var(--accent)" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />}
      <circle cx={x(last)} cy={y(pts[last])} r={3.5} fill="var(--accent)" stroke="var(--surface)" strokeWidth={1.5} />
    </svg>
  );
}

export default Sparkline;
