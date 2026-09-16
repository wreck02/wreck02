import { PACE_SECONDS } from '../../core/session';
import { formatSec } from '../../core/analytics';

/** Horizontal time bar with the 89 s pace line; bars past it are red. */
export function TimeBar({ ms, maxMs }: { ms: number; maxMs: number }) {
  const scale = Math.max(maxMs, PACE_SECONDS * 1000 * 1.25, 1);
  const w = Math.min(100, (ms / scale) * 100);
  const paceLeft = (PACE_SECONDS * 1000 / scale) * 100;
  const over = ms > PACE_SECONDS * 1000;
  return (
    <div className="tbar" title={`${formatSec(ms)} (pace ${PACE_SECONDS} s)`} aria-label={`${formatSec(ms)}${over ? ', over pace' : ''}`}>
      <div className={`fill ${over ? 'bad' : ''}`} style={{ width: `${w}%` }} />
      <div className="pace-line" style={{ left: `${paceLeft}%` }} />
    </div>
  );
}
