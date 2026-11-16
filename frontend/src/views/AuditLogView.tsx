import React, { useEffect, useState } from 'react';

import { apiClient } from '../api/client';
import { Badge, Button, Card, Empty, PageHeader, Table, Td } from '../components/ui';
import type { AuditEvent, ChainVerification } from '../types/chasezero';
import { formatDateTime, shortHash } from '../utils/format';

export const AuditLogView: React.FC = () => {
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [verify, setVerify] = useState<ChainVerification | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [filter, setFilter] = useState('');
  const load = () => apiClient.auditLog(500).then(setEvents).catch((e: Error) => setErr(e.message));
  useEffect(() => {
    void load();
  }, []);
  const shown = filter
    ? events.filter((e) => `${e.action} ${e.actor} ${e.via} ${e.entity_type}`.toLowerCase().includes(filter.toLowerCase()))
    : events;
  return (
    <div className="flex flex-col gap-space-lg">
      <PageHeader
        title="Audit log"
        subtitle="Append-only (database triggers block UPDATE/DELETE). Each event's hash = SHA-256(previous hash + event)."
        actions={
          <>
            <input
              className="bg-surface-container-lowest border border-border-structural rounded px-space-sm py-space-xs font-body-sm text-body-sm"
              placeholder="Filter…"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
            <Button
              variant="primary"
              testId="verify-chain"
              onClick={async () => {
                try {
                  setVerify(await apiClient.verifyAudit());
                  void load();
                } catch (e) {
                  setErr((e as Error).message);
                }
              }}
            >
              Verify chain
            </Button>
          </>
        }
      />
      {err && <p className="text-error">{err}</p>}
      {verify && (
        <Card testId="verify-result">
          <div className="flex items-center gap-space-sm flex-wrap">
            <Badge tone={verify.valid ? 'ok' : 'fail'}>{verify.valid ? 'chain valid' : 'CHAIN BROKEN'}</Badge>
            <span className="font-body-sm text-body-sm">{verify.events_checked} events checked</span>
            {verify.head_hash && <span className="font-data-mono-sm text-data-mono-sm">head {shortHash(verify.head_hash, 24)}</span>}
            {!verify.valid && (
              <span className="text-error font-body-sm text-body-sm">
                broken at event #{verify.broken_at_id}: {verify.reason}
              </span>
            )}
          </div>
        </Card>
      )}
      <Card title={`${shown.length} events (newest first)`}>
        {shown.length === 0 ? (
          <Empty>No events.</Empty>
        ) : (
          <Table head={['#', 'Time', 'Actor', 'Action', 'Entity', 'Case', 'Reason', 'Via', 'Prev hash', 'Hash']} testId="audit-table">
            {shown.map((e) => (
              <tr key={e.id}>
                <Td mono>{e.id}</Td>
                <Td>{formatDateTime(e.ts)}</Td>
                <Td>
                  {e.actor}
                  <div className="text-on-surface-variant">{e.actor_role}</div>
                </Td>
                <Td title={JSON.stringify(e.details)}>
                  <Badge tone={e.action.includes('denied') || e.action.includes('failed') ? 'fail' : 'info'}>{e.action}</Badge>
                </Td>
                <Td>
                  {e.entity_type} {e.entity_id}
                </Td>
                <Td>{e.case_id ?? '—'}</Td>
                <Td>{e.reason || '—'}</Td>
                <Td>
                  <Badge tone={e.via === 'mcp' ? 'accent' : e.via === 'system' ? 'neutral' : 'info'}>{e.via}</Badge>
                </Td>
                <Td mono title={e.prev_hash}>
                  {shortHash(e.prev_hash)}
                </Td>
                <Td mono title={e.hash}>
                  {shortHash(e.hash)}
                </Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </div>
  );
};
