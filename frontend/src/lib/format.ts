export function daysLabel(days: number): string {
  const d = Math.round(days);
  if (d <= 0) return 'Today';
  return d === 1 ? '1 day' : `${d} days`;
}

export function formatDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

export function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export function clockTime(d: Date): string {
  return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
}

/** Number formatting used by dashboard bars: "$" prefix, "%"/" d" suffix, fixed decimals. */
export function formatValue(v: number, unit?: string, dec?: number): string {
  const n = dec !== undefined ? v.toFixed(dec) : v.toLocaleString('en-GB');
  if (unit === '$') return `$${n}`;
  return `${n}${unit ?? ''}`;
}

/** First names only, e.g. for "Hi Sarah". */
export function firstName(full: string): string {
  return full.split(' ')[0] || full;
}

export const TONES: { value: string; label: string }[] = [
  { value: 'institutional', label: 'Formal' },
  { value: 'casual', label: 'Friendly' },
  { value: 'urgent', label: 'Urgent' },
];

/** Normalise the two check shapes and keep only what a person needs to read. */
export function checkProblems(checks: { title: string; passed: boolean; detail?: string; summary?: string }[]): string[] {
  return checks.filter((c) => !c.passed).map((c) => {
    const why = c.detail || c.summary || '';
    return why && why !== 'Clean' && why !== 'OK' ? `${c.title}: ${why}` : c.title;
  });
}

/** Plain-English wording for trace steps shown under "How was this made?". */
export function plainStep(step: string, label: string): string {
  const map: Record<string, string> = {
    plan: 'Planned the work',
    data_source: label.includes('MCP') ? 'Read the case through the secure tool connection (MCP)' : 'Read the case from the database',
    redaction: 'Hid the client’s names before asking the AI',
    control: label.toLowerCase().includes('passed') ? 'Checked budget and safety switches' : label,
    prompt: 'Sent the instructions to the AI',
    model_call: label.includes('SIMULATED') ? 'AI wrote a draft (simulated mode)' : 'AI wrote a draft',
    restore: 'Put the real names back',
    validation: label.replace('Deterministic validation', 'Rule checks'),
    critic_verdict: label.includes('PASS') ? 'A second AI review approved it' : 'A second AI review asked for changes',
    fallback: 'Used the approved template instead',
    handoff: 'Saved for the Relationship Manager to review. Nothing was sent.',
    drill: 'Practice run: added a problem on purpose',
  };
  return map[step] ?? label;
}
