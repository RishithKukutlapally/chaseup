/** USD with enough precision to show fractions of a cent (LLM calls are cheap). */
export function formatUsd(value: number | null | undefined): string {
  const v = Number(value ?? 0);
  if (v === 0) return '$0.00';
  const abs = Math.abs(v);
  const digits = abs >= 1 ? 2 : abs >= 0.01 ? 4 : 6;
  return `$${v.toFixed(digits)}`;
}

export function formatInr(value: number | null | undefined): string {
  const v = Number(value ?? 0);
  if (v === 0) return '₹0.00';
  const digits = Math.abs(v) >= 1 ? 2 : 4;
  return `₹${v.toFixed(digits)}`;
}

export function usdToInr(usd: number, fx: number): number {
  return Math.round(usd * fx * 10000) / 10000;
}

export function formatTokens(n: number | null | undefined): string {
  const v = Number(n ?? 0);
  return v >= 1000 ? `${(v / 1000).toFixed(1)}k` : String(v);
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

export function shortHash(h: string | null | undefined, n = 10): string {
  if (!h) return '—';
  return h.length > n ? `${h.slice(0, n)}…` : h;
}

/** Percentage of budget used, clamped 0..100 (cap 0 means fully used). */
export function budgetPct(spent: number, cap: number | null | undefined): number {
  if (cap === null || cap === undefined) return 0;
  if (cap <= 0) return 100;
  return Math.max(0, Math.min(100, (spent / cap) * 100));
}
