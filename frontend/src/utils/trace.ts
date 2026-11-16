import type { TraceStep } from '../types/chasezero';

export interface TraceSummary {
  steps: number;
  modelCalls: number;
  simulatedCalls: number;
  failedCalls: number;
  inputTokens: number;
  outputTokens: number;
  costUsd: number;
  dataSource: 'mcp' | 'direct' | 'synthetic' | 'unknown';
  verdict: 'pass' | 'reject' | 'none';
  handedOff: boolean;
}

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

export function summariseTrace(steps: TraceStep[]): TraceSummary {
  const calls = steps.filter((s) => s.step === 'model_call');
  const ds = steps.find((s) => s.step === 'data_source');
  let dataSource: TraceSummary['dataSource'] = 'unknown';
  if (ds) {
    if (/mcp/i.test(ds.label) && ds.status === 'ok') dataSource = 'mcp';
    else if (/synthetic/i.test(ds.label)) dataSource = 'synthetic';
    else dataSource = 'direct';
  }
  const verdicts = steps.filter((s) => s.step === 'critic_verdict');
  const last = verdicts[verdicts.length - 1];
  return {
    steps: steps.length,
    modelCalls: calls.length,
    simulatedCalls: calls.filter((c) => c.data?.simulated === true).length,
    failedCalls: calls.filter((c) => c.status === 'fail').length,
    inputTokens: calls.reduce((a, c) => a + num(c.data?.input_tokens), 0),
    outputTokens: calls.reduce((a, c) => a + num(c.data?.output_tokens), 0),
    costUsd: Math.round(calls.reduce((a, c) => a + num(c.data?.cost_usd), 0) * 1e8) / 1e8,
    dataSource,
    verdict: last ? (last.status === 'ok' ? 'pass' : 'reject') : 'none',
    handedOff: steps.some((s) => s.step === 'handoff'),
  };
}

export const STEP_LABELS: Record<string, string> = {
  plan: 'Plan',
  data_source: 'Data source',
  redaction: 'Redaction',
  control: 'Governance controls',
  prompt: 'Exact prompt sent',
  model_call: 'Model call',
  restore: 'Restore names',
  validation: 'Output validation',
  critic: 'Critic',
  critic_verdict: 'Critic verdict',
  fallback: 'Template fallback',
  drill: 'Drill',
  draft: 'Draft',
  handoff: 'Hand-off',
  error: 'Error',
};

export function stepLabel(step: string): string {
  return STEP_LABELS[step] ?? step;
}
