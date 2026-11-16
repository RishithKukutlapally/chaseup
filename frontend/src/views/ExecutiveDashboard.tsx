import React, { useEffect, useState } from 'react';

import { apiClient } from '../api/client';
import { Card, Empty, PageHeader, Stat, Table, Td } from '../components/ui';
import type { DashboardMetrics } from '../types/chasezero';

const Bar: React.FC<{ label: string; value: number; max: number; tone?: string }> = ({ label, value, max, tone }) => (
  <div className="flex items-center gap-space-sm">
    <span className="w-48 font-body-sm text-body-sm">{label}</span>
    <div className="flex-1 h-4 bg-surface-container rounded overflow-hidden">
      <div className={`h-full ${tone ?? 'bg-primary-container'}`} style={{ width: `${max ? Math.min(100, (value / max) * 100) : 0}%` }} />
    </div>
    <span className="w-16 text-right font-data-mono-sm text-data-mono-sm">{value} d</span>
  </div>
);

/** COO stage analytics — aggregates only, no document content. */
export const ExecutiveDashboard: React.FC = () => {
  const [m, setM] = useState<DashboardMetrics | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    apiClient.dashboard().then(setM).catch((e: Error) => setErr(e.message));
  }, []);
  if (err) return <Empty>{err}</Empty>;
  if (!m) return <Empty>Loading…</Empty>;
  const stages = m.extra.stage_median_days ?? {};
  const maxStage = Math.max(62, ...Object.values(stages));
  return (
    <div className="flex flex-col gap-space-lg">
      <PageHeader title="Stage analytics" subtitle={m.data_note ?? 'Aggregates only.'} />
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-space-md">
        <Stat label="Onboarding median (baseline)" value={`${m.baseline_onboarding_days} d`} sub="Target 30 days" tone="fail" />
        <Stat label="Onboarding (projected with pilot chase)" value={`${m.pilot_onboarding_days} d`} />
        <Stat label="Chase stage: baseline → pilot" value={`${m.baseline_chasing_days} → ${m.pilot_chasing_days} d`} sub={`${m.velocity_delta_pct}%`} />
        <Stat label="Files back more than once" value={`${m.baseline_unresponsive_pct}% → ${m.pilot_unresponsive_pct}%`} />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-space-lg">
        <Card title="Median days per stage">
          <Bar label="Whole onboarding (baseline)" value={m.baseline_onboarding_days} max={maxStage} tone="bg-error" />
          {Object.entries(stages).map(([k, v]) => (
            <Bar key={k} label={k.replace('_', ' ')} value={v} max={maxStage} />
          ))}
          <Bar label="Document chase (pilot)" value={m.pilot_chasing_days} max={maxStage} tone="bg-status-success" />
        </Card>
        <Card title="Pipeline right now">
          <Table head={['Measure', 'Value']}>
            <tr>
              <Td>Cases in tracker</Td>
              <Td>{m.extra.total_db_cases ?? 0}</Td>
            </tr>
            <tr>
              <Td>Overdue cases (live)</Td>
              <Td>{m.extra.live_breached_cases ?? 0}</Td>
            </tr>
            {Object.entries(m.extra.cases_by_stage_status ?? {}).map(([k, v]) => (
              <tr key={k}>
                <Td>Cases · {k.replace('_', ' ')}</Td>
                <Td>{v}</Td>
              </tr>
            ))}
            {Object.entries(m.extra.drafts_by_status ?? {}).map(([k, v]) => (
              <tr key={k}>
                <Td>Drafts · {k.replace('_', ' ')}</Td>
                <Td>{v}</Td>
              </tr>
            ))}
            <tr>
              <Td>Drafts approved by RMs / prepared</Td>
              <Td>
                {m.total_rm_approved} / {m.total_drafts_generated} ({m.rm_adoption_rate_pct}%)
              </Td>
            </tr>
            <tr>
              <Td>Days per chase round (baseline → pilot)</Td>
              <Td>
                {m.baseline_days_per_round} → {m.days_per_chase_round}
              </Td>
            </tr>
          </Table>
        </Card>
      </div>
    </div>
  );
};
