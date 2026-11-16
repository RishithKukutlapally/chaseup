import React, { useEffect, useState } from 'react';

import { askReason, Badge, Button, Card, Empty, Field, inputClass, PageHeader, statusTone, Table, Td } from '../components/ui';
import { useChaseStore } from '../store/useChaseStore';
import { hasPermission } from '../utils/access';
import { formatDateTime } from '../utils/format';

/** Case Detail: checklist with document state, owner, request date, chase round; timeline from the event log. */
export const CaseTracker: React.FC = () => {
  const { selectedCase: c, me, setDocumentStatus, updateNote, analystRequest, startWorkflow, setActiveView, resetCase } =
    useChaseStore();
  const [note, setNote] = useState('');
  const [reqDoc, setReqDoc] = useState('');
  const [reqNote, setReqNote] = useState('');

  useEffect(() => setNote(c?.relationship_notes ?? ''), [c?.id, c?.relationship_notes]);

  if (!c) return <Empty>Select a case from the Chase Queue.</Empty>;
  const canNote = hasPermission(me, 'case:note_edit') && c.assigned_rm_user_id === me?.id;
  const canRequest = hasPermission(me, 'analyst:request_from_rm');
  const canReset = hasPermission(me, 'case:demo_reset');

  return (
    <div className="flex flex-col gap-space-lg">
      <PageHeader
        title={`${c.client_name}`}
        subtitle={
          <>
            <span className="font-data-mono-sm text-data-mono-sm">{c.case_code}</span> · {c.jurisdiction} · {c.desk} · Named RM:{' '}
            <strong>{c.assigned_rm}</strong> · Contact: {c.contact_name} ({c.contact_role}) · Deadline {c.target_deadline_label}
          </>
        }
        actions={
          <>
            <Badge tone={statusTone(c.status)}>{c.status.replace('_', ' ')}</Badge>
            {c.can_create_draft && c.missing_count > 0 && (
              <Button variant="primary" testId="run-chaser" onClick={() => startWorkflow(c.id)}>
                Prepare chase draft
              </Button>
            )}
            {c.pending_draft_id && hasPermission(me, 'draft:read') && (
              <Button onClick={() => setActiveView('reminder-composer')}>Review draft #{c.pending_draft_id}</Button>
            )}
            {canReset && <Button variant="ghost" onClick={() => void resetCase()}>Demo reset</Button>}
          </>
        }
      />

      <Card
        title={`Document checklist (${c.missing_count} missing · ${c.received_count} received · ${c.waived_count} waived)`}
        testId="checklist"
      >
        {!c.can_update_documents && (
          <p className="font-body-sm text-body-sm text-on-surface-variant">
            Read-only. Only KYC Ops can mark documents received or waived. Receipt means a person logged it — the system
            never decides whether a document is genuine.
          </p>
        )}
        <Table head={['Document', 'Status', 'Requested', 'Waiting', 'Round', 'Owner / note', '']}>
          {c.documents.map((d) => (
            <tr key={d.id}>
              <Td>
                <div className="font-semibold">{d.document_name}</div>
                <div className="text-on-surface-variant">{d.description}</div>
              </Td>
              <Td>
                <Badge tone={statusTone(d.status)}>{d.status}</Badge>
                {d.overdue && (
                  <span className="ml-space-xs">
                    <Badge tone="fail">overdue</Badge>
                  </span>
                )}
              </Td>
              <Td>{formatDateTime(d.requested_at)}</Td>
              <Td>{d.status === 'Missing' ? `${d.days_waiting} d` : '—'}</Td>
              <Td>{d.chase_round}</Td>
              <Td>{d.waived_reason ? `Waived: ${d.waived_reason}` : d.assigned_to_or_verifier}</Td>
              <Td>
                {c.can_update_documents && (
                  <div className="flex gap-space-xs flex-wrap">
                    {d.status !== 'Received' && (
                      <Button testId={`mark-received-${d.id}`} onClick={() => void setDocumentStatus(d.id, 'received', 'Receipt logged by Ops')}>
                        Mark received
                      </Button>
                    )}
                    {d.status !== 'Waived' && (
                      <Button
                        onClick={() => {
                          const r = askReason(`Reason for waiving "${d.document_name}" (recorded in the audit log):`);
                          if (r) void setDocumentStatus(d.id, 'waived', r);
                        }}
                      >
                        Waive…
                      </Button>
                    )}
                    {d.status !== 'Missing' && (
                      <Button
                        variant="ghost"
                        onClick={() => {
                          const r = askReason('Reason for re-requesting this document:', 3);
                          if (r) void setDocumentStatus(d.id, 'missing', r);
                        }}
                      >
                        Re-request
                      </Button>
                    )}
                  </div>
                )}
              </Td>
            </tr>
          ))}
        </Table>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-space-lg">
        {canRequest && (
          <Card title="Request from RM (analyst hand-off)" testId="analyst-request">
            <p className="font-body-sm text-body-sm text-on-surface-variant">
              Ask {c.assigned_rm} to obtain an item that blocks ownership analysis. The request is linked to this case and
              logged.
            </p>
            <Field label="Document needed">
              <input className={inputClass} value={reqDoc} onChange={(e) => setReqDoc(e.target.value)} placeholder="e.g. Signed group structure chart" />
            </Field>
            <Field label="Context for the RM">
              <textarea className={inputClass} rows={3} value={reqNote} onChange={(e) => setReqNote(e.target.value)} />
            </Field>
            <Button
              variant="primary"
              disabled={reqDoc.trim().length < 3}
              onClick={async () => {
                await analystRequest(reqDoc.trim(), reqNote.trim());
                setReqDoc('');
                setReqNote('');
              }}
            >
              Send request to {c.assigned_rm}
            </Button>
          </Card>
        )}
        <Card title="Relationship notes">
          <textarea className={inputClass} rows={4} value={note} disabled={!canNote} onChange={(e) => setNote(e.target.value)} />
          {canNote ? (
            <Button onClick={() => void updateNote(note)}>Save note</Button>
          ) : (
            <span className="font-body-sm text-body-sm text-on-surface-variant">Only the named RM can edit notes.</span>
          )}
        </Card>
        <Card title="Case timeline (from the audit log)" className="lg:col-span-1">
          {c.actions.length === 0 ? (
            <Empty>No events yet.</Empty>
          ) : (
            <ol className="flex flex-col gap-space-sm max-h-96 overflow-y-auto">
              {c.actions.map((a) => (
                <li key={a.id} className="border-l-2 border-border-structural pl-space-sm">
                  <div className="flex gap-space-sm items-center flex-wrap">
                    <Badge tone="info">{a.action_type}</Badge>
                    <span className="font-data-mono-sm text-data-mono-sm text-on-surface-variant">{formatDateTime(a.timestamp)}</span>
                  </div>
                  <p className="font-body-sm text-body-sm">{a.details}</p>
                  <p className="font-body-sm text-body-sm text-on-surface-variant">{a.actor}</p>
                </li>
              ))}
            </ol>
          )}
        </Card>
      </div>
    </div>
  );
};
