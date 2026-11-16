import React, { useEffect, useState } from 'react';

import { apiClient } from '../api/client';
import { TraceSteps } from '../components/TraceSteps';
import { Badge, Card, Empty, PageHeader, statusTone, Table, Td } from '../components/ui';
import { useChaseStore } from '../store/useChaseStore';
import type { TaskRow, TraceDetail } from '../types/chasezero';
import { formatDateTime, formatInr, formatUsd } from '../utils/format';

export const TraceView: React.FC = () => {
  const { selectedTaskId, openTrace } = useChaseStore();
  const [tasks, setTasks] = useState<TaskRow[]>([]);
  const [detail, setDetail] = useState<TraceDetail | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    apiClient.listTasks().then(setTasks).catch((e: Error) => setErr(e.message));
  }, [selectedTaskId]);

  useEffect(() => {
    const id = selectedTaskId ?? tasks[0]?.id;
    if (!id) return;
    apiClient.getTrace(id).then(setDetail).catch((e: Error) => setErr(e.message));
  }, [selectedTaskId, tasks]);

  return (
    <div className="flex flex-col gap-space-lg">
      <PageHeader title="Agent traces" subtitle="Every step of every agent run: plan, data source, redaction, exact prompt, model calls, validation, critic verdict, hand-off." />
      {err && <p className="text-error">{err}</p>}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-space-lg items-start">
        <Card title="Runs" className="xl:col-span-4">
          {tasks.length === 0 ? (
            <Empty>No agent runs yet.</Empty>
          ) : (
            <ul className="flex flex-col gap-space-2xs max-h-[70vh] overflow-y-auto">
              {tasks.map((t) => (
                <li key={t.id}>
                  <button
                    type="button"
                    onClick={() => openTrace(t.id)}
                    className={`w-full text-left px-space-sm py-space-xs rounded cursor-pointer ${
                      detail?.task.id === t.id ? 'bg-secondary-container' : 'hover:bg-surface-container-low'
                    }`}
                  >
                    <div className="flex items-center gap-space-xs flex-wrap">
                      <span className="font-data-mono-sm text-data-mono-sm">#{t.id}</span>
                      <Badge tone="info">{t.kind}</Badge>
                      <Badge tone={statusTone(t.outcome)}>{t.outcome}</Badge>
                      {t.simulated && <Badge tone="warn">simulated</Badge>}
                    </div>
                    <div className="font-body-sm text-body-sm text-on-surface-variant">
                      case {t.case_id ?? '—'} · {formatDateTime(t.created_at)} · {formatUsd(t.cost_usd)}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>
        <div className="xl:col-span-8 flex flex-col gap-space-lg">
          {detail ? (
            <>
              <Card
                title={`Task #${detail.task.id} · ${detail.task.kind}`}
                actions={
                  <span className="font-data-mono-sm text-data-mono-sm text-on-surface-variant">{detail.task.trace_id}</span>
                }
              >
                <TraceSteps steps={detail.steps} />
              </Card>
              <Card title="LLM calls (agent_runs)">
                <Table head={['#', 'Agent', 'Purpose', 'Model', 'Status', 'Tokens', 'ms', 'USD', 'INR', 'v']}>
                  {detail.runs.map((r) => (
                    <tr key={r.id}>
                      <Td mono>{r.id}</Td>
                      <Td>{r.agent}</Td>
                      <Td>{r.purpose}</Td>
                      <Td mono>
                        {r.model} {r.is_fallback && <Badge tone="warn">fallback</Badge>}
                      </Td>
                      <Td title={r.error ?? ''}>
                        <Badge tone={statusTone(r.status)}>{r.status}</Badge>
                      </Td>
                      <Td>
                        {r.input_tokens}/{r.output_tokens}
                      </Td>
                      <Td>{r.latency_ms}</Td>
                      <Td>{formatUsd(r.cost_usd)}</Td>
                      <Td>{formatInr(r.cost_inr)}</Td>
                      <Td>{r.config_version ?? '—'}</Td>
                    </tr>
                  ))}
                </Table>
              </Card>
            </>
          ) : (
            <Empty>Select a run.</Empty>
          )}
        </div>
      </div>
    </div>
  );
};
