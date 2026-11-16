import { describe, expect, it } from 'vitest';

import { canView, hasPermission, NAV_ITEMS, resolveLanding, scopeLabel, visibleNav } from './access';

const rm = { landing: 'chase-queue', permissions: { 'case:read': 'own', 'draft:read': 'own', 'trace:read': 'own' } as const };
const coo = { landing: 'stage-analytics', permissions: { 'analytics:read': 'all', 'measure:read': 'all', 'cost:read': 'all' } as const };
const finance = { landing: 'ai-cost', permissions: { 'cost:read': 'all' } as const };
const mlro = {
  landing: 'audit-log',
  permissions: { 'case:read': 'all', 'audit:read': 'all', 'cost:read': 'all', 'trace:read': 'all', 'draft:read': 'all' } as const,
};

describe('role-aware navigation', () => {
  it('RM sees case screens but not cost, audit or workbench', () => {
    const ids = visibleNav(rm).map((n) => n.id);
    expect(ids).toEqual(['chase-queue', 'case-detail', 'reminder-composer', 'traces']);
    expect(canView(rm, 'ai-cost')).toBe(false);
    expect(canView(rm, 'audit-log')).toBe(false);
  });

  it('COO sees analytics, measure and cost but never case content', () => {
    const ids = visibleNav(coo).map((n) => n.id);
    expect(ids).toContain('stage-analytics');
    expect(ids).toContain('ai-cost');
    expect(ids).not.toContain('case-detail');
    expect(ids).not.toContain('reminder-composer');
  });

  it('Finance sees only AI cost', () => {
    expect(visibleNav(finance).map((n) => n.id)).toEqual(['ai-cost']);
  });

  it('every nav item maps to a permission', () => {
    for (const n of NAV_ITEMS) expect(n.permission).toMatch(/^[a-z_]+:[a-z_]+$/);
  });

  it('no session -> nothing visible', () => {
    expect(visibleNav(null)).toEqual([]);
    expect(hasPermission(undefined, 'case:read')).toBe(false);
  });
});

describe('landing resolution', () => {
  it('uses the server landing when allowed', () => {
    expect(resolveLanding(mlro)).toBe('audit-log');
    expect(resolveLanding(finance)).toBe('ai-cost');
  });
  it('falls back to the first visible screen when the landing is not allowed', () => {
    expect(resolveLanding({ ...coo, landing: 'agent-workbench' })).toBe('stage-analytics');
  });
  it('returns null without a user or without any screen', () => {
    expect(resolveLanding(null)).toBeNull();
    expect(resolveLanding({ landing: 'chase-queue', permissions: {} })).toBeNull();
  });
  it('labels scopes', () => {
    expect(scopeLabel('own')).toBe('own cases');
    expect(scopeLabel('all')).toBe('all');
    expect(scopeLabel(undefined)).toBe('—');
  });
});
