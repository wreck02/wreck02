/**
 * Sortable-table helpers for the Analytics and Review screens: a header cell that
 * sorts on click (keyboard reachable, exposes aria-sort) and a stable row sorter
 * that always sinks NaN / missing values to the bottom whatever the direction.
 */
export type SortDir = 'asc' | 'desc';

export interface SortState<K extends string> {
  key: K;
  dir: SortDir;
}

export function SortTh<K extends string>({ k, label, sort, onSort, num = false, title, className }: {
  k: K;
  label: string;
  sort: SortState<K>;
  onSort: (next: SortState<K>) => void;
  /** numeric column: right-aligned and sorted descending on the first click */
  num?: boolean;
  title?: string;
  className?: string;
}) {
  const active = sort.key === k;
  const next: SortDir = active ? (sort.dir === 'asc' ? 'desc' : 'asc') : num ? 'desc' : 'asc';
  const cls = [num ? 'num' : '', className ?? ''].filter(Boolean).join(' ') || undefined;
  return (
    <th scope="col" className={cls} aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <button type="button" className={`sort-btn${active ? ' active' : ''}`} onClick={() => onSort({ key: k, dir: next })} title={title ?? `Sort by ${label.toLowerCase()}`}>
        {label}
        <span className="dir" aria-hidden="true">{active ? (sort.dir === 'asc' ? '▲' : '▼') : '↕'}</span>
      </button>
    </th>
  );
}

/** Sorted copy of `rows`. Strings compare case-insensitively; NaN and null go last in both directions. */
export function sortRows<T>(rows: readonly T[], dir: SortDir, get: (row: T) => number | string | null | undefined): T[] {
  const sign = dir === 'asc' ? 1 : -1;
  const missing = (v: number | string | null | undefined) => v === null || v === undefined || (typeof v === 'number' && !Number.isFinite(v));
  return rows
    .map((row, i) => ({ row, i, v: get(row) }))
    .sort((a, b) => {
      const am = missing(a.v), bm = missing(b.v);
      if (am || bm) return am === bm ? a.i - b.i : am ? 1 : -1;
      let c: number;
      if (typeof a.v === 'number' && typeof b.v === 'number') c = a.v - b.v;
      else c = String(a.v).localeCompare(String(b.v), 'en', { sensitivity: 'base' });
      return c !== 0 ? sign * c : a.i - b.i;
    })
    .map((x) => x.row);
}
