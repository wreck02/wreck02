import type { Nav } from '../App';
import type { SessionConfig } from '../../core/session';

export function Runner(_props: { nav: Nav; config: SessionConfig }) {
  return (
    <main className="page">
      <div className="card">
        <h1>Runner</h1>
        <p className="muted">This screen is not built yet.</p>
      </div>
    </main>
  );
}

export default Runner;
