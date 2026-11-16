import React from 'react';

import { Badge, Button, Card, Empty, PageHeader, Stat, statusTone, Table, Td } from '../components/ui';
import { useChaseStore } from '../store/useChaseStore';
import type { FilterTab } from '../types/chasezero';

const TABS: { id: FilterTab; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'breached', label: 'Overdue' },
  { id: 'awaiting', label: 'Awaiting docs' },
  { id: 'draft_ready', label: 'Draft ready' },
  { id: 'completed', label: 'Completed' },
];

/** Chase Queue: what is missing, how long it has waited, who owes it. Sorted by the oldest waiting item. */
export const OrchestratorInbox: React.FC = () => {
  const { summary, filterTab, setFilterTab, selectCase, startWorkflow, me } = useChaseStore();
  const cases = summary?.cases ?? [];

  return (
    <div>
      <PageHeader
        title="Chase Queue"
        subtitle={
          summary?.scope === 'own'
            ? `Your cases only (${me?.display_name}). Sorted by the oldest outstanding document.`
            : 'All cases. Sorted by the oldest outstanding document.'
        }
      />
      {summary && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-space-md mb-space-lg">
          <Stat label="Cases" value={summary.total_active_cases} />
          <Stat label="Overdue (>3 days since contact)" value={summary.sla_breached_count} tone={summary.sla_breached_count ? 'fail' : undefined} />
          <Stat label="Drafts awaiting RM" value={summary.pending_rm_action_count} />
          <Stat label="Avg days since contact" value={summary.avg_chase_latency_days} sub="Overdue threshold 3 days is an assumption to confirm with Ops" />
        </div>
      )}
      <Card
        actions={TABS.map((t) => (
          <Button key={t.id} variant={filterTab === t.id ? 'primary' : 'ghost'} onClick={() => setFilterTab(t.id)}>
            {t.label}
          </Button>
        ))}
        title="Cases"
      >
        {cases.length === 0 ? (
          <Empty>No cases match.</Empty>
        ) : (
          <Table head={['Case', 'Client', 'Named RM', 'Missing', 'Oldest wait', 'Owed by', 'Status', '']} testId="queue-table">
            {cases.map((c) => (
              <tr key={c.id} className="hover:bg-surface-container-low cursor-pointer" onClick={() => void selectCase(c.id, 'case-detail')}>
                <Td mono>{c.case_code}</Td>
                <Td>{c.client_name}</Td>
                <Td>{c.assigned_rm}</Td>
                <Td>{c.missing_count}</Td>
                <Td>
                  <span className={c.oldest_missing_days > 3 ? 'text-error font-semibold' : ''}>{c.oldest_missing_days} d</span>
                </Td>
                <Td>{c.missing_count ? c.contact_name : '—'}</Td>
                <Td>
                  <Badge tone={statusTone(c.status)}>{c.status.replace('_', ' ')}</Badge>
                  {c.pending_draft_id && (
                    <span className="ml-space-xs">
                      <Badge tone="warn">draft #{c.pending_draft_id}</Badge>
                    </span>
                  )}
                </Td>
                <Td>
                  {c.can_create_draft && c.missing_count > 0 && (
                    <Button
                      variant="primary"
                      testId={`run-chaser-${c.id}`}
                      onClick={(e) => {
                        e.stopPropagation();
                        void selectCase(c.id);
                        startWorkflow(c.id);
                      }}
                    >
                      Prepare chase draft
                    </Button>
                  )}
                </Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </div>
  );
};
