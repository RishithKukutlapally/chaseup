import { describe, expect, it } from 'vitest';

import { budgetPct, formatInr, formatTokens, formatUsd, shortHash, usdToInr } from './format';
import { configChanges } from './agentForm';
import { errorText } from '../api/client';

describe('cost formatting', () => {
  it('shows sub-cent LLM costs with enough precision', () => {
    expect(formatUsd(0.00042425)).toBe('$0.000424');
    expect(formatUsd(0.0123)).toBe('$0.0123');
    expect(formatUsd(12.5)).toBe('$12.50');
    expect(formatUsd(0)).toBe('$0.00');
    expect(formatUsd(undefined)).toBe('$0.00');
  });
  it('formats INR and converts at the given FX', () => {
    expect(formatInr(0.1011)).toBe('₹0.1011');
    expect(formatInr(88)).toBe('₹88.00');
    expect(usdToInr(0.001148, 88)).toBeCloseTo(0.101, 3);
  });
  it('formats tokens and hashes', () => {
    expect(formatTokens(950)).toBe('950');
    expect(formatTokens(1888)).toBe('1.9k');
    expect(shortHash('abcdef0123456789', 6)).toBe('abcdef…');
    expect(shortHash(null)).toBe('—');
  });
  it('budget percentage is clamped and a zero cap counts as exhausted', () => {
    expect(budgetPct(5, 25)).toBe(20);
    expect(budgetPct(30, 25)).toBe(100);
    expect(budgetPct(0, 0)).toBe(100);
    expect(budgetPct(1, null)).toBe(0);
  });
});

describe('agent config diff', () => {
  const cur = {
    system_prompt: 'You are the chase assistant.',
    tone: 'institutional',
    primary_model: 'gemini-3.1-flash-lite',
    fallback_model: 'gemini-3.5-flash-lite',
    temperature: 0.3,
    timeout_s: 20,
  };
  it('sends only changed fields', () => {
    expect(configChanges(cur, { ...cur })).toEqual({});
    expect(configChanges(cur, { ...cur, tone: 'casual', temperature: 0.5 })).toEqual({ tone: 'casual', temperature: 0.5 });
  });
  it('ignores whitespace-only prompt edits', () => {
    expect(configChanges(cur, { ...cur, system_prompt: `${cur.system_prompt}  ` })).toEqual({});
  });
});

describe('API error text', () => {
  it('surfaces the server 403 detail', () => {
    expect(errorText(403, JSON.stringify({ detail: "Role 'KYC Ops Coordinator' lacks 'draft:approve_send'" }))).toContain(
      'draft:approve_send'
    );
  });
  it('joins pydantic validation errors', () => {
    expect(errorText(422, JSON.stringify({ detail: [{ msg: 'Extra inputs are not permitted' }] }))).toBe(
      'Extra inputs are not permitted'
    );
  });
  it('falls back for non-JSON bodies', () => {
    expect(errorText(403, '')).toMatch(/permission/);
    expect(errorText(500, 'boom')).toBe('boom');
  });
});
