import type { Me } from '../types';

export const VERTICAL_IDS = ['engineering', 'architecture', 'product', 'business', 'security', 'data', 'operations'] as const;

export type Route =
  | { view: 'my-cases' }
  | { view: 'queue' }
  | { view: 'case'; id: number; prepare?: boolean }
  | { view: 'agent-settings' }
  | { view: 'dashboards' }
  | { view: 'dash'; id: string };

export interface NavItem {
  hash: string;
  label: string;
  testId: string;
}

export function can(me: Me | null, permission: string): boolean {
  return Boolean(me && me.permissions[permission]);
}

export function hasInsights(me: Me | null): boolean {
  return Boolean(me && Object.keys(me.permissions).some((p) => p.startsWith('insights:')));
}

export function casesHash(me: Me | null): string | null {
  if (!can(me, 'case:read')) return null;
  return me!.permissions['case:read'] === 'own' ? '#my-cases' : '#queue';
}

/** Parse location.hash; unknown values return null so the caller falls back to the landing page. */
export function parseHash(hash: string): Route | null {
  const h = hash.replace(/^#/, '');
  if (h === 'my-cases' || h === 'queue' || h === 'agent-settings' || h === 'dashboards') return { view: h };
  const c = /^case-(\d+)(\?prepare)?$/.exec(h);
  if (c) return { view: 'case', id: Number(c[1]), prepare: Boolean(c[2]) };
  const d = /^dash-([a-z]+)$/.exec(h);
  if (d && (VERTICAL_IDS as readonly string[]).includes(d[1])) return { view: 'dash', id: d[1] };
  return null;
}

/** The hash a user starts on. Understands both the new and the older landing names. */
export function landingHash(me: Me): string {
  const l = me.landing;
  if (parseHash(`#${l}`)) return `#${l}`;
  if (l === 'agent-workbench') return '#agent-settings';
  if (l === 'chase-queue') return casesHash(me) ?? '#dashboards';
  return hasInsights(me) ? '#dashboards' : casesHash(me) ?? '#dashboards';
}

export function navItems(me: Me | null): NavItem[] {
  const items: NavItem[] = [];
  const ch = casesHash(me);
  if (ch === '#my-cases') items.push({ hash: ch, label: 'My cases', testId: 'nav-my-cases' });
  if (ch === '#queue') items.push({ hash: ch, label: 'Queue', testId: 'nav-queue' });
  if (can(me, 'agent:edit_config')) items.push({ hash: '#agent-settings', label: 'Agent settings', testId: 'nav-agent-settings' });
  if (hasInsights(me)) items.push({ hash: '#dashboards', label: 'Dashboards', testId: 'nav-dashboards' });
  return items;
}

/** Is a route allowed for this user? Used to bounce people off pages they cannot use. */
export function allowed(me: Me, route: Route): boolean {
  switch (route.view) {
    case 'my-cases':
    case 'queue':
    case 'case':
      return can(me, 'case:read');
    case 'agent-settings':
      return can(me, 'agent:edit_config');
    case 'dashboards':
    case 'dash':
      return hasInsights(me);
  }
}

export function activeNav(route: Route | null): string {
  if (!route) return '';
  if (route.view === 'case') return '';
  if (route.view === 'dash') return '#dashboards';
  return `#${route.view}`;
}
