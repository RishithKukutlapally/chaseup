import React, { useEffect, useMemo, useState } from 'react';

import { apiClient } from '../api/client';
import { TraceSteps } from '../components/TraceSteps';
import { askReason, Badge, Button, Card, Empty, Field, inputClass, PageHeader, SimulatedBanner, Table, Td } from '../components/ui';
import { useChaseStore } from '../store/useChaseStore';
import type { AgentSettings, AgentVersion, AgentsOverview, WorkflowRunResult } from '../types/chasezero';
import { formatDateTime } from '../utils/format';
import { configChanges, type EditableConfig } from '../utils/agentForm';

/** "Can I change the agent, and how quickly?" — edits apply on the very next call; every version is kept. */
export const AgentWorkbench: React.FC = () => {
  const { health } = useChaseStore();
  const [ov, setOv] = useState<AgentsOverview | null>(null);
  const [agent, setAgent] = useState('drafter');
  const [form, setForm] = useState<EditableConfig | null>(null);
  const [versions, setVersions] = useState<AgentVersion[]>([]);
  const [reason, setReason] = useState('');
  const [test, setTest] = useState<WorkflowRunResult | null>(null);
  const [testing, setTesting] = useState(false);
  const [drill, setDrill] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [budget, setBudget] = useState('');

  const current: AgentSettings | undefined = useMemo(() => ov?.agents.find((a) => a.agent === agent)?.settings, [ov, agent]);
  const rights = new Set(ov?.your_field_rights ?? []);

  const load = async () => {
    try {
      const o = await apiClient.agents();
      setOv(o);
      setVersions(await apiClient.agentVersions(agent));
    } catch (e) {
      setErr((e as Error).message);
    }
  };
  useEffect(() => {
    void load();
    setTest(null);
  }, [agent]);
  useEffect(() => {
    if (current) {
      setForm({
        system_prompt: current.system_prompt,
        tone: current.tone,
        primary_model: current.primary_model,
        fallback_model: current.fallback_model,
        temperature: current.temperature,
        timeout_s: current.timeout_s,
      });
      setBudget(String(current.monthly_budget_usd));
    }
  }, [current?.version, current?.agent]);

  if (err && !ov) return <Empty>{err}</Empty>;
  if (!ov || !current || !form) return <Empty>Loading…</Empty>;
  const changes = configChanges(current, form);
  const changed = Object.keys(changes).length > 0;
  const set = <K extends keyof EditableConfig>(k: K, v: EditableConfig[K]) => setForm({ ...form, [k]: v });
  const ro = (f: string) => !rights.has(f);

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setErr(null);
    setMsg(null);
    try {
      await fn();
      setMsg(ok);
      await load();
    } catch (e) {
      setErr((e as Error).message);
    }
  };

  return (
    <div className="flex flex-col gap-space-lg">
      <PageHeader
        title="Agent Workbench"
        subtitle="Change prompt, tone or models live: the next call uses the new version, no restart. Every change is a new version (who, when, why); old versions can be restored in one click."
        actions={
          <>
            <Badge tone={ov.live_mode ? 'ok' : 'warn'}>{ov.live_mode ? 'live Gemini' : 'simulated'}</Badge>
            <select className={inputClass} value={agent} onChange={(e) => setAgent(e.target.value)} aria-label="Agent">
              {ov.agents.map((a) => (
                <option key={a.agent} value={a.agent}>
                  {a.agent}
                </option>
              ))}
            </select>
          </>
        }
      />
      <SimulatedBanner mode={health?.llm_mode} />
      {msg && <p className="text-status-success font-body-sm text-body-sm" role="status">{msg}</p>}
      {err && <p className="text-error font-body-sm text-body-sm" role="alert">{err}</p>}

      <Card title="Runtime controls">
        <p className="font-body-sm text-body-sm text-on-surface-variant">
          {ov.agents.find((a) => a.agent === agent)?.description}. Fields you may change: {[...rights].join(', ') || 'none (read-only)'}.
        </p>
        <div className="flex flex-wrap gap-space-md items-end">
          <div className="flex items-center gap-space-sm">
            <Badge tone={ov.ai_feature_flag ? 'ok' : 'fail'}>AI feature flag {ov.ai_feature_flag ? 'on' : 'off'}</Badge>
            <Button
              disabled={ro('ai_feature_flag')}
              onClick={() => {
                const r = askReason(`Reason for turning the global AI flag ${ov.ai_feature_flag ? 'OFF' : 'ON'}:`);
                if (r) void run(() => apiClient.setAiFlag(!ov.ai_feature_flag, r), 'Feature flag updated');
              }}
            >
              Toggle
            </Button>
          </div>
          <div className="flex items-center gap-space-sm">
            <Badge tone={current.enabled ? 'ok' : 'fail'}>agent {current.enabled ? 'on' : 'KILLED'}</Badge>
            <Button
              variant={current.enabled ? 'danger' : 'primary'}
              testId="kill-switch"
              disabled={ro('enabled')}
              onClick={() => {
                const r = askReason(`Reason for switching '${agent}' ${current.enabled ? 'OFF' : 'ON'}:`);
                if (r) void run(() => apiClient.setAgentControls(agent, { enabled: !current.enabled }, r), 'Kill switch updated');
              }}
            >
              {current.enabled ? 'Kill switch: turn off' : 'Turn back on'}
            </Button>
          </div>
          <div className="flex items-center gap-space-sm">
            <Badge tone={current.simulate_primary_outage ? 'warn' : 'neutral'}>
              outage drill {current.simulate_primary_outage ? 'ON' : 'off'}
            </Badge>
            <Button
              testId="outage-drill"
              disabled={ro('simulate_primary_outage')}
              onClick={() => {
                const r = askReason('Reason for the primary-outage drill toggle:');
                if (r)
                  void run(
                    () => apiClient.setAgentControls(agent, { simulate_primary_outage: !current.simulate_primary_outage }, r),
                    'Outage drill updated'
                  );
              }}
            >
              Simulate primary outage
            </Button>
          </div>
          <Field label="Monthly budget cap (USD)">
            <div className="flex gap-space-xs">
              <input
                className={`${inputClass} w-28`}
                type="number"
                min={0}
                step={0.01}
                value={budget}
                disabled={ro('monthly_budget_usd')}
                onChange={(e) => setBudget(e.target.value)}
              />
              <Button
                disabled={ro('monthly_budget_usd') || Number(budget) === current.monthly_budget_usd}
                onClick={() => {
                  const r = askReason('Reason for changing the budget cap:');
                  if (r) void run(() => apiClient.setAgentControls(agent, { monthly_budget_usd: Number(budget) }, r), 'Budget updated');
                }}
              >
                Save
              </Button>
            </div>
          </Field>
        </div>
      </Card>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-space-lg items-start">
        <Card title={`Configuration — current version v${current.version}`} testId="agent-config">
          <Field label="System prompt (editable part)">
            <textarea
              data-testid="agent-prompt"
              className={`${inputClass} font-data-mono-sm text-data-mono-sm`}
              rows={9}
              value={form.system_prompt}
              disabled={ro('system_prompt')}
              onChange={(e) => set('system_prompt', e.target.value)}
            />
          </Field>
          <Field label="Fixed guardrails — appended to every prompt; cannot be edited or removed">
            <pre className="font-data-mono-sm text-data-mono-sm bg-surface-container-low p-space-sm rounded whitespace-pre-wrap">
              {ov.fixed_guardrails}
            </pre>
          </Field>
          <div className="grid grid-cols-2 gap-space-md">
            <Field label="Tone">
              <select className={inputClass} value={form.tone} disabled={ro('tone')} onChange={(e) => set('tone', e.target.value)}>
                {[...ov.tones, 'n/a'].map((t) => (
                  <option key={t}>{t}</option>
                ))}
              </select>
            </Field>
            <Field label="Temperature">
              <input
                className={inputClass}
                type="number"
                step={0.1}
                min={0}
                max={1}
                value={form.temperature}
                disabled={ro('temperature')}
                onChange={(e) => set('temperature', Number(e.target.value))}
              />
            </Field>
            <Field label="Primary model">
              <select className={inputClass} value={form.primary_model} disabled={ro('primary_model')} onChange={(e) => set('primary_model', e.target.value)}>
                {ov.models.map((m) => (
                  <option key={m}>{m}</option>
                ))}
              </select>
            </Field>
            <Field label="Fallback model">
              <select className={inputClass} value={form.fallback_model} disabled={ro('fallback_model')} onChange={(e) => set('fallback_model', e.target.value)}>
                {ov.models.map((m) => (
                  <option key={m}>{m}</option>
                ))}
              </select>
            </Field>
            <Field label="Per-call timeout (s)">
              <input
                className={inputClass}
                type="number"
                min={2}
                max={120}
                value={form.timeout_s}
                disabled={ro('timeout_s')}
                onChange={(e) => set('timeout_s', Number(e.target.value))}
              />
            </Field>
          </div>
          <Field label="Reason for this change (required, recorded)">
            <input data-testid="agent-reason" className={inputClass} value={reason} onChange={(e) => setReason(e.target.value)} />
          </Field>
          <div className="flex gap-space-sm flex-wrap">
            <Button
              testId="agent-test"
              disabled={testing || agent !== 'drafter' || ro('system_prompt')}
              onClick={async () => {
                setTesting(true);
                setErr(null);
                try {
                  setTest(await apiClient.testAgent(agent, changes, undefined, drill));
                } catch (e) {
                  setErr((e as Error).message);
                } finally {
                  setTesting(false);
                }
              }}
            >
              {testing ? 'Testing…' : 'Test on synthetic case'}
            </Button>
            <label className="flex items-center gap-space-xs font-body-sm text-body-sm">
              <input type="checkbox" checked={drill} onChange={(e) => setDrill(e.target.checked)} /> critic drill
            </label>
            <Button
              variant="primary"
              testId="agent-save"
              disabled={!changed || reason.trim().length < 5}
              onClick={() =>
                void run(async () => {
                  await apiClient.changeAgentConfig(agent, changes, reason.trim());
                  setReason('');
                }, 'Saved as a new version — applies to the next call')
              }
            >
              Save new version
            </Button>
            {changed && <Badge tone="warn">unsaved: {Object.keys(changes).join(', ')}</Badge>}
          </div>
          {agent !== 'drafter' && (
            <p className="font-body-sm text-body-sm text-on-surface-variant">The critic runs inside every drafter test run.</p>
          )}
        </Card>

        <div className="flex flex-col gap-space-lg">
          {test && (
            <Card title="Test run on synthetic case (nothing saved, nothing sent)" testId="agent-test-result">
              <div className="flex gap-space-sm flex-wrap">
                <Badge tone={test.critic_passed ? 'ok' : 'fail'}>{test.critic_passed ? 'passed' : 'failed'}</Badge>
                <Badge tone="info">{test.engine}</Badge>
              </div>
              <pre className="whitespace-pre-wrap font-body-sm text-body-sm bg-surface-container-low p-space-sm rounded">{test.body}</pre>
              <TraceSteps steps={test.trace} />
            </Card>
          )}
          <Card title="Version history (append-only)" testId="agent-versions">
            <Table head={['v', 'When', 'Who', 'Why', 'Model', 'Tone', '']}>
              {versions.map((v) => (
                <tr key={v.id}>
                  <Td mono>
                    v{v.version}
                    {v.restored_from_version && <div className="text-on-surface-variant">↺ v{v.restored_from_version}</div>}
                  </Td>
                  <Td>{formatDateTime(v.created_at)}</Td>
                  <Td>{v.created_by}</Td>
                  <Td>{v.reason}</Td>
                  <Td mono>
                    {v.primary_model}
                    <div className="text-on-surface-variant">→ {v.fallback_model}</div>
                  </Td>
                  <Td>{v.tone}</Td>
                  <Td>
                    {v.version !== current.version && (
                      <Button
                        testId={`restore-v${v.version}`}
                        disabled={!rights.has('system_prompt')}
                        title={v.system_prompt}
                        onClick={() => {
                          const r = askReason(`Reason for restoring v${v.version}:`);
                          if (r) void run(() => apiClient.restoreAgentVersion(agent, v.version, r), `Restored v${v.version} as a new version`);
                        }}
                      >
                        Restore
                      </Button>
                    )}
                    {v.version === current.version && <Badge tone="ok">current</Badge>}
                  </Td>
                </tr>
              ))}
            </Table>
          </Card>
        </div>
      </div>
    </div>
  );
};
