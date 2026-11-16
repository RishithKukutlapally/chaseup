import type { Me, ViewId } from '../types/chasezero';

export interface NavItem {
  id: ViewId;
  label: string;
  permission: string;
}

/** Order = order in the header. Each screen is shown only if the user holds its permission. */
export const NAV_ITEMS: NavItem[] = [
  { id: 'chase-queue', label: 'Chase Queue', permission: 'case:read' },
  { id: 'case-detail', label: 'Case Detail', permission: 'case:read' },
  { id: 'reminder-composer', label: 'Reminder Composer', permission: 'draft:read' },
  { id: 'analyst-handoff', label: 'Analyst Handoff', permission: 'analyst:request_from_rm' },
  { id: 'stage-analytics', label: 'Stage Analytics', permission: 'analytics:read' },
  { id: 'measure', label: 'Measure', permission: 'measure:read' },
  { id: 'ai-cost', label: 'AI Cost & Governance', permission: 'cost:read' },
  { id: 'agent-workbench', label: 'Agent Workbench', permission: 'agent:read_config' },
  { id: 'audit-log', label: 'Audit Log', permission: 'audit:read' },
  { id: 'traces', label: 'Agent Traces', permission: 'trace:read' },
];

export function hasPermission(me: Pick<Me, 'permissions'> | null | undefined, permission: string): boolean {
  return Boolean(me && me.permissions && me.permissions[permission]);
}

export function visibleNav(me: Pick<Me, 'permissions'> | null | undefined): NavItem[] {
  return NAV_ITEMS.filter((n) => hasPermission(me, n.permission));
}

export function canView(me: Pick<Me, 'permissions'> | null | undefined, view: ViewId): boolean {
  const item = NAV_ITEMS.find((n) => n.id === view);
  return Boolean(item && hasPermission(me, item.permission));
}

/** Server-suggested landing if allowed, otherwise the first screen the user may see. */
export function resolveLanding(me: Pick<Me, 'permissions' | 'landing'> | null | undefined): ViewId | null {
  if (!me) return null;
  const landing = me.landing as ViewId;
  if (canView(me, landing)) return landing;
  return visibleNav(me)[0]?.id ?? null;
}

export function scopeLabel(scope: string | undefined): string {
  if (scope === 'own') return 'own cases';
  if (scope === 'all') return 'all';
  return '—';
}
