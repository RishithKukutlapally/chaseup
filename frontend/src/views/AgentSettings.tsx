import React, { useCallback, useEffect, useState } from 'react';

import { api } from '../api';
import { Button, Card, Chip, ErrorBanner, Field, Loading, ReasonRow } from '../components/ui';
import { checkProblems, formatDateTime, TONES } from '../lib/format';
import type { AgentSettings as Settings, AgentsOverview, AgentVersion, TestRunResult } from '../types';

const AGENT = 'drafter';
type Pending = { kind: 'enabled' | 'simulate_primary_outage'; value: boolean } | { kind: 'restore'; version: number } | null;

export const AgentSettings: React.FC = () => {
  const [overview, setOverview] = useState<AgentsOverview | null>(null);
  const [versions, setVersions] = useState<AgentVersion[]>([]);
  const [form, setForm] = useState<Pick<Settings, 'system_prompt' | 'tone' | 'primary_model' | 'fallback_model'> | null>(null);
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [test, setTest] = useState<TestRunResult | null>(null);
  const [testing, setTesting] = useState(false);
  const [pending, setPending] = useState<Pending>(null);

  const load = useCallback(async () => {
    try {
      const [o, v] = await Promise.all([api.agents(), api.versions(AGENT)]);
      setOverview(o);
      setVersions(v);
      const s = o.agents.find((a) => a.agent === AGENT)!.settings;
      setForm({ system_prompt: s.system_prompt, tone: s.tone, primary_model: s.primary_model, fallback_model: s.fallback_model });
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);
  useEffect(() => void load(), [load]);

  if (!overview || !form) return <div className="page">{error ? <ErrorBanner message={error} /> : <Loading />}</div>;

  const current = overview.agents.find((a) => a.agent === AGENT)!.settings;
  const rights = new Set(overview.your_field_rights);
  const changes = Object.fromEntries(
    (Object.keys(form) as (keyof typeof form)[]).filter((k) => form[k] !== current[k]).map((k) => [k, form[k]])
  );
  const dirty = Object.keys(changes).length > 0;

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      await fn();
      setNotice(ok);
      await load();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const save = () =>
    run(async () => {
      await api.saveConfig(AGENT, changes, reason.trim());
      setReason('');
    }, 'Saved as a new version. The next reminder uses it, no restart needed.');

  const tryIt = async () => {
    setTesting(true);
    setError(null);
    setTest(null);
    try {
      setTest(await api.testRun(AGENT, changes));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setTesting(false);
    }
  };

  const confirmPending = (why: string) => {
    if (!pending) return;
    const p = pending;
    setPending(null);
    if (p.kind === 'restore') void run(() => api.restore(AGENT, p.version, why), `Restored version ${p.version} as a new version.`);
    else void run(() => api.controls(AGENT, { [p.kind]: p.value }, why), 'Setting updated.');
  };

  const testProblems = test?.checks ? checkProblems(test.checks) : [];

  return (
    <div className="page">
      <div className="phead">
        <div className="t">
          <h1>Agent settings</h1>
          <p>Change how the reminder-writing agent behaves. Every change is saved as a version with your reason, and applies to the very next reminder.</p>
        </div>
        <div className="row">
          <Chip tone={current.enabled ? 'good' : 'bad'}>{current.enabled ? 'Agent on' : 'Agent off'}</Chip>
          <Chip tone={overview.live_mode ? 'info' : 'warn'}>{overview.live_mode ? 'Live AI' : 'Simulated AI'}</Chip>
          <span className="small dim">Version {current.version}</span>
        </div>
      </div>
      <ErrorBanner message={error} />
      {notice && (
        <div className="banner good" role="status" data-testid="agent-notice">
          {notice}
        </div>
      )}

      <div className="settings">
        <div className="stack">
          <Card title="Reminder-writing agent" testId="agent-config">
            <Field label="Instructions" htmlFor="agent-prompt" hint="Safety rules are always added on top of these and cannot be removed.">
              <textarea
                id="agent-prompt"
                className="textarea"
                style={{ minHeight: 200 }}
                value={form.system_prompt}
                disabled={!rights.has('system_prompt')}
                onChange={(e) => setForm({ ...form, system_prompt: e.target.value })}
                data-testid="agent-prompt"
              />
            </Field>
            <div className="two">
              <Field label="Tone" htmlFor="agent-tone">
                <select id="agent-tone" className="select" value={form.tone} disabled={!rights.has('tone')} onChange={(e) => setForm({ ...form, tone: e.target.value })}>
                  {TONES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </Field>
              <div />
              <Field label="Main AI model" htmlFor="agent-primary">
                <select
                  id="agent-primary"
                  className="select"
                  value={form.primary_model}
                  disabled={!rights.has('primary_model')}
                  onChange={(e) => setForm({ ...form, primary_model: e.target.value })}
                >
                  {overview.models.map((m) => (
                    <option key={m}>{m}</option>
                  ))}
                </select>
              </Field>
              <Field label="Backup model (if the main one fails)" htmlFor="agent-fallback">
                <select
                  id="agent-fallback"
                  className="select"
                  value={form.fallback_model}
                  disabled={!rights.has('fallback_model')}
                  onChange={(e) => setForm({ ...form, fallback_model: e.target.value })}
                >
                  {overview.models.map((m) => (
                    <option key={m}>{m}</option>
                  ))}
                </select>
              </Field>
            </div>
            <Field label="Why are you changing this?" htmlFor="agent-reason">
              <input
                id="agent-reason"
                className="input"
                value={reason}
                placeholder="e.g. RMs asked for a shorter opening line"
                onChange={(e) => setReason(e.target.value)}
                data-testid="agent-reason"
              />
            </Field>
            <div className="row">
              <Button variant="primary" disabled={!dirty || reason.trim().length < 5 || busy} onClick={() => void save()} testId="agent-save">
                Save new version
              </Button>
              <Button onClick={() => void tryIt()} disabled={testing} testId="agent-test">
                {testing ? 'Writing a sample…' : 'Try it on a sample case'}
              </Button>
              {dirty && <span className="small dim">Unsaved changes</span>}
            </div>
            <details className="how">
              <summary>Safety rules added to every request</summary>
              <pre className="guard">{overview.fixed_guardrails}</pre>
            </details>
          </Card>

          {test && (
            <Card title="Sample result (nothing saved or sent)" testId="agent-test-result">
              <p className="small muted">
                <b>Subject:</b> {test.subject}
              </p>
              <div className="preview">{test.body}</div>
              {testProblems.length === 0 ? (
                <div className="banner good">
                  <b>All checks passed</b>
                </div>
              ) : (
                <div className="banner warn">
                  <b>Problems found</b>
                  <ul>
                    {testProblems.map((p) => (
                      <li key={p}>{p}</li>
                    ))}
                  </ul>
                </div>
              )}
            </Card>
          )}
        </div>

        <div className="stack">
          <Card title="Switches">
            <div className="switch">
              <div className="l">
                <b>Agent on</b>
                <span>When off, RMs get the approved template instead of an AI draft.</span>
              </div>
              <button
                type="button"
                className="toggle"
                role="switch"
                aria-checked={current.enabled}
                aria-label="Agent on"
                disabled={!rights.has('enabled') || busy}
                onClick={() => setPending({ kind: 'enabled', value: !current.enabled })}
                data-testid="kill-switch"
              />
            </div>
            <div className="switch">
              <div className="l">
                <b>Practice an outage</b>
                <span>Pretend the main model is down to check the backup takes over.</span>
              </div>
              <button
                type="button"
                className="toggle"
                role="switch"
                aria-checked={current.simulate_primary_outage}
                aria-label="Practice an outage"
                disabled={!rights.has('simulate_primary_outage') || busy}
                onClick={() => setPending({ kind: 'simulate_primary_outage', value: !current.simulate_primary_outage })}
                data-testid="outage-drill"
              />
            </div>
            {pending && pending.kind !== 'restore' && (
              <ReasonRow
                id="switch-reason"
                label="Reason for this change"
                confirmLabel="Confirm"
                busy={busy}
                onConfirm={confirmPending}
                onCancel={() => setPending(null)}
                testId="switch-reason"
              />
            )}
          </Card>

          <Card title="Version history" aside={<span className="small dim">{versions.length} versions</span>} testId="agent-versions">
            {pending?.kind === 'restore' && (
              <ReasonRow
                id="restore-reason"
                label={`Reason for restoring version ${pending.version}`}
                confirmLabel="Restore"
                busy={busy}
                onConfirm={confirmPending}
                onCancel={() => setPending(null)}
                testId="restore-reason"
              />
            )}
            <ul className="versions">
              {versions.map((v) => (
                <li key={v.version}>
                  <div>
                    <b>v{v.version}</b> {v.reason}
                    <small>
                      {v.created_by} · {formatDateTime(v.created_at)}
                      {v.restored_from_version ? ` · restored from v${v.restored_from_version}` : ''}
                    </small>
                  </div>
                  {v.version === current.version ? (
                    <Chip tone="good">Current</Chip>
                  ) : (
                    <Button size="sm" variant="ghost" onClick={() => setPending({ kind: 'restore', version: v.version })} testId={`restore-v${v.version}`}>
                      Restore
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          </Card>
        </div>
      </div>
    </div>
  );
};
