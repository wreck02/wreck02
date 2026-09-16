/**
 * Time-per-question histogram (inline SVG). Bars past the pace line are drawn in
 * the "bad" colour; every bar carries a hover title, and a table twin sits below.
 */
export interface HistogramBucket {
  fromSec: number;
  toSec: number;
  count: number;
}

/** Smallest of 1, 2, 4, 6, 8, 10, 20, 40 … that is >= n (so the half tick is a whole number). */
function niceMax(n: number): number {
  if (n <= 1) return 1;
  let scale = 1;
  for (;;) {
    for (const m of [2, 4, 6, 8, 10]) if (m * scale >= n) return m * scale;
    scale *= 10;
  }
}

function bucketLabel(b: HistogramBucket): string {
  return Number.isFinite(b.toSec) ? `${b.fromSec}–${b.toSec} s` : `over ${b.fromSec} s`;
}

export function Histogram({ buckets, paceSec, title = 'Time per question' }: { buckets: HistogramBucket[]; paceSec: number; title?: string }) {
  const W = 560, H = 170;
  const left = 30, right = 10, top = 20, bottom = 24;
  const plotW = W - left - right, plotH = H - top - bottom;
  const nb = Math.max(1, buckets.length);
  const slot = plotW / nb;
  const barW = Math.min(24, slot - 4);
  const total = buckets.reduce((s, b) => s + b.count, 0);
  const yMax = niceMax(Math.max(...buckets.map((b) => b.count), 1));
  const yOf = (c: number) => top + plotH - (c / yMax) * plotH;
  const bucketSec = buckets.length > 1 ? buckets[1].fromSec - buckets[0].fromSec : paceSec;
  const paceX = left + Math.min(nb, paceSec / bucketSec) * slot;
  const r = 4;
  const ticks = yMax >= 2 ? [yMax / 2, yMax] : [yMax];

  return (
    <div>
      <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${title}: ${total} question${total === 1 ? '' : 's'} in ${bucketSec} second buckets`}>
        <title>{title}</title>
        {ticks.map((t) => (
          <g key={t}>
            <line className="grid" x1={left} x2={W - right} y1={yOf(t)} y2={yOf(t)} />
            <text x={left - 6} y={yOf(t) + 4} textAnchor="end">{t}</text>
          </g>
        ))}
        <line className="axis" x1={left} x2={W - right} y1={top + plotH} y2={top + plotH} />
        {buckets.map((b, i) => {
          const x0 = left + i * slot + (slot - barW) / 2;
          const yTop = yOf(b.count);
          const h = top + plotH - yTop;
          const over = b.fromSec >= paceSec;
          const rr = Math.min(r, h);
          const path = h <= 0 ? '' : `M${x0},${top + plotH} V${yTop + rr} Q${x0},${yTop} ${x0 + rr},${yTop} H${x0 + barW - rr} Q${x0 + barW},${yTop} ${x0 + barW},${yTop + rr} V${top + plotH} Z`;
          const share = total ? Math.round((100 * b.count) / total) : 0;
          return (
            <g key={b.fromSec}>
              <title>{`${bucketLabel(b)}: ${b.count} question${b.count === 1 ? '' : 's'} (${share}%)`}</title>
              <rect x={left + i * slot} y={top} width={slot} height={plotH} fill="transparent" />
              {path && <path d={path} fill={over ? 'var(--bad)' : 'var(--accent)'} opacity={0.85} />}
              {i % 2 === 0 && (
                <text x={left + i * slot} y={H - 8} textAnchor="middle">{Number.isFinite(b.toSec) ? b.fromSec : `${b.fromSec}+`}</text>
              )}
            </g>
          );
        })}
        <line x1={paceX} x2={paceX} y1={top - 4} y2={top + plotH} stroke="var(--text)" strokeWidth={1.5} opacity={0.6} />
        <text x={paceX + 5} y={top + 4} className="strong">{paceSec} s pace</text>
      </svg>
      <details className="small chart-table">
        <summary className="muted">Show as a table</summary>
        <div className="table-wrap">
          <table className="table">
            <thead><tr><th>Time</th><th className="num">Questions</th><th className="num">Share</th></tr></thead>
            <tbody>
              {buckets.map((b) => (
                <tr key={b.fromSec}>
                  <td>{bucketLabel(b)}</td>
                  <td className="num">{b.count}</td>
                  <td className="num">{total ? `${Math.round((100 * b.count) / total)}%` : '–'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  );
}

export default Histogram;
