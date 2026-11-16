import React from 'react';
import { LogOut, ShieldCheck, Volume2, VolumeX } from 'lucide-react';

import { useChaseStore } from '../store/useChaseStore';
import type { ViewId } from '../types/chasezero';
import { visibleNav } from '../utils/access';
import { AccessDialog } from './AccessDialog';
import { Badge } from './ui';

const CASE_VIEWS: ViewId[] = ['case-detail', 'reminder-composer'];

export const Layout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const {
    me,
    health,
    activeView,
    setActiveView,
    summary,
    selectedCase,
    searchQuery,
    setSearchQuery,
    audioEnabled,
    toggleAudio,
    logout,
    accessOpen,
    setAccessOpen,
  } = useChaseStore();

  const nav = visibleNav(me);
  const canSearch = nav.some((n) => n.id === 'chase-queue');

  const badgeFor = (id: ViewId): string | null => {
    if (id === 'chase-queue' && summary) return `${summary.total_active_cases} open / ${summary.sla_breached_count} overdue`;
    if (id === 'reminder-composer' && summary) return `${summary.pending_rm_action_count} drafts`;
    if (CASE_VIEWS.includes(id) && selectedCase && id === 'case-detail') return selectedCase.case_code;
    return null;
  };

  return (
    <div className="min-h-screen bg-surface font-body-md text-on-surface antialiased flex flex-col">
      <header className="fixed top-0 left-0 w-full z-50 bg-surface-container-lowest shadow-[0_1px_8px_rgba(0,0,0,0.04)] border-b border-surface-container-high/60">
        <div className="h-16 w-full px-margin flex items-center justify-between gap-gutter">
          <button
            type="button"
            onClick={() => nav[0] && setActiveView(nav[0].id)}
            className="flex items-center gap-space-md text-left cursor-pointer shrink-0"
          >
            <div className="w-8 h-8 rounded bg-primary-container text-white flex items-center justify-center font-data-mono-md text-data-mono-md font-bold">
              NC
            </div>
            <div className="flex flex-col">
              <span className="font-headline-sm text-headline-sm text-on-surface">Northgate ChaseUp</span>
              <span className="font-body-sm text-body-sm text-on-surface-variant">
                RM-approved KYC document chasing · synthetic data
              </span>
            </div>
          </button>

          <div className="flex items-center gap-space-md shrink-0">
            {canSearch && (
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  if (activeView !== 'chase-queue') setActiveView('chase-queue');
                }}
                placeholder="Search case, client, LEI…"
                className="hidden lg:block bg-surface-container-low font-body-sm text-body-sm px-space-md py-space-xs rounded w-60 border border-outline-variant/30 focus:outline-none focus:ring-2 focus:ring-primary-container"
              />
            )}
            {health && (
              <Badge
                tone={health.llm_mode === 'live' ? 'ok' : 'warn'}
                title={`Primary ${health.llm_model}, fallback ${health.fallback_model}`}
                testId="llm-mode"
              >
                AI: {health.llm_mode}
              </Badge>
            )}
            <button
              type="button"
              onClick={toggleAudio}
              title={audioEnabled ? 'Mute sounds' : 'Enable sounds'}
              className="p-space-xs text-on-surface-variant hover:bg-surface-container-high rounded cursor-pointer"
            >
              {audioEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
            </button>
            <button
              type="button"
              data-testid="open-access"
              onClick={() => setAccessOpen(true)}
              className="flex items-center gap-space-xs px-space-sm py-space-xs rounded border border-border-structural hover:bg-surface-container-low font-label-md text-label-md cursor-pointer"
            >
              <ShieldCheck className="w-4 h-4" /> Your access
            </button>
            {me && (
              <div className="flex items-center gap-space-sm pl-space-sm border-l border-surface-container-high">
                <div className="w-8 h-8 rounded-full bg-primary-container text-white flex items-center justify-center font-data-mono-sm text-data-mono-sm font-semibold">
                  {me.display_name
                    .split(' ')
                    .map((p) => p[0])
                    .join('')
                    .slice(0, 2)}
                </div>
                <div className="hidden md:flex flex-col">
                  <span data-testid="header-user" className="font-label-md text-label-md text-on-surface leading-tight">
                    {me.display_name}
                  </span>
                  <span data-testid="header-role" className="font-data-mono-sm text-data-mono-sm text-on-surface-variant leading-tight">
                    {me.role_label}
                  </span>
                </div>
                <button
                  type="button"
                  data-testid="logout"
                  onClick={() => void logout()}
                  title="Sign out"
                  className="p-space-xs text-on-surface-variant hover:bg-surface-container-high rounded cursor-pointer"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        </div>

        <nav className="px-margin flex items-center gap-space-xs overflow-x-auto border-t border-surface-container-high/40 bg-surface-container-lowest">
          {nav.map((item) => {
            const active = activeView === item.id;
            const badge = badgeFor(item.id);
            return (
              <button
                key={item.id}
                type="button"
                data-testid={`nav-${item.id}`}
                onClick={() => setActiveView(item.id)}
                className={`px-space-md py-space-sm font-label-md text-label-md whitespace-nowrap border-b-2 cursor-pointer flex items-center gap-space-xs ${
                  active
                    ? 'border-primary-container text-on-surface font-semibold'
                    : 'border-transparent text-on-surface-variant hover:text-on-surface'
                }`}
              >
                {item.label}
                {badge && (
                  <span className="font-data-mono-sm text-data-mono-sm bg-surface-container-high px-space-xs rounded">{badge}</span>
                )}
              </button>
            );
          })}
        </nav>

        <div className="bg-surface-container-low px-margin py-space-xs w-full flex items-center gap-space-sm border-t border-surface-container-high/40">
          <span className="material-symbols-outlined text-on-surface-variant text-[16px]">verified_user</span>
          <p className="font-body-sm text-body-sm text-on-surface-variant">
            <strong className="text-on-surface">RM-approved, never auto-sent:</strong> AI prepares drafts; only the named
            Relationship Manager can approve and send. The system never judges whether a document is genuine and never
            assigns a risk rating. Every change is written to a hash-chained audit log.
          </p>
        </div>
      </header>

      <main className="w-full pt-[152px] bg-surface flex-1">
        <div className="pt-space-md pb-space-2xl px-margin mx-auto max-w-[1440px]">{children}</div>
      </main>

      {accessOpen && <AccessDialog onClose={() => setAccessOpen(false)} />}
    </div>
  );
};
