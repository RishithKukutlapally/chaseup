import React, { useEffect, useMemo, useState } from 'react';

import { apiClient } from '../api/client';
import { TraceSteps } from '../components/TraceSteps';
import { askReason, Badge, Button, Card, Empty, Field, inputClass, PageHeader, SimulatedBanner, statusTone } from '../components/ui';
import { useChaseStore } from '../store/useChaseStore';
import type { CheckItem, Draft } from '../types/chasezero';
import { hasPermission } from '../utils/access';
import { formatDateTime } from '../utils/format';

const TONES = ['', 'institutional', 'casual', 'urgent'];

const Checks: React.FC<{ checks: CheckItem[] }> = ({ checks }) => (
  <ul className="flex flex-col gap-space-2xs" data-testid="draft-checks">
    {checks.map((c) => (
      <li key={c.key} className="flex gap-space-xs font-body-sm text-body-sm">
        <span className={c.passed ? 'text-status-success' : 'text-error'}>{c.passed ? '✓' : '✗'}</span>
        <span>
          <strong>{c.title}</strong>
          {!c.passed && <span className="text-on-surface-variant"> — {c.detail ?? c.summary}</span>}
        </span>
      </li>
    ))}
  </ul>
);

/** Reminder Composer: run the chaser, review the draft, and (named RM only) approve & send. */
export const DraftingAgentView: React.FC = () => {
  const { selectedCase: c, me, health, workflow, startWorkflow, approveDraft, discardDraft, lastDispatch, clearLastDispatch, openTrace, summary, selectCase } =
    useChaseStore();
  const [tone, setTone] = useState('');
  const [drill, setDrill] = useState(false);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [liveChecks, setLiveChecks] = useState<CheckItem[] | null>(null);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [sending, setSending] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const pending = useMemo(() => drafts.find((d) => d.id === c?.pending_draft_id) ?? null, [drafts, c?.pending_draft_id]);

  useEffect(() => {
    if (!c || !hasPermission(me, 'draft:read')) return;
    apiClient.listDrafts(c.id).then(setDrafts).catch(() => setDrafts([]));
  }, [c?.id, c?.pending_draft_id, me]);

  useEffect(() => {
    setSubject(pending?.subject ?? '');
    setBody(pending?.body ?? '');
    setLiveChecks(null);
  }, [pending?.id]);

  // Live validation of RM edits (same validator the server runs at approval time)
  useEffect(() => {
    if (!c || !pending || body === pending.body) return;
    const t = window.setTimeout(() => {
      apiClient.recheckDraft(c.id, body).then(setLiveChecks).catch(() => undefined);
    }, 500);
    return () => window.clearTimeout(t);
  }, [body, c?.id, pending?.id]);

  if (!c) return <Empty>Select a case from the Chase Queue.</Empty>;

  const checks = liveChecks ?? pending?.validation ?? [];
  const checksOk = checks.length > 0 && checks.every((x) => x.passed);
  const latestTask = workflow.taskId ?? pending?.task_id ?? null;

  return (
    <div className="flex flex-col gap-space-lg">
      <PageHeader
        title="Reminder Composer"
        subtitle={
          <>
            Drafts are prepared by the chaser agent and <strong>never sent automatically</strong>. Only the named RM (
            {c.assigned_rm}) can approve and send — enforced by the server.
          </>
        }
        actions={
          summary && (
            <select
              aria-label="Case"
              className={inputClass}
              value={c.id}
              onChange={(e) => void selectCase(Number(e.target.value))}
            >
              {summary.cases.map((x) => (
                <option key={x.id} value={x.id}>
                  {x.case_code} — {x.client_name}
                </option>
              ))}
            </select>
          )
        }
      />
      <SimulatedBanner mode={health?.llm_mode} />

      {lastDispatch && (
        <Card title="Sent" testId="dispatch-result">
          <p className="font-body-md text-body-md">{lastDispatch.message}</p>
          <p className="font-data-mono-sm text-data-mono-sm">
            {lastDispatch.tracking_id} · audit hash {lastDispatch.audit_hash.slice(0, 16)}…
          </p>
          <Button onClick={clearLastDispatch}>Dismiss</Button>
        </Card>
      )}

      <div className="grid grid-cols-1 xl:grid-cols-12 gap-space-lg items-start">
        <div className="xl:col-span-4 flex flex-col gap-space-lg">
          <Card title={`${c.case_code} · ${c.client_name}`}>
            <p className="font-body-sm text-body-sm text-on-surface-variant">
              To {c.contact_name} ({c.contact_email}) · deadline {c.target_deadline_label}
            </p>
            <ul className="list-disc pl-space-xl font-body-sm text-body-sm">
              {c.documents
                .filter((d) => d.status === 'Missing')
                .map((d) => (
                  <li key={d.id}>{d.document_name}</li>
                ))}
            </ul>
            {c.can_create_draft ? (
              <>
                <Field label="Tone (blank = agent default)">
                  <select className={inputClass} value={tone} onChange={(e) => setTone(e.target.value)}>
                    {TONES.map((t) => (
                      <option key={t} value={t}>
                        {t || 'agent default'}
                      </option>
                    ))}
                  </select>
                </Field>
                <label className="flex items-center gap-space-xs font-body-sm text-body-sm">
                  <input type="checkbox" checked={drill} onChange={(e) => setDrill(e.target.checked)} />
                  Critic drill: inject a non-compliant sentence into draft v1
                </label>
                <Button
                  variant="primary"
                  testId="run-chaser"
                  disabled={workflow.isRunning || c.missing_count === 0}
                  onClick={() => startWorkflow(c.id, { tone: tone || undefined, simulateRejection: drill, navigate: false })}
                >
                  {workflow.isRunning ? 'Running…' : pending ? 'Prepare a new draft' : 'Prepare chase draft'}
                </Button>
              </>
            ) : (
              <p className="font-body-sm text-body-sm text-on-surface-variant">Your role cannot prepare drafts.</p>
            )}
          </Card>

          {(workflow.isRunning || workflow.steps.length > 0) && (
            <Card title="Live run" testId="live-run">
              <div className="flex gap-space-sm flex-wrap">
                <Badge tone={workflow.isRunning ? 'info' : workflow.activeNode === 'error' ? 'fail' : 'ok'}>{workflow.activeNode}</Badge>
                {workflow.dataSource && <Badge tone={workflow.dataSource === 'mcp' ? 'ok' : 'warn'}>data via {workflow.dataSource}</Badge>}
                {workflow.engine && <Badge tone={workflow.engine.startsWith('llm') ? 'ok' : 'warn'}>{workflow.engine}</Badge>}
              </div>
              <p className="font-body-sm text-body-sm">{workflow.statusLabel}</p>
              {workflow.taskId && (
                <Button testId="view-trace" onClick={() => openTrace(workflow.taskId as number)}>
                  View full trace
                </Button>
              )}
              <TraceSteps steps={workflow.steps} />
            </Card>
          )}
        </div>

        <div className="xl:col-span-8 flex flex-col gap-space-lg">
          {workflow.isRunning && (
            <Card title="Drafting…">
              <pre className="whitespace-pre-wrap font-body-md text-body-md">{workflow.streamedText || '…'}</pre>
            </Card>
          )}

          {pending ? (
            <Card
              title={
                <span className="flex items-center gap-space-sm">
                  Draft #{pending.id} <Badge tone={statusTone(pending.status)}>pending approval</Badge>
                  <Badge tone={pending.engine.startsWith('llm') ? 'ok' : 'warn'}>{pending.engine}</Badge>
                </span>
              }
              actions={
                latestTask && (
                  <Button testId="view-trace" onClick={() => openTrace(latestTask)}>
                    View trace
                  </Button>
                )
              }
              testId="pending-draft"
            >
              <Field label="Subject">
                <input className={inputClass} value={subject} disabled={!c.can_approve} onChange={(e) => setSubject(e.target.value)} />
              </Field>
              <Field label="Body" hint={c.can_approve ? 'You may edit; the edited text is re-validated before it can be sent.' : undefined}>
                <textarea
                  data-testid="draft-body"
                  className={`${inputClass} font-body-md`}
                  rows={16}
                  value={body}
                  disabled={!c.can_approve}
                  onChange={(e) => setBody(e.target.value)}
                />
              </Field>
              <div>
                <h3 className="font-label-sm text-label-sm uppercase text-on-surface-variant mb-space-xs">
                  Validation {liveChecks ? '(your edits)' : '(agent output)'}
                </h3>
                <Checks checks={checks} />
              </div>
              {err && <p className="text-error font-body-sm text-body-sm" role="alert">{err}</p>}
              <div className="flex gap-space-sm flex-wrap items-center">
                {c.can_approve ? (
                  <Button
                    variant="primary"
                    testId="approve-send"
                    disabled={sending || !checksOk}
                    onClick={async () => {
                      if (!window.confirm(`Send this e-mail to ${c.contact_email} as ${me?.display_name}?`)) return;
                      setSending(true);
                      setErr(null);
                      try {
                        await approveDraft(subject, body);
                      } catch (e) {
                        setErr((e as Error).message);
                      } finally {
                        setSending(false);
                      }
                    }}
                  >
                    {sending ? 'Sending…' : 'Approve & send'}
                  </Button>
                ) : (
                  <Badge tone="warn" testId="approve-blocked">
                    Only {c.assigned_rm} can approve and send
                  </Badge>
                )}
                {hasPermission(me, 'draft:discard') && (c.can_approve || me?.permissions['draft:discard'] === 'all') && (
                  <Button
                    variant="danger"
                    onClick={() => {
                      const r = askReason('Why discard this draft? (recorded)', 3);
                      if (r) void discardDraft(r);
                    }}
                  >
                    Discard
                  </Button>
                )}
              </div>
            </Card>
          ) : (
            !workflow.isRunning && (
              <Card title="No draft pending">
                <Empty>
                  {c.missing_count === 0 ? 'Nothing is missing on this case.' : 'Run the chaser to prepare a draft for the named RM.'}
                </Empty>
              </Card>
            )
          )}

          {drafts.length > 0 && (
            <Card title="Draft history">
              <ul className="flex flex-col gap-space-xs">
                {drafts.map((d) => (
                  <li key={d.id} className="flex items-center gap-space-sm font-body-sm text-body-sm flex-wrap">
                    <span className="font-data-mono-sm text-data-mono-sm">#{d.id}</span>
                    <Badge tone={statusTone(d.status)}>{d.status.replace('_', ' ')}</Badge>
                    <span>{d.engine}</span>
                    <span className="text-on-surface-variant">{formatDateTime(d.created_at)}</span>
                    {d.edited_by_rm && <Badge tone="info">edited by RM</Badge>}
                    {d.decision_reason && <span className="text-on-surface-variant">— {d.decision_reason}</span>}
                    {d.task_id && (
                      <button type="button" className="text-accent-blue cursor-pointer" onClick={() => openTrace(d.task_id as number)}>
                        trace
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
};
