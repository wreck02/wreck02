import { useCallback, useEffect, useState } from 'react';
import { StoreProvider } from './store';
import { HOME, type Route } from './routes';
import { Home } from './screens/Home';
import { Setup } from './screens/Setup';
import { Runner } from './screens/Runner';
import { Report } from './screens/Report';
import { Analytics } from './screens/Analytics';
import { Review } from './screens/Review';
import { Facts } from './screens/Facts';
import { Settings } from './screens/Settings';
import { Help } from './screens/Help';

export interface Nav {
  route: Route;
  go: (r: Route) => void;
  home: () => void;
}

const NAV_ITEMS: { name: Route['name']; label: string }[] = [
  { name: 'home', label: 'Home' },
  { name: 'analytics', label: 'Analytics' },
  { name: 'review', label: 'Review' },
  { name: 'facts', label: 'Facts' },
  { name: 'settings', label: 'Settings' },
  { name: 'help', label: 'Help' },
];

export function App() {
  const [route, setRoute] = useState<Route>(HOME);
  const go = useCallback((r: Route) => {
    setRoute(r);
    window.scrollTo({ top: 0 });
  }, []);
  const nav: Nav = { route, go, home: () => go(HOME) };

  // Warn before leaving mid-session (closing the tab loses the run).
  useEffect(() => {
    if (route.name !== 'run') return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener('beforeunload', h);
    return () => window.removeEventListener('beforeunload', h);
  }, [route.name]);

  const inRun = route.name === 'run';

  return (
    <StoreProvider>
      <div className="app">
        <header className="topbar">
          <button className="brand" onClick={nav.home} title="Home">ESAT Mental Maths</button>
          {!inRun && (
            <nav>
              {NAV_ITEMS.map((item) => (
                <button key={item.name} className={route.name === item.name ? 'active' : ''} onClick={() => go({ name: item.name } as Route)}>
                  {item.label}
                </button>
              ))}
            </nav>
          )}
        </header>
        <Screen nav={nav} />
      </div>
    </StoreProvider>
  );
}

function Screen({ nav }: { nav: Nav }) {
  const r = nav.route;
  switch (r.name) {
    case 'home': return <Home nav={nav} />;
    case 'setup': return <Setup nav={nav} mode={r.mode} prefill={r.prefill} />;
    case 'run': return <Runner key={r.config.seed + r.config.mode} nav={nav} config={r.config} />;
    case 'report': return <Report nav={nav} sessionId={r.sessionId} />;
    case 'analytics': return <Analytics nav={nav} />;
    case 'review': return <Review nav={nav} />;
    case 'facts': return <Facts nav={nav} />;
    case 'settings': return <Settings nav={nav} />;
    case 'help': return <Help nav={nav} />;
  }
}

export default App;
