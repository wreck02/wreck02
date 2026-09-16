import { useNow } from './useTicker';

/**
 * Time-versus-progress bar for sessions with a time limit. The fill is the
 * fraction of time used; the mark is the fraction of questions done. The fill
 * turns red once time is running ahead of progress.
 */
export function PaceBar({ startedAt, limitSec, done, total }: { startedAt: number; limitSec: number; done: number; total: number }) {
  const now = useNow(1000);
  const timeFrac = Math.min(1, Math.max(0, (now - startedAt) / 1000 / limitSec));
  const progFrac = total > 0 ? Math.min(1, done / total) : 0;
  const behind = timeFrac > progFrac + 0.01;
  return (
    <div className="pace-wrap">
      <div className="pace" role="progressbar" aria-label="Pace" aria-valuenow={Math.round(timeFrac * 100)} aria-valuemin={0} aria-valuemax={100}
        title={`${Math.round(timeFrac * 100)}% of the time used, ${Math.round(progFrac * 100)}% of the questions done`}>
        <div className={`fill ${behind ? 'behind' : ''}`} style={{ width: `${timeFrac * 100}%` }} />
        <div className="mark" style={{ left: `calc(${progFrac * 100}% - 1px)` }} />
      </div>
      <div className="pace-meta">
        <span>{behind ? 'behind pace' : 'on pace'}</span>
        <span>{done} / {total} done</span>
      </div>
    </div>
  );
}
