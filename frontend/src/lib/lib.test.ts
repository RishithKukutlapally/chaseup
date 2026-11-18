import { describe, expect, it } from 'vitest';

import type { KycCase, Me } from '../types';
import { caseStatus } from '../views/MyCases';
import { filterCases, queueChip } from '../views/Queue';
import { checkProblems, daysLabel, formatValue, plainStep } from './format';
import { activeNav, allowed, landingHash, navItems, parseHash } from './routing';
import { isNumericColumn, niceMax, parseCell, parseStatus, pct } from './widgets';

const me = (role: string, landing: string, permissions: Me['permissions']): Me => ({
  id: 1, username: role, display_name: 'Test User', role, role_label: role, title: '', landing, permissions,
});
const rm = me('rm', 'my-cases', { 'case:read': 'own', 'draft:approve_send': 'own' });
const ops = me('ops', 'queue', { 'case:read': 'all', 'insights:operations': 'all' });
const owner = me('agent_owner', 'agent-settings', { 'agent:edit_config': 'all', 'insights:engineering': 'all' });
const business = me('business', 'dashboards', { 'insights:business': 'all', 'insights:security': 'all' });

describe('routing', () => {
  it('parses every route and rejects unknown ones', () => {
    expect(parseHash('#my-cases')).toEqual({ view: 'my-cases' });
    expect(parseHash('#case-12')).toEqual({ view: 'case', id: 12, prepare: false });
    expect(parseHash('#case-3?prepare')).toEqual({ view: 'case', id: 3, prepare: true });
    expect(parseHash('#dash-security')).toEqual({ view: 'dash', id: 'security' });
    expect(parseHash('#dash-nope')).toBeNull();
    expect(parseHash('')).toBeNull();
  });

  it('lands each persona on its own page, including older landing names', () => {
    expect(landingHash(rm)).toBe('#my-cases');
    expect(landingHash(ops)).toBe('#queue');
    expect(landingHash(owner)).toBe('#agent-settings');
    expect(landingHash(me('architect', 'dash-architecture', { 'insights:architecture': 'all' }))).toBe('#dash-architecture');
    expect(landingHash(me('rm', 'chase-queue', { 'case:read': 'own' }))).toBe('#my-cases');
    expect(landingHash(me('x', 'agent-workbench', { 'agent:edit_config': 'all' }))).toBe('#agent-settings');
  });

  it('shows only the nav items a user may use', () => {
    expect(navItems(rm).map((n) => n.label)).toEqual(['My cases']);
    expect(navItems(ops).map((n) => n.label)).toEqual(['Queue', 'Dashboards']);
    expect(navItems(owner).map((n) => n.label)).toEqual(['Agent settings', 'Dashboards']);
    expect(navItems(business).map((n) => n.label)).toEqual(['Dashboards']);
  });

  it('blocks routes without permission', () => {
    expect(allowed(rm, { view: 'agent-settings' })).toBe(false);
    expect(allowed(rm, { view: 'dashboards' })).toBe(false);
    expect(allowed(business, { view: 'case', id: 1 })).toBe(false);
    expect(allowed(owner, { view: 'agent-settings' })).toBe(true);
    expect(activeNav({ view: 'dash', id: 'data' })).toBe('#dashboards');
  });
});

describe('widget cells', () => {
  it('parses numeric, status, code and text cells', () => {
    expect(parseCell('n:14 d')).toEqual({ kind: 'num', text: '14 d' });
    expect(parseCell(1200)).toEqual({ kind: 'num', text: '1,200' });
    expect(parseCell('bad:Overdue')).toEqual({ kind: 'status', status: 'bad', text: 'Overdue' });
    expect(parseCell('NCZ-2024-8841')).toEqual({ kind: 'code', text: 'NCZ-2024-8841' });
    expect(parseCell('Sarah Jenkins')).toEqual({ kind: 'text', text: 'Sarah Jenkins' });
    expect(parseStatus('meh')).toBeNull();
    expect(isNumericColumn([['a', 'n:1']], 1)).toBe(true);
    expect(isNumericColumn([['a', 'n:1']], 0)).toBe(false);
  });
  it('scales safely', () => {
    expect(niceMax(1278)).toBe(1500);
    expect(niceMax(0)).toBe(1);
    expect(pct(5, 0)).toBe(0);
    expect(pct(15, 10)).toBe(100);
  });
});

describe('formatting', () => {
  it('formats values and days', () => {
    expect(formatValue(0.214, '$', 2)).toBe('$0.21');
    expect(formatValue(64, '%')).toBe('64%');
    expect(formatValue(7.5, ' d')).toBe('7.5 d');
    expect(daysLabel(0.2)).toBe('Today');
    expect(daysLabel(1)).toBe('1 day');
    expect(daysLabel(9.4)).toBe('9 days');
  });
  it('lists only failed checks in plain words', () => {
    expect(
      checkProblems([
        { title: 'Deadline present', passed: true, detail: 'ok' },
        { title: 'No promises', passed: false, detail: 'Found: guarantee' },
        { title: 'Links', passed: false, summary: 'OK' },
      ])
    ).toEqual(['No promises: Found: guarantee', 'Links']);
    expect(plainStep('handoff', 'x')).toMatch(/Nothing was sent/);
    expect(plainStep('data_source', 'via MCP tools')).toMatch(/MCP/);
  });
});

describe('case helpers', () => {
  const base = {
    id: 1, case_code: 'NCZ-1', client_name: 'Apex', status: 'Missing_Docs', last_contact_date: '2026-11-10T00:00:00Z',
    sla_breached: false, assigned_rm: 'Sarah Jenkins', oldest_missing_days: 3, pending_draft_id: null,
  } as unknown as KycCase;
  it('describes card status', () => {
    expect(caseStatus({ ...base, pending_draft_id: 5 }).text).toBe('Reminder ready for your review');
    expect(caseStatus({ ...base, status: 'Completed' }).text).toMatch(/^Sent on /);
    expect(caseStatus(base).text).toBe('Nothing sent yet');
  });
  it('filters and sorts the queue', () => {
    const cases = [
      { ...base, id: 1, oldest_missing_days: 2 },
      { ...base, id: 2, oldest_missing_days: 9, sla_breached: true },
      { ...base, id: 3, oldest_missing_days: 5, pending_draft_id: 7, client_name: 'Helios' },
    ];
    expect(filterCases(cases, 'all', '').map((c) => c.id)).toEqual([2, 3, 1]);
    expect(filterCases(cases, 'overdue', '').map((c) => c.id)).toEqual([2]);
    expect(filterCases(cases, 'ready', '').map((c) => c.id)).toEqual([3]);
    expect(filterCases(cases, 'all', 'heli').map((c) => c.id)).toEqual([3]);
    expect(queueChip(cases[1]).text).toBe('Overdue');
    expect(queueChip(cases[2]).text).toBe('Reminder with RM');
  });
});
