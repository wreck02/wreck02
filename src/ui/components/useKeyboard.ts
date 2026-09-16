import { useEffect, useRef } from 'react';

function isEditable(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || el.isContentEditable;
}

/**
 * Global keydown listener for keyboard-first screens. Keys typed into an input,
 * textarea or select are never intercepted (the input handles its own Enter),
 * nor are shortcuts with a modifier held. The handler always sees the latest
 * closure, so callers do not need to memoise it.
 */
export function useKeyboard(handler: (e: KeyboardEvent) => void, enabled = true): void {
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.altKey) return;
      if (isEditable(e.target)) return;
      ref.current(e);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [enabled]);
}

/** Map a key press (A–H or 1–8) to an option letter, or null. */
export function optionKeyFor(key: string, optionCount: number): string | null {
  if (key.length !== 1) return null;
  let idx = -1;
  if (/[a-hA-H]/.test(key)) idx = key.toUpperCase().charCodeAt(0) - 65;
  else if (/[1-8]/.test(key)) idx = Number(key) - 1;
  if (idx < 0 || idx >= optionCount) return null;
  return String.fromCharCode(65 + idx);
}
