import React, { useState } from 'react';

import type { CheckItem, TraceStep } from '../types/chasezero';
import { formatTokens, formatUsd } from '../utils/format';
import { stepLabel, summariseTrace } from '../utils/trace';
import { Badge, statusTone } from './ui';

const StepData: React.FC<{ step: TraceStep }> = ({ step }) => {
  const [open, setOpen] = useState(false);
  const d = step.data ?? {};
  if (step.step === 'prompt') {
    return (
      <div>
        <button type="button" className="font-label-sm text-label-sm text-accent-blue cursor-pointer" onClick={() => setOpen(!open)}>
          {open ? 'Hide' : 'Show'} exact prompt (redacted, incl. fixed guardrails)
        </button>
        {open && (
          <pre className="mt-space-xs font-data-mono-sm text-data-mono-sm bg-surface-container-low p-space-sm rounded whitespace-pre-wrap max-h-96 overflow-y-auto">
            {`--- SYSTEM ---\n${String(d.system ?? '')}\n\n--- USER ---\n${String(d.user ?? '')}`}
          </pre>
        )}
      </div>
    );
  }
  if (step.step === 'model_call' && d.model) {
    return (
      <div className="flex gap-space-sm flex-wrap font-data-mono-sm text-data-mono-sm text-on-surface-variant">
        <span>{String(d.model)}</span>
        <span>in {formatTokens(Number(d.input_tokens))} / out {formatTokens(Number(d.output_tokens))} tok</span>
        <span>{String(d.latency_ms ?? 0)} ms</span>
        <span>{formatUsd(Number(d.cost_usd))}</span>
        {d.simulated === true && <Badge tone="warn">simulated</Badge>}
      </div>
    );
  }
  if (Array.isArray(d.checks)) {
    return (
      <ul className="grid grid-cols-1 md:grid-cols-2 gap-x-space-md">
        {(d.checks as CheckItem[]).map((c) => (
          <li key={c.key} className="font-body-sm text-body-sm flex gap-space-xs">
            <span className={c.passed ? 'text-status-success' : 'text-error'}>{c.passed ? '✓' : '✗'}</span>
            <span>
              {c.title}
              {!c.passed && <span className="text-on-surface-variant"> — {c.detail ?? c.summary}</span>}
            </span>
          </li>
        ))}
      </ul>
    );
  }
  if (step.step === 'redaction') {
    return (
      <span className="font-data-mono-sm text-data-mono-sm text-on-surface-variant">
        placeholders: {((d.placeholders as string[]) ?? []).join(', ')}
        {((d.leaks as string[]) ?? []).length > 0 && <span className="text-error"> LEAK: {(d.leaks as string[]).join(', ')}</span>}
      </span>
    );
  }
  const rest = Object.entries(d).filter(([k]) => !['system', 'user'].includes(k));
  if (!rest.length) return null;
  return (
    <span className="font-data-mono-sm text-data-mono-sm text-on-surface-variant break-all">
      {rest.map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : String(v)}`).join(' · ')}
    </span>
  );
};

export const TraceSteps: React.FC<{ steps: TraceStep[] }> = ({ steps }) => {
  const s = summariseTrace(steps);
  return (
    <div className="flex flex-col gap-space-sm">
      <div className="flex gap-space-sm flex-wrap">
        <Badge tone={s.dataSource === 'mcp' ? 'ok' : s.dataSource === 'direct' ? 'warn' : 'neutral'} testId="trace-data-source">
          data via {s.dataSource}
        </Badge>
        <Badge tone="info">{s.modelCalls} model calls</Badge>
        {s.simulatedCalls > 0 && <Badge tone="warn">{s.simulatedCalls} simulated</Badge>}
        {s.failedCalls > 0 && <Badge tone="fail">{s.failedCalls} failed</Badge>}
        <Badge tone="neutral">
          {formatTokens(s.inputTokens)} in / {formatTokens(s.outputTokens)} out
        </Badge>
        <Badge tone="neutral">{formatUsd(s.costUsd)}</Badge>
        {s.verdict !== 'none' && <Badge tone={s.verdict === 'pass' ? 'ok' : 'fail'}>critic {s.verdict}</Badge>}
      </div>
      <ol data-testid="trace-steps" className="flex flex-col border-l-2 border-border-structural ml-space-sm">
        {steps.map((st) => (
          <li key={`${st.n}-${st.step}`} className="pl-space-md py-space-xs relative">
            <span
              className={`absolute -left-[7px] top-3 w-3 h-3 rounded-full ${
                st.status === 'ok' ? 'bg-status-success' : st.status === 'fail' ? 'bg-error' : st.status === 'warn' ? 'bg-status-warning' : 'bg-outline'
              }`}
            />
            <div className="flex items-center gap-space-sm flex-wrap">
              <span className="font-data-mono-sm text-data-mono-sm text-on-surface-variant">#{st.n} +{st.t_ms}ms</span>
              <Badge tone={statusTone(st.status)}>{stepLabel(st.step)}</Badge>
              <span className="font-body-sm text-body-sm text-on-surface">{st.label}</span>
            </div>
            <div className="mt-space-2xs">
              <StepData step={st} />
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
};
