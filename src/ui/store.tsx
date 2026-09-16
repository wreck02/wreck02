import type React from 'react';
/**
 * App-wide state: settings, attempt log, session summaries, error ledger and
 * gauntlet records, all mirrored to localStorage. Screens read from `useStore()`.
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { appendAttempts, appendSession, clearAll, importAll, loadAttempts, loadSessions, loadSettings, saveSettings, exportAll, type Settings } from '../core/storage';
import { recordAttempts, loadLedger, saveLedger, clearLedgerEntry, type Ledger } from '../core/srs';
import { loadGauntletRecords, updateGauntletRecord, type GauntletRecords, type GauntletState } from '../core/gauntlet';
import { summarise, type Attempt, type SessionConfig, type SessionSummary } from '../core/session';
import type { Level } from '../core/template';

export interface Store {
  settings: Settings;
  attempts: Attempt[];
  sessions: SessionSummary[];
  ledger: Ledger;
  gauntletRecords: GauntletRecords;
  updateSettings: (patch: Partial<Settings>) => void;
  /** Persist a finished session: attempts, summary, ledger (and gauntlet record if given). Returns the summary. */
  finishSession: (config: SessionConfig, sessionId: string, startedAt: number, attempts: Attempt[], extra?: { peakLevel?: Level; gauntlet?: { topicKey: string; state: GauntletState } }) => SessionSummary;
  forgetLedgerEntry: (templateId: string) => void;
  resetEverything: () => void;
  exportJson: () => string;
  importJson: (json: string) => void;
}

const StoreContext = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<Settings>(() => loadSettings());
  const [attempts, setAttempts] = useState<Attempt[]>(() => loadAttempts());
  const [sessions, setSessions] = useState<SessionSummary[]>(() => loadSessions());
  const [ledger, setLedger] = useState<Ledger>(() => loadLedger());
  const [gauntletRecords, setGauntletRecords] = useState<GauntletRecords>(() => loadGauntletRecords());

  // theme
  useEffect(() => {
    const root = document.documentElement;
    const apply = () => {
      const dark = settings.theme === 'dark' || (settings.theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
      root.dataset.theme = dark ? 'dark' : 'light';
    };
    apply();
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    mq.addEventListener('change', apply);
    return () => mq.removeEventListener('change', apply);
  }, [settings.theme]);

  const updateSettings = useCallback((patch: Partial<Settings>) => {
    setSettings((s) => {
      const next = { ...s, ...patch };
      saveSettings(next);
      return next;
    });
  }, []);

  const finishSession = useCallback<Store['finishSession']>((config, sessionId, startedAt, newAttempts, extra) => {
    const finishedAt = Date.now();
    const summary = summarise(config, sessionId, startedAt, finishedAt, newAttempts, extra?.peakLevel);
    setAttempts(appendAttempts(newAttempts));
    setSessions(appendSession(summary));
    setLedger((l) => {
      const next = recordAttempts({ ...l }, newAttempts, finishedAt);
      saveLedger(next);
      return next;
    });
    if (extra?.gauntlet) {
      setGauntletRecords((r) => ({ ...updateGauntletRecord({ ...r }, extra.gauntlet!.topicKey, extra.gauntlet!.state, finishedAt) }));
    }
    return summary;
  }, []);

  const forgetLedgerEntry = useCallback((templateId: string) => {
    setLedger((l) => {
      const next = clearLedgerEntry({ ...l }, templateId);
      saveLedger(next);
      return next;
    });
  }, []);

  const resetEverything = useCallback(() => {
    clearAll();
    setSettings(loadSettings());
    setAttempts([]);
    setSessions([]);
    setLedger({});
    setGauntletRecords({});
  }, []);

  const exportJson = useCallback(() => JSON.stringify(exportAll(), null, 2), []);
  const importJson = useCallback((json: string) => {
    importAll(JSON.parse(json) as Record<string, unknown>);
    setSettings(loadSettings());
    setAttempts(loadAttempts());
    setSessions(loadSessions());
    setLedger(loadLedger());
    setGauntletRecords(loadGauntletRecords());
  }, []);

  const value = useMemo<Store>(() => ({ settings, attempts, sessions, ledger, gauntletRecords, updateSettings, finishSession, forgetLedgerEntry, resetEverything, exportJson, importJson }),
    [settings, attempts, sessions, ledger, gauntletRecords, updateSettings, finishSession, forgetLedgerEntry, resetEverything, exportJson, importJson]);

  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}

export function useStore(): Store {
  const s = useContext(StoreContext);
  if (!s) throw new Error('useStore outside StoreProvider');
  return s;
}
