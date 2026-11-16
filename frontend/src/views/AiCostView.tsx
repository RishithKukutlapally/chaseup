import React, { useEffect, useState } from 'react';

import { apiClient } from '../api/client';
import { Badge, Button, Card, Empty, PageHeader, SimulatedBanner, Stat, statusTone, Table, Td } from '../components/ui';
import { useChaseStore } from '../store/useChaseStore';
import type { CostAgg, CostSummary } from '../types/chasezero';
import { budgetPct, formatDateTime, formatInr, formatTokens, formatUsd } from '../utils/format';

const AggTable: React.FC<{ title: string; rows: Record<string, CostAgg> }> = ({ title, rows }) => (
  <Card title={title}>
    <Table head={['', 'Calls', 'Tokens in / out', 'USD', 'INR']}>
      {Object.entries(rows).map(([k, v]) => (
        <tr key={k}>
          <Td mono>{k}</Td>
          <Td>{v.calls}</Td>
          <Td>
            {formatTokens(v.input_tokens)} / {formatTokens(v.output_tokens)}
          </Td>
          <Td>{formatUsd(v.usd)}</Td>
          <Td>{formatInr(v.inr)}</Td>
        </tr>
      ))}
    </Table>
  </Card>
);

/** "What does every call cost?" — all-time, this month, by agent/model, real vs simulated, per task, per outcome. */
export const AiCostView: React.FC = () => {
  const { openTrace, health } = useChaseStore();
  const [s, setS] = useState<CostSummary | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const load = () => apiClient.costSummary().then(setS).catch((e: Error) => setErr(e.message));
  useEffect(() => {
    void load();
  }, []);
  if (err) return <Empty>{err}</Empty>;
  if (!s) return <Empty>Loading…</Empty>;
  const o = s.outcomes;
  return (
    <div className="flex flex-col gap-space-lg" data-testid="ai-cost">
      <PageHeader
        title="AI Cost & Governance"
        subtitle={`Every LLM call is recorded (including blocked, failed and simulated ones). ${s.currency_note}.`}
        actions={<Button onClick={() => void load()}>Refresh</Button>}
      />
      <SimulatedBanner mode={health?.llm_mode} />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-space-md">
        <Stat label="All-time" value={formatUsd(s.all_time.usd)} sub={`${formatInr(s.all_time.inr)} · ${s.all_time.calls} calls`} />
        <Stat label="This month" value={formatUsd(s.this_month.usd)} sub={`${formatInr(s.this_month.inr)} · ${s.this_month.calls} calls`} />
        <Stat
          label="Cost per draft approved by RM"
          value={formatUsd(o.approved.per_draft_usd)}
          sub={`${formatInr(o.approved.per_draft_inr)} · ${o.approved.drafts} approved · fully loaded ${formatUsd(o.fully_loaded_cost_per_approved_draft_usd)}`}
        />
        <Stat
          label="Cost per discarded draft"
          value={formatUsd(o.discarded.per_draft_usd)}
          sub={`${o.discarded.drafts} discarded · ${o.pending.drafts} still pending`}
        />
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-space-md">
        <Stat label="Real calls" value={formatUsd(s.real_vs_simulated.real.usd)} sub={`${s.real_vs_simulated.real.calls} calls (billed)`} />
        <Stat
          label="Simulated calls"
          value={formatUsd(s.real_vs_simulated.simulated.usd)}
          sub={`${s.real_vs_simulated.simulated.calls} calls · notional, not billed`}
        />
        {Object.entries(s.per_task_avg).map(([k, v]) => (
          <Stat key={k} label={`Avg per ${k.replace('_', ' ')} task`} value={formatUsd(v.avg_usd)} sub={`${v.tasks} tasks · ${v.avg_calls} calls each`} />
        ))}
      </div>

      <Card title="Monthly budget cap per agent (calls are blocked once the cap is reached)">
        {Object.entries(s.budgets).map(([agent, b]) => {
          const pct = budgetPct(b.spent_usd, b.cap_usd);
          return (
            <div key={agent} className="flex items-center gap-space-md">
              <span className="w-32 font-data-mono-sm text-data-mono-sm">{agent}</span>
              <div className="flex-1 h-4 bg-surface-container rounded overflow-hidden">
                <div className={`h-full ${pct >= 100 ? 'bg-error' : pct > 80 ? 'bg-status-warning' : 'bg-status-success'}`} style={{ width: `${pct}%` }} />
              </div>
              <span className="w-56 font-body-sm text-body-sm">
                {formatUsd(b.spent_usd)} of {formatUsd(b.cap_usd ?? 0)} ({pct.toFixed(1)}%)
              </span>
              {!b.enabled && <Badge tone="fail">switched off</Badge>}
              {b.simulate_primary_outage && <Badge tone="warn">outage drill on</Badge>}
            </div>
          );
        })}
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-space-lg">
        <AggTable title="By agent" rows={s.by_agent} />
        <AggTable title="By model" rows={s.by_model} />
        <AggTable title="By outcome status" rows={s.by_status} />
      </div>

      <Card title="Price table (per 1M tokens)">
        <p className="font-body-sm text-body-sm text-on-surface-variant">{s.price_note}</p>
        <Table head={['Model', 'Provider', 'Input', 'Output', 'Source', '']}>
          {Object.entries(s.price_table).map(([m, p]) => (
            <tr key={m}>
              <Td mono>{m}</Td>
              <Td>{p.provider}</Td>
              <Td>{formatUsd(p.input_per_m_usd)}</Td>
              <Td>{formatUsd(p.output_per_m_usd)}</Td>
              <Td>{p.source}</Td>
              <Td>
                <Badge tone={p.verified ? 'warn' : 'fail'}>{p.verified ? 'placeholder – confirm with Finance' : 'unverified'}</Badge>
              </Td>
            </tr>
          ))}
        </Table>
      </Card>

      <Card title="Per-task ledger (click a row for its trace)">
        <Table head={['Task', 'Kind', 'Case', 'When', 'Via', 'Data', 'Engine', 'Calls', 'USD', 'INR', 'Outcome']} testId="ledger">
          {s.ledger.map((t) => (
            <tr key={t.id} className="hover:bg-surface-container-low cursor-pointer" onClick={() => openTrace(t.id)}>
              <Td mono>#{t.id}</Td>
              <Td>{t.kind}</Td>
              <Td>{t.case_id ?? '—'}</Td>
              <Td>{formatDateTime(t.created_at)}</Td>
              <Td>{t.via}</Td>
              <Td>{t.data_source || '—'}</Td>
              <Td>
                {t.engine || '—'} {t.simulated && <Badge tone="warn">simulated</Badge>}
              </Td>
              <Td>{t.llm_calls}</Td>
              <Td>{formatUsd(t.cost_usd)}</Td>
              <Td>{formatInr(t.cost_inr)}</Td>
              <Td>
                <Badge tone={statusTone(t.outcome)}>{t.outcome}</Badge>
              </Td>
            </tr>
          ))}
        </Table>
      </Card>
    </div>
  );
};
