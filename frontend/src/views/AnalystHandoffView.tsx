import React from 'react';

import { Badge, Button, Card, Empty, PageHeader, Table, Td } from '../components/ui';
import { useChaseStore } from '../store/useChaseStore';

/** Analyst hand-off: files still blocked by missing items, with a linked "request from RM". */
export const AnalystHandoffView: React.FC = () => {
  const { summary, selectCase } = useChaseStore();
  const blocked = (summary?.cases ?? []).filter((c) => c.missing_count > 0);
  return (
    <div>
      <PageHeader
        title="Analyst hand-off"
        subtitle="Files you cannot start yet. Open a case to see the read-only checklist and send a linked request to the named RM."
      />
      <Card title={`${blocked.length} files blocked by missing documents`}>
        {blocked.length === 0 ? (
          <Empty>Every file is complete.</Empty>
        ) : (
          <Table head={['Case', 'Client', 'Missing', 'Oldest wait', 'Named RM', '']}>
            {blocked.map((c) => (
              <tr key={c.id}>
                <Td mono>{c.case_code}</Td>
                <Td>{c.client_name}</Td>
                <Td>
                  {c.documents
                    .filter((d) => d.status === 'Missing')
                    .map((d) => (
                      <div key={d.id}>{d.document_name}</div>
                    ))}
                </Td>
                <Td>
                  <Badge tone={c.oldest_missing_days > 3 ? 'fail' : 'neutral'}>{c.oldest_missing_days} d</Badge>
                </Td>
                <Td>{c.assigned_rm}</Td>
                <Td>
                  <Button onClick={() => void selectCase(c.id, 'case-detail')}>Open / request from RM</Button>
                </Td>
              </tr>
            ))}
          </Table>
        )}
      </Card>
    </div>
  );
};
