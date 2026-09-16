/**
 * Weakness heatmap: topic × level grid coloured by strength score
 * (accuracy discounted when the median time is over the 89 s pace).
 * Only topics that have at least one template are listed.
 */
import { Fragment, useMemo } from 'react';
import { heatmap, formatSec, type HeatCell } from '../../core/analytics';
import type { Attempt } from '../../core/session';
import { LEVELS, type Level, type Module } from '../../core/template';
import { TOPICS, topicName } from '../../core/topics';
import { templatesFor } from '../../core/registry';

const TOPICS_WITH_TEMPLATES = new Set(TOPICS.filter((t) => templatesFor({ topics: [t.key] }).length > 0).map((t) => t.key));

/** red (0) → amber (0.5) → green (1), as a translucent tint that reads on light and dark surfaces. */
export function scoreColour(score: number): string {
  const s = Math.max(0, Math.min(1, score));
  const hue = s < 0.5 ? (s / 0.5) * 42 : 42 + ((s - 0.5) / 0.5) * 98;
  return `hsla(${Math.round(hue)}, 70%, 45%, 0.55)`;
}

export interface HeatmapProps {
  attempts: Attempt[];
  module: Module | 'ALL';
  onCell?: (topic: string, level: Level) => void;
}

export function Heatmap({ attempts, module, onCell }: HeatmapProps) {
  const { rows, byKey } = useMemo(() => {
    const { topics, cells } = heatmap(attempts, module);
    return {
      rows: topics.filter((t) => TOPICS_WITH_TEMPLATES.has(t)),
      byKey: new Map(cells.map((c) => [`${c.topic}:${c.level}`, c])),
    };
  }, [attempts, module]);

  if (rows.length === 0) return <p className="muted small">No templates in this module yet.</p>;

  return (
    <div>
      <div className="heatmap" style={{ gridTemplateColumns: 'minmax(110px, 1.8fr) repeat(5, minmax(40px, 1fr))' }}>
        <div className="collabel" aria-hidden="true" />
        {LEVELS.map((l) => <div key={l} className="collabel">L{l}</div>)}
        {rows.map((topic) => (
          <Fragment key={topic}>
            <div className="rowlabel small" title={topicName(topic)}>{topicName(topic)}</div>
            {LEVELS.map((level) => <Cell key={level} cell={byKey.get(`${topic}:${level}`)!} onCell={onCell} />)}
          </Fragment>
        ))}
      </div>
      <div className="heatmap-legend">
        <span>weak</span>
        <span className="bar" style={{ background: `linear-gradient(90deg, ${scoreColour(0)}, ${scoreColour(0.5)}, ${scoreColour(1)})` }} />
        <span>strong</span>
        <span>· accuracy, discounted when the median time is over 89 s{onCell ? '; click a cell to drill it' : ''}</span>
      </div>
    </div>
  );
}

function Cell({ cell, onCell }: { cell: HeatCell; onCell?: (topic: string, level: Level) => void }) {
  const name = topicName(cell.topic);
  const empty = cell.n === 0;
  const label = empty ? '·' : `${Math.round(cell.accuracy * 100)}%`;
  const title = empty
    ? `${name}, level ${cell.level}: no attempts yet`
    : `${name}, level ${cell.level}: ${label} correct of ${cell.n}, median ${formatSec(cell.medianMs)}`;
  const className = `cell${empty ? ' empty' : ''}`;
  const style = empty ? undefined : { background: scoreColour(cell.score) };
  if (!onCell) return <div className={className} style={style} title={title}>{label}</div>;
  return (
    <button type="button" className={className} style={style} title={`${title}. Drill this.`} aria-label={`${title}. Drill this.`} onClick={() => onCell(cell.topic, cell.level)}>
      {label}
    </button>
  );
}

export default Heatmap;
