import { useRef, useState } from 'react';
import type { Nav } from '../App';
import { useStore } from '../store';
import { NumberField } from '../components/NumberField';
import type { AnswerMode } from '../../core/session';
import { LEVELS, type Level } from '../../core/template';
import type { Settings as SettingsType } from '../../core/storage';

const THEMES: { value: SettingsType['theme']; label: string }[] = [
  { value: 'system', label: 'System' },
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
];

export function Settings({ nav }: { nav: Nav }) {
  const { settings, updateSettings, resetEverything, exportJson, importJson } = useStore();
  const fileRef = useRef<HTMLInputElement>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [armed, setArmed] = useState(false);

  const exportData = () => {
    const blob = new Blob([exportJson()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `esat-mental-maths-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const importFile = async (file: File | undefined) => {
    if (!file) return;
    try {
      importJson(await file.text());
      setMessage({ ok: true, text: `Imported ${file.name}.` });
    } catch (e) {
      setMessage({ ok: false, text: `Could not import ${file.name}: ${e instanceof Error ? e.message : 'not valid JSON'}.` });
    }
    if (fileRef.current) fileRef.current.value = '';
  };

  const reset = () => {
    if (!armed) { setArmed(true); return; }
    if (window.confirm('Delete every session, attempt, review entry and setting from this browser? This cannot be undone.')) {
      resetEverything();
      setMessage({ ok: true, text: 'Everything has been reset.' });
    }
    setArmed(false);
  };

  return (
    <main className="page">
      <div className="row between">
        <h1>Settings</h1>
        <button type="button" className="btn ghost sm" onClick={nav.home}>Home</button>
      </div>

      <div className="card stack">
        <h2>Practice</h2>
        <div className="field">
          <span className="label">Default level</span>
          <div className="seg" role="group" aria-label="Default level">
            {([...LEVELS, 'mixed'] as (Level | 'mixed')[]).map((l) => (
              <button key={l} type="button" className={settings.defaultLevel === l ? 'active' : ''} aria-pressed={settings.defaultLevel === l} onClick={() => updateSettings({ defaultLevel: l })}>
                {l === 'mixed' ? 'Mixed' : l}
              </button>
            ))}
          </div>
        </div>
        <div className="field">
          <span className="label">Default answer mode</span>
          <div className="seg" role="group" aria-label="Default answer mode">
            {(['typed', 'mc'] as AnswerMode[]).map((am) => (
              <button key={am} type="button" className={settings.answerMode === am ? 'active' : ''} aria-pressed={settings.answerMode === am} onClick={() => updateSettings({ answerMode: am })}>
                {am === 'typed' ? 'Typed' : 'Multiple choice'}
              </button>
            ))}
          </div>
          <span className="hint">Simulations are always multiple choice.</span>
        </div>
        <div className="field">
          <label htmlFor="drill-seconds">Drill seconds per question</label>
          <div className="row">
            <NumberField id="drill-seconds" value={settings.drillSecondsPerQuestion} min={30} max={180} onCommit={(n) => updateSettings({ drillSecondsPerQuestion: n })} />
            <span className="small muted">30–180 s, used when a drill is timed. The exam pace is 89 s.</span>
          </div>
        </div>
        <label className="toggle">
          <input type="checkbox" checked={settings.showTimer} onChange={(e) => updateSettings({ showTimer: e.target.checked })} />
          <span>Show the timer while answering</span>
        </label>
        <label className="toggle">
          <input type="checkbox" checked={settings.soundOn} onChange={(e) => updateSettings({ soundOn: e.target.checked })} />
          <span>Sound <span className="small muted">(stored only; the app is silent for now)</span></span>
        </label>
      </div>

      <div className="card stack">
        <h2>Appearance</h2>
        <div className="field">
          <span className="label">Theme</span>
          <div className="seg" role="group" aria-label="Theme">
            {THEMES.map((t) => (
              <button key={t.value} type="button" className={settings.theme === t.value ? 'active' : ''} aria-pressed={settings.theme === t.value} onClick={() => updateSettings({ theme: t.value })}>
                {t.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="card stack">
        <h2>Data</h2>
        <p className="muted small">Everything stays in this browser's localStorage: settings, attempts, sessions, the error ledger and gauntlet records. Nothing leaves the device. Export a copy before clearing the browser or moving to another one.</p>
        <div className="row">
          <button type="button" className="btn" onClick={exportData}>Export data (JSON)</button>
          <button type="button" className="btn" onClick={() => fileRef.current?.click()}>Import data</button>
          <input ref={fileRef} type="file" accept="application/json,.json" style={{ display: 'none' }} onChange={(e) => void importFile(e.target.files?.[0])} />
        </div>
        <p className="muted small">Importing replaces the stored data with the file's contents.</p>
        <div className="row">
          <button type="button" className="btn danger" onClick={reset}>{armed ? 'Yes, delete everything' : 'Reset everything'}</button>
          {armed && <button type="button" className="btn ghost" onClick={() => setArmed(false)}>Cancel</button>}
          {armed && <span className="small bad">Deletes every session, attempt and setting.</span>}
        </div>
        {message && <p className={`small ${message.ok ? 'ok' : 'bad'}`} role="status">{message.text}</p>}
      </div>
    </main>
  );
}

export default Settings;
