import type { Nav } from '../App';
import type { Mode } from '../../core/session';

export function Setup(_props: { nav: Nav; mode: Mode }) {
  return (
    <main className="page">
      <div className="card">
        <h1>Setup</h1>
        <p className="muted">This screen is not built yet.</p>
      </div>
    </main>
  );
}

export default Setup;
