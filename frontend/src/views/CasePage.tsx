import React, { useCallback, useEffect, useRef, useState } from 'react';

import { api } from '../api';
import { Button, Card, Chip, ErrorBanner, Loading, ReasonRow } from '../components/ui';
import { checkProblems, daysLabel, formatDate, formatDateTime, plainStep, TONES } from '../lib/format';
import { can } from '../lib/routing';
import type { CheckLike, Doc, Draft, KycCase, Me, TraceStep } from '../types';

const STEPS = ['Reading the case', 'Writing the email', 'Checking it', 'Ready for review'];

interface Prep {
  running: boolean;
  step: number;
  preview: string;
  error: string | null;
}
const idlePrep: Prep = { running: false, step: -1, preview: '', error: null };

function docChip(d: Doc) {
  if (d.status === 'Received') return <Chip tone="good">Received</Chip>;
  if (d.status === 'Waived') return <Chip tone="info">Waived</Chip>;
  return <Chip tone={d.overdue ? 'bad' : 'warn'}>Missing</Chip>;
}

export const CasePage: React.FC<{ me: Me; id: number; autoPrepare: boolean; backHash: string }> = ({ me, id, autoPrepare, backHash }) => {
  const [c, setC] = useState<KycCase | null>(null);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [checks, setChecks] = useState<CheckLike[]>([]);
  const [checking, setChecking] = useState(false);
  const [tone, setTone] = useState('');
  const [prep, setPrep] = useState<Prep>(idlePrep);
  const [taskId, setTaskId] = useState<number | null>(null);
  const [confirmSend, setConfirmSend] = useState(false);
  const [discarding, setDiscarding] = useState(false);
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState<string | null>(null);
  const [docAction, setDocAction] = useState<{ docId: number; kind: 'waive' } | null>(null);
  const [trace, setTrace] = useState<TraceStep[] | null>(null);
  const esRef = useRef<EventSource | null>(null);
  const autoStarted = useRef(false);

  const canReadDrafts = can(me, 'draft:read');
  const pending = drafts.find((d) => d.status === 'pending_approval') ?? null;

  const load = useCallback(async () => {
    try {
      const kc = await api.getCase(id);
      setC(kc);
      if (canReadDrafts) {
        const ds = await api.drafts(id);
        setDrafts(ds);
        const p = ds.find((d) => d.status === 'pending_approval');
        if (p) {
          setSubject(p.subject);
          setBody(p.body);
          setChecks(p.validation);
          setTaskId(p.task_id);
        }
      }
    } catch (e) {
      setError((e as Error).message);
    }
  }, [id, canReadDrafts]);

  useEffect(() => {
    void load();
    return () => esRef.current?.close();
  }, [load]);

  // Re-check edits against the bank's rules (debounced).
  useEffect(() => {
    if (!pending || !c?.can_approve) return;
    if (body === pending.body) {
      setChecks(pending.validation);
      return;
    }
    setChecking(true);
    const t = window.setTimeout(() => {
      api
        .recheck(id, body)
        .then(setChecks)
        .catch(() => undefined)
        .finally(() => setChecking(false));
    }, 500);
    return () => window.clearTimeout(t);
  }, [body, pending, id, c?.can_approve]);

  const prepare = useCallback(() => {
    esRef.current?.close();
    setError(null);
    setSent(null);
    setTrace(null);
    setPrep({ running: true, step: 0, preview: '', error: null });
    const es = new EventSource(api.streamUrl(id, tone || undefined), { withCredentials: true });
    esRef.current = es;
    let done = false;
    es.onmessage = (msg) => {
      const ev = JSON.parse(msg.data) as Record<string, unknown> & { type: string };
      if (ev.type === 'orchestrator_result') setPrep((p) => ({ ...p, step: 1 }));
      else if (ev.type === 'node_start' && ev.node === 'drafter') setPrep((p) => ({ ...p, step: 1, preview: '' }));
      else if (ev.type === 'draft_token') setPrep((p) => ({ ...p, preview: p.preview + String(ev.chunk ?? '') }));
      else if (ev.type === 'draft_complete') setPrep((p) => ({ ...p, step: 2, preview: String(ev.body ?? p.preview) }));
      else if (ev.type === 'workflow_complete') {
        done = true;
        es.close();
        setTaskId(typeof ev.task_id === 'number' ? ev.task_id : null);
        setPrep((p) => ({ ...p, running: false, step: 3 }));
        void load();
      } else if (ev.type === 'error') {
        done = true;
        es.close();
        setPrep((p) => ({ ...p, running: false, error: String(ev.message ?? 'Could not prepare the reminder.') }));
      }
    };
    es.onerror = () => {
      if (done) return;
      es.close();
      setPrep((p) => ({ ...p, running: false, error: 'Connection lost while preparing the reminder. Please try again.' }));
    };
  }, [id, tone, load]);

  useEffect(() => {
    if (autoPrepare && c && !autoStarted.current && c.can_create_draft && !pending && c.missing_count > 0) {
      autoStarted.current = true;
      history.replaceState(null, '', `#case-${id}`);
      prepare();
    }
  }, [autoPrepare, c, pending, prepare, id]);

  if (error && !c) return <div className="page"><ErrorBanner message={error} /></div>;
  if (!c) return <div className="page"><Loading /></div>;

  const problems = checkProblems(checks);
  const isOps = c.can_update_documents;
  const missing = c.documents.filter((d) => d.status === 'Missing');

  const send = async () => {
    if (!pending) return;
    setBusy(true);
    setError(null);
    try {
      const r = await api.approve(pending.id, subject, body);
      setConfirmSend(false);
      setSent(`Sent to ${c.contact_email} · logged in the audit trail`);
      setC(r.case);
      setDrafts(await api.drafts(id));
    } catch (e) {
      setError((e as Error).message);
      setConfirmSend(false);
    } finally {
      setBusy(false);
    }
  };

  const discard = async (reason: string) => {
    if (!pending) return;
    setBusy(true);
    try {
      await api.discard(pending.id, reason);
      setDiscarding(false);
      setSubject('');
      setBody('');
      setChecks([]);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const setDoc = async (doc: Doc, status: 'received' | 'waived' | 'missing', reason: string) => {
    setBusy(true);
    setError(null);
    try {
      setC(await api.setDocStatus(c.id, doc.id, status, reason));
      setDocAction(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const showTrace = async () => {
    if (!taskId || trace) return;
    try {
      setTrace((await api.trace(taskId)).steps);
    } catch {
      setTrace([]);
    }
  };

  const reminderPanel = () => {
    if (sent) {
      return (
        <div className="sent" data-testid="sent-panel">
          <div className="tick" aria-hidden="true">✓</div>
          <h2>Reminder sent</h2>
          <p className="muted">{sent}</p>
          <Button onClick={() => (location.hash = backHash)}>Back to {backHash === '#my-cases' ? 'my cases' : 'the queue'}</Button>
        </div>
      );
    }
    if (prep.running || (prep.step >= 0 && !pending)) {
      return (
        <div className="stack" data-testid="preparing">
          <ol className="steps" aria-label="Progress">
            {STEPS.map((s, i) => (
              <li key={s} className={i < prep.step || (i === 3 && prep.step === 3) ? 'done' : i === prep.step ? 'now' : ''}>
                <i />
                {s}
              </li>
            ))}
          </ol>
          {prep.error && <ErrorBanner message={prep.error} />}
          <div className="preview" aria-live="polite">{prep.preview || 'Gathering the missing documents for this case…'}</div>
        </div>
      );
    }
    if (pending) {
      return (
        <div className="stack" data-testid="pending-draft">
          <p className="to">
            To <b>{c.contact_name}</b> · {c.contact_email}
          </p>
          <div className="field">
            <label htmlFor="mail-subject">Subject</label>
            <input id="mail-subject" className="input" value={subject} disabled={!c.can_approve} onChange={(e) => setSubject(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="mail-body">Message</label>
            <textarea
              id="mail-body"
              className="textarea mail"
              value={body}
              disabled={!c.can_approve}
              onChange={(e) => setBody(e.target.value)}
              data-testid="draft-body"
            />
          </div>
          {problems.length === 0 ? (
            <div className="banner good" data-testid="checks-ok">
              <b>{checking ? 'Checking your edits…' : 'Ready to send · all checks passed'}</b>
              <span className="small">Every missing document, the deadline and your name are in. No promises, amounts or extra links.</span>
            </div>
          ) : (
            <div className="banner warn" data-testid="checks-problems">
              <b>{checking ? 'Checking your edits…' : 'Fix these before sending'}</b>
              <ul>
                {problems.map((p) => (
                  <li key={p}>{p}</li>
                ))}
              </ul>
            </div>
          )}
          {confirmSend ? (
            <div className="confirm" data-testid="confirm-send">
              <span>
                Send to <b>{c.contact_email}</b> as <b>{me.display_name}</b>?
              </span>
              <div className="row">
                <Button variant="primary" onClick={() => void send()} disabled={busy} testId="send-now">
                  {busy ? 'Sending…' : 'Send now'}
                </Button>
                <Button variant="ghost" onClick={() => setConfirmSend(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : discarding ? (
            <ReasonRow
              id="discard-reason"
              label="Why are you discarding this reminder?"
              placeholder="e.g. Client called; documents are on the way"
              confirmLabel="Discard"
              busy={busy}
              onConfirm={(r) => void discard(r)}
              onCancel={() => setDiscarding(false)}
              testId="discard"
            />
          ) : (
            <div className="row">
              {c.can_approve ? (
                <Button
                  variant="primary"
                  size="big"
                  disabled={problems.length > 0 || checking}
                  onClick={() => setConfirmSend(true)}
                  testId="approve-send"
                >
                  Approve & send
                </Button>
              ) : (
                <span className="small muted" data-testid="approve-blocked">
                  Only {c.assigned_rm} can send this.
                </span>
              )}
              {can(me, 'draft:discard') && (
                <Button variant="ghost" onClick={() => setDiscarding(true)} testId="discard-open">
                  Discard
                </Button>
              )}
            </div>
          )}
        </div>
      );
    }
    if (c.missing_count === 0) {
      return <p className="muted">Nothing is missing on this case, so no reminder is needed.</p>;
    }
    return (
      <div className="stack" style={{ alignItems: 'flex-start' }} data-testid="no-draft">
        <p className="muted">
          {c.status === 'Completed'
            ? `Last reminder sent on ${formatDate(c.last_contact_date)}. ${missing.length} document${missing.length === 1 ? ' is' : 's are'} still missing.`
            : `We'll write one email that asks ${c.contact_name} for all ${missing.length} missing document${missing.length === 1 ? '' : 's'} at once.`}
        </p>
        {c.can_create_draft ? (
          <Button variant="primary" size="big" onClick={prepare} testId="run-chaser">
            Prepare reminder
          </Button>
        ) : (
          <span className="small muted">You can view this case but not prepare reminders.</span>
        )}
      </div>
    );
  };

  return (
    <div className="page">
      <div className="phead">
        <div className="t">
          <a className="back" href={backHash}>
            ← {backHash === '#my-cases' ? 'My cases' : backHash === '#queue' ? 'Queue' : 'Back'}
          </a>
          <h1>{c.client_name}</h1>
          <p>
            <span className="mono small">{c.case_code}</span> · Relationship Manager {c.assigned_rm} · Deadline {c.target_deadline_label}
          </p>
        </div>
        {c.missing_count > 0 && <Chip tone={c.sla_breached ? 'bad' : 'warn'}>Waiting {daysLabel(c.oldest_missing_days)}</Chip>}
      </div>
      <ErrorBanner message={error} />
      <div className="case-layout">
        <div className="stack">
          <Card title="What's missing" aside={<span className="small dim">{c.missing_count} of {c.documents.length} outstanding</span>} testId="checklist">
            <ul className="docs">
              {c.documents.map((d) => (
                <li key={d.id} data-testid={`doc-${d.id}`}>
                  <div className="dn">
                    <b>{d.document_name}</b>
                    {docChip(d)}
                  </div>
                  <span className="meta">
                    {d.status === 'Missing'
                      ? `Requested ${daysLabel(d.days_waiting)} ago`
                      : d.status === 'Waived'
                        ? `Waived: ${d.waived_reason ?? ''}`
                        : `Received ${formatDate(d.received_at)}${d.status_changed_by ? ` · logged by ${d.status_changed_by}` : ''}`}
                  </span>
                  {isOps && docAction?.docId === d.id ? (
                    <ReasonRow
                      id={`waive-${d.id}`}
                      label="Reason for waiving"
                      placeholder="e.g. Held on file from 2023 onboarding"
                      confirmLabel="Waive"
                      busy={busy}
                      onConfirm={(r) => void setDoc(d, 'waived', r)}
                      onCancel={() => setDocAction(null)}
                      testId={`waive-${d.id}`}
                    />
                  ) : (
                    isOps && (
                      <div className="row">
                        {d.status === 'Missing' ? (
                          <>
                            <Button size="sm" onClick={() => void setDoc(d, 'received', '')} disabled={busy} testId={`receive-${d.id}`}>
                              Mark received
                            </Button>
                            <Button size="sm" variant="ghost" onClick={() => setDocAction({ docId: d.id, kind: 'waive' })}>
                              Waive…
                            </Button>
                          </>
                        ) : (
                          <Button size="sm" variant="ghost" onClick={() => void setDoc(d, 'missing', 'Asked the client again')} disabled={busy}>
                            Ask again
                          </Button>
                        )}
                      </div>
                    )
                  )}
                </li>
              ))}
            </ul>
          </Card>
          {c.actions && c.actions.length > 0 && (
            <Card title="Recent activity">
              <ul className="timeline">
                {c.actions.slice(0, 6).map((a) => (
                  <li key={a.id}>
                    <time>{formatDateTime(a.timestamp)}</time>
                    <span>{a.details}</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>

        {canReadDrafts && (
          <Card
            title="Reminder email"
            aside={
              pending && !sent && !prep.running && c.can_create_draft ? (
                <div className="row">
                  <select className="select" style={{ width: 'auto' }} value={tone} onChange={(e) => setTone(e.target.value)} aria-label="Tone">
                    <option value="">Default tone</option>
                    {TONES.map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                  <Button size="sm" onClick={prepare} testId="new-version">
                    Prepare a new version
                  </Button>
                </div>
              ) : null
            }
            testId="reminder"
          >
            {reminderPanel()}
            {taskId && can(me, 'trace:read') && !prep.running && (
              <details className="how" onToggle={(e) => (e.currentTarget.open ? void showTrace() : undefined)} data-testid="how-made">
                <summary>How was this made?</summary>
                {trace === null ? (
                  <p className="small dim">Loading…</p>
                ) : (
                  <ol data-testid="trace-steps">
                    {trace
                      .filter((s) => s.step !== 'prompt')
                      .map((s) => (
                        <li key={s.n} className={s.status === 'fail' ? 'fail' : s.status === 'warn' ? 'warn' : ''}>
                          {plainStep(s.step, s.label)}
                        </li>
                      ))}
                  </ol>
                )}
              </details>
            )}
          </Card>
        )}
      </div>
    </div>
  );
};
