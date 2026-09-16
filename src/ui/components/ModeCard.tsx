import type { ReactNode } from 'react';

export function ModeCard({ title, description, meta, cta = 'Start', onStart }: {
  title: string;
  description: string;
  /** e.g. a pill shown next to the title */
  meta?: ReactNode;
  cta?: string;
  onStart: () => void;
}) {
  return (
    <div className="card mode-card">
      <div className="row between">
        <h3>{title}</h3>
        {meta}
      </div>
      <p className="muted small">{description}</p>
      <div className="row">
        <button type="button" className="btn primary" onClick={onStart}>{cta}</button>
      </div>
    </div>
  );
}

export default ModeCard;
