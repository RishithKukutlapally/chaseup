import { describe, expect, it } from 'vitest';

import type { TraceStep } from '../types/chasezero';
import { claudeDesktopConfig, claudeStdioConfig, DEFAULT_MCP_URL } from './mcpSnippet';
import { stepLabel, summariseTrace } from './trace';

const step = (n: number, s: string, status: string, label: string, data: Record<string, unknown> = {}): TraceStep => ({
  n,
  step: s,
  status,
  label,
  t_ms: n * 10,
  at: '2026-11-16T00:00:00Z',
  data,
});

const trace: TraceStep[] = [
  step(1, 'plan', 'info', 'Plan'),
  step(2, 'data_source', 'ok', 'Case data fetched through MCP tools get_case + list_missing_documents'),
  step(3, 'redaction', 'ok', 'Redacted 5'),
  step(4, 'model_call', 'warn', 'sim', { model: 'gemini-3.1-flash-lite', input_tokens: 400, output_tokens: 200, cost_usd: 0.0004, simulated: true }),
  step(5, 'critic_verdict', 'fail', 'REJECT'),
  step(6, 'model_call', 'ok', 'real', { model: 'gemini-3.1-flash-lite', input_tokens: 100, output_tokens: 50, cost_usd: 0.0001 }),
  step(7, 'model_call', 'fail', 'failed', { error: 'timeout' }),
  step(8, 'critic_verdict', 'ok', 'PASS'),
  step(9, 'handoff', 'ok', 'Draft #1 pending approval'),
];

describe('trace summary', () => {
  it('counts calls, tokens, cost and the final verdict', () => {
    const s = summariseTrace(trace);
    expect(s.modelCalls).toBe(3);
    expect(s.simulatedCalls).toBe(1);
    expect(s.failedCalls).toBe(1);
    expect(s.inputTokens).toBe(500);
    expect(s.outputTokens).toBe(250);
    expect(s.costUsd).toBeCloseTo(0.0005, 8);
    expect(s.dataSource).toBe('mcp');
    expect(s.verdict).toBe('pass');
    expect(s.handedOff).toBe(true);
  });
  it('detects the direct-DB fallback and synthetic test runs', () => {
    expect(summariseTrace([step(1, 'data_source', 'warn', 'MCP unavailable (X); used direct DB access')]).dataSource).toBe('direct');
    expect(summariseTrace([step(1, 'data_source', 'info', 'Synthetic test case')]).dataSource).toBe('synthetic');
    expect(summariseTrace([]).verdict).toBe('none');
  });
  it('labels steps', () => {
    expect(stepLabel('prompt')).toBe('Exact prompt sent');
    expect(stepLabel('unknown_step')).toBe('unknown_step');
  });
});

describe('MCP client config snippet', () => {
  it('builds a Claude Desktop HTTP config with a bearer header', () => {
    const cfg = JSON.parse(claudeDesktopConfig('ngmcp_abc'));
    expect(cfg.mcpServers.chaseup.url).toBe(DEFAULT_MCP_URL);
    expect(cfg.mcpServers.chaseup.headers.Authorization).toBe('Bearer ngmcp_abc');
  });
  it('builds a stdio config that passes the token via env', () => {
    const cfg = JSON.parse(claudeStdioConfig('ngmcp_abc', 'C:/repo/backend'));
    expect(cfg.mcpServers.chaseup.command).toBe('uv');
    expect(cfg.mcpServers.chaseup.args).toContain('app.mcp_server');
    expect(cfg.mcpServers.chaseup.env.CHASEZERO_MCP_TOKEN).toBe('ngmcp_abc');
  });
});
