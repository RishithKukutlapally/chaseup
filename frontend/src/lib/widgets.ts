import type { Status } from '../types';

export type Cell =
  | { kind: 'num'; text: string }
  | { kind: 'status'; status: Exclude<Status, null>; text: string }
  | { kind: 'code'; text: string }
  | { kind: 'text'; text: string };

/** Table cells: "n:12" numeric, "good:Text" chip, case refs/times monospace, else text. */
export function parseCell(raw: string | number): Cell {
  if (typeof raw === 'number') return { kind: 'num', text: raw.toLocaleString('en-GB') };
  if (raw.startsWith('n:')) return { kind: 'num', text: raw.slice(2) };
  const st = parseStatus(raw);
  if (st) return { kind: 'status', status: st.status, text: st.text };
  if (/^NCZ-|^TEST-|^\d\d:\d\d$/.test(raw)) return { kind: 'code', text: raw };
  return { kind: 'text', text: raw };
}

export function parseStatus(spec: string | null | undefined): { status: 'good' | 'warn' | 'bad'; text: string } | null {
  if (!spec) return null;
  const m = /^(good|warn|bad):(.*)$/s.exec(spec);
  return m ? { status: m[1] as 'good' | 'warn' | 'bad', text: m[2] } : null;
}

export function isNumericColumn(rows: (string | number)[][], col: number): boolean {
  const first = rows[0]?.[col];
  return typeof first === 'number' || (typeof first === 'string' && first.startsWith('n:'));
}

/** Round an axis maximum up to a friendly step. */
export function niceMax(max: number): number {
  if (max <= 0) return 1;
  const pow = 10 ** Math.floor(Math.log10(max));
  const step = pow / 2;
  return Math.ceil(max / step) * step;
}

export function pct(value: number, max: number): number {
  if (max <= 0) return 0;
  return Math.max(0, Math.min(100, (value / max) * 100));
}
