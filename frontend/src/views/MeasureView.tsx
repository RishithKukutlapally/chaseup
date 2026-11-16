import React, { useEffect, useState } from 'react';

import { apiClient } from '../api/client';
import { Card, Empty, PageHeader, Stat, Table, Td } from '../components/ui';
import type { MeasureStats, MeasureSummary } from '../types/chasezero';

const Col: React.FC<{ s: MeasureStats }> = ({ s }) => (
  <Card title={s.label}>
    {s.n === 0 ? (
      <Empty>No data yet.</Empty>
    ) : (
      <div className="grid grid-cols-2 gap-space-sm">
        <Stat label="Median days" value={s.median_days ?? '—'} />
        <Stat label="Mean days" value={s.mean_days ?? '—'} />
        <Stat label="P90 days" value={s.p90_days ?? '—'} />
        <Stat label="Documents" value={s.n} />
        <Stat label="Avg chase rounds" value={s.avg_rounds ?? '—'} />
        <Stat label="% needing >1 round" value={s.pct_more_than_one_round != null ? `${s.pct_more_than_one_round}%` : '—'} />
      </div>
    )}
  </Card>
);

export const MeasureView: React.FC = () => {
  const [m, setM] = useState<MeasureSummary | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    apiClient.measure().then(setM).catch((e: Error) => setErr(e.message));
  }, []);
  if (err) return <Empty>{err}</Empty>;
  if (!m) return <Empty>Loading…</Empty>;
  return (
    <div className="flex flex-col gap-space-lg" data-testid="measure">
      <PageHeader title="Measure: before vs after" subtitle={m.metric} />
      <div className="rounded border border-status-warning/40 bg-[#fef3c7] p-space-sm font-body-sm text-body-sm" data-testid="measure-caveat">
        {m.caveat}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-space-lg">
        <Col s={m.baseline} />
        <Col s={m.pilot} />
        <Col s={m.live} />
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-space-lg">
        <Card title="Median days by document type">
          <Table head={['Document type', 'Before', 'After']}>
            {Object.entries(m.by_doc_type).map(([k, v]) => (
              <tr key={k}>
                <Td>{k}</Td>
                <Td>{v.baseline ?? '—'}</Td>
                <Td>{v.pilot ?? '—'}</Td>
              </tr>
            ))}
          </Table>
        </Card>
        <Card title="Case facts (Northgate, fictional)">
          <Table head={['Fact', 'Value']}>
            {Object.entries(m.case_facts).map(([k, v]) => (
              <tr key={k}>
                <Td>{k.replace(/_/g, ' ')}</Td>
                <Td>{String(v)}</Td>
              </tr>
            ))}
          </Table>
        </Card>
      </div>
    </div>
  );
};
