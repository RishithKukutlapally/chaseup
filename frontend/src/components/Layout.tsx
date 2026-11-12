import React, { useState } from 'react';
import { Volume2, VolumeX } from 'lucide-react';

import { useChaseStore } from '../store/useChaseStore';

export const Layout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const {
    activeView,
    setActiveView,
    summary,
    selectedCase,
    searchQuery,
    setSearchQuery,
    audioEnabled,
    toggleAudio,
    selectCase,
  } = useChaseStore();

  const [showNotifMenu, setShowNotifMenu] = useState(false);

  const breachedCases = summary?.cases.filter((c) => c.sla_breached) ?? [];
  const slaBreachCount = summary?.sla_breached_count ?? breachedCases.length;
  const activeCount = summary?.total_active_cases ?? 8;
  const draftCount = summary?.pending_rm_action_count ?? 3;

  const isQueueActive = activeView === 'chase-queue' || activeView === 'orchestrator-inbox';
  const isCaseDetailActive = activeView === 'case-detail' || activeView === 'case-tracker';
  const isComposerActive =
    activeView === 'reminder-composer' ||
    activeView === 'ai-drafting-agent' ||
    activeView === 'critic-compliance-qa' ||
    activeView === 'human-in-the-loop-review';
  const isAnalyticsActive =
    activeView === 'stage-analytics' || activeView === 'executive-success-dashboard';
  const isHandoffActive = activeView === 'analyst-handoff';

  const caseBadgeLabel = selectedCase
    ? `${selectedCase.case_code} - ${selectedCase.client_name}`
    : 'NG-2026-8812 - Helios Marine';

  return (
    <div className="min-h-screen bg-surface font-body-md text-on-surface antialiased flex flex-col">
      {/* Sovereign Institutional Header */}
      <header className="fixed top-0 left-0 w-full z-50 bg-surface-container-lowest shadow-[0_1px_8px_rgba(0,0,0,0.04)] border-b border-surface-container-high/60">
        <div className="h-16 w-full px-margin flex items-center justify-between gap-gutter">
          {/* Logo & Operational Desk Title */}
          <div className="flex items-center gap-space-md shrink-0">
            <button
              type="button"
              onClick={() => setActiveView('chase-queue')}
              className="flex items-center gap-space-md text-left group cursor-pointer focus:outline-none"
            >
              <div className="w-8 h-8 rounded bg-primary-container text-white flex items-center justify-center font-data-mono-md text-data-mono-md font-bold shadow-sm">
                NC
              </div>
              <div className="flex flex-col">
                <div className="flex items-center gap-space-xs">
                  <span className="font-headline-sm text-headline-sm text-on-surface tracking-tight font-semibold">
                    Northgate Chase
                  </span>
                  <span className="font-label-sm text-label-sm uppercase bg-surface-container-high text-on-secondary-container px-space-xs py-space-2xs rounded">
                    Production Ops (v4.2)
                  </span>
                </div>
                <span className="font-body-sm text-body-sm text-on-surface-variant">
                  KYC Onboarding Chase Workspace
                </span>
              </div>
            </button>
          </div>

          {/* Center Navigation Bar */}
          <nav className="hidden xl:flex items-center gap-space-xs">
            {/* 1. Chase Queue */}
            <button
              type="button"
              onClick={() => setActiveView('chase-queue')}
              className={`px-space-md py-space-xs rounded transition-colors flex items-center gap-space-xs font-label-md text-label-md cursor-pointer ${
                isQueueActive
                  ? 'bg-surface-container text-on-surface font-semibold shadow-sm'
                  : 'text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface'
              }`}
            >
              <span>Chase Queue</span>
              <span className="font-data-mono-sm text-data-mono-sm bg-error-container text-on-error-container px-space-xs py-space-2xs rounded">
                {activeCount} Open / {slaBreachCount} Overdue
              </span>
            </button>

            {/* 2. Case Detail */}
            <button
              type="button"
              onClick={() => setActiveView('case-detail')}
              className={`px-space-md py-space-xs rounded transition-colors flex flex-col items-start leading-none gap-space-2xs font-label-md text-label-md cursor-pointer ${
                isCaseDetailActive
                  ? 'bg-surface-container text-on-surface font-semibold shadow-sm'
                  : 'text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface'
              }`}
            >
              <span>Case Detail</span>
              <span className="font-data-mono-sm text-data-mono-sm text-on-surface-variant truncate max-w-[200px]">
                {caseBadgeLabel}
              </span>
            </button>

            {/* 3. Reminder Composer */}
            <button
              type="button"
              onClick={() => setActiveView('reminder-composer')}
              className={`px-space-md py-space-xs rounded transition-colors flex items-center gap-space-xs font-label-md text-label-md cursor-pointer ${
                isComposerActive
                  ? 'bg-surface-container text-on-surface font-semibold shadow-sm'
                  : 'text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface'
              }`}
            >
              <span>Reminder Composer</span>
              <span className="font-data-mono-sm text-data-mono-sm bg-secondary-container text-on-secondary-container px-space-xs py-space-2xs rounded">
                {draftCount} Drafts
              </span>
            </button>

            {/* 4. Stage Analytics */}
            <button
              type="button"
              onClick={() => setActiveView('stage-analytics')}
              className={`px-space-md py-space-xs rounded transition-colors flex flex-col items-start leading-none gap-space-2xs font-label-md text-label-md cursor-pointer ${
                isAnalyticsActive
                  ? 'bg-surface-container text-on-surface font-semibold shadow-sm'
                  : 'text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface'
              }`}
            >
              <span>Stage Analytics</span>
              <span className="font-label-sm text-label-sm text-on-surface-variant">COO Oversight</span>
            </button>

            {/* 5. Analyst Handoff */}
            <button
              type="button"
              onClick={() => setActiveView('analyst-handoff')}
              className={`px-space-md py-space-xs rounded transition-colors flex items-center gap-space-xs font-label-md text-label-md cursor-pointer ${
                isHandoffActive
                  ? 'bg-surface-container text-on-surface font-semibold shadow-sm'
                  : 'text-on-surface-variant hover:bg-surface-container-high hover:text-on-surface'
              }`}
            >
              <span>Analyst Handoff</span>
              <span className="font-data-mono-sm text-data-mono-sm bg-surface-container-highest text-on-surface-variant px-space-xs py-space-2xs rounded">
                UBO Blocked
              </span>
            </button>

            <div className="h-5 w-[1px] bg-outline-variant/40 mx-space-2xs hidden xl:block" />

            {/* Assignment 2 Switcher Link */}
            <a
              href="/analystassist"
              title="Open Assignment 2: Analyst Assist UBO Extraction Desk"
              className="px-space-md py-space-xs rounded bg-primary-container/10 hover:bg-primary-container/20 text-primary-container border border-primary-container/30 font-label-md text-label-md flex items-center gap-space-xs transition-all shadow-xs"
            >
              <span className="material-symbols-outlined text-[16px]">psychology</span>
              <span className="font-semibold">Analyst Assist</span>
              <span className="font-data-mono-sm text-data-mono-sm bg-primary-container text-white px-space-xs py-space-2xs rounded font-bold">
                Assignment 2 →
              </span>
            </a>
          </nav>

          {/* Right Controls: Search, Notifications, Audio, Profile */}
          <div className="flex items-center gap-space-md shrink-0">
            {/* Global Search Input */}
            <div className="relative hidden lg:flex items-center">
              <span className="material-symbols-outlined absolute left-space-sm text-on-surface-variant text-[18px]">
                search
              </span>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  if (!isQueueActive) {
                    setActiveView('chase-queue');
                  }
                }}
                placeholder="Search Case ID, Client, or Tax ID... (Ctrl+K)"
                className="bg-surface-container-low text-on-surface font-body-sm text-body-sm pl-space-2xl pr-space-md py-space-xs rounded w-64 focus:outline-none focus:bg-surface-container-lowest focus:ring-2 focus:ring-primary-container text-ellipsis border border-outline-variant/30"
              />
            </div>

            {/* Audio Toggle */}
            <button
              type="button"
              onClick={toggleAudio}
              title={audioEnabled ? 'Mute Telemetry Pings' : 'Enable Telemetry Audio'}
              className="p-space-xs text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high rounded transition-colors cursor-pointer"
            >
              {audioEnabled ? (
                <Volume2 className="w-4 h-4 text-on-surface-variant" />
              ) : (
                <VolumeX className="w-4 h-4 text-outline" />
              )}
            </button>

            {/* Notifications Button */}
            <div className="relative">
              <button
                type="button"
                aria-label="Notifications"
                onClick={() => setShowNotifMenu(!showNotifMenu)}
                className="relative p-space-xs text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high rounded transition-colors cursor-pointer"
              >
                <span className="material-symbols-outlined text-[20px]">notifications</span>
                {slaBreachCount > 0 && (
                  <span className="absolute top-1 right-1 w-2 h-2 rounded-full bg-error" />
                )}
              </button>

              {/* Notifications Dropdown */}
              {showNotifMenu && (
                <div className="absolute right-0 mt-2 w-80 rounded-lg bg-surface-container-lowest border border-border-hairline shadow-lg p-space-md z-50">
                  <div className="flex items-center justify-between pb-space-xs border-b border-surface-container-high">
                    <span className="font-headline-sm text-headline-sm text-on-surface">
                      Operational Alerts
                    </span>
                    <span className="font-data-mono-sm text-data-mono-sm text-error font-semibold">
                      {slaBreachCount} Critical
                    </span>
                  </div>
                  <div className="mt-space-sm space-y-space-xs max-h-60 overflow-y-auto">
                    {breachedCases.length > 0 ? (
                      breachedCases.map((c) => (
                        <div
                          key={c.id}
                          onClick={() => {
                            void selectCase(c.id, 'case-detail');
                            setShowNotifMenu(false);
                          }}
                          className="p-space-xs rounded bg-surface-container-low hover:bg-surface-container cursor-pointer transition-colors"
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-data-mono-sm text-data-mono-sm text-error font-semibold">
                              {c.case_code}
                            </span>
                            <span className="font-label-sm text-label-sm uppercase text-error">
                              +{c.sla_delay_days}d SLA breach
                            </span>
                          </div>
                          <p className="font-body-sm text-body-sm text-on-surface mt-0.5 truncate">
                            {c.client_name}
                          </p>
                        </div>
                      ))
                    ) : (
                      <p className="font-body-sm text-body-sm text-on-surface-variant py-space-sm text-center">
                        All entity SLAs currently compliant.
                      </p>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Division Badge */}
            <div className="hidden md:flex flex-col text-right">
              <span className="font-label-sm text-label-sm uppercase bg-surface-container-high text-on-surface-variant px-space-xs py-space-2xs rounded">
                Corporate & Institutional Banking
              </span>
            </div>

            {/* User Profile */}
            <div className="flex items-center gap-space-sm pl-space-xs border-l border-surface-container-high">
              <div className="w-8 h-8 rounded-full bg-primary-container text-white flex items-center justify-center font-data-mono-sm text-data-mono-sm font-semibold">
                AV
              </div>
              <div className="hidden 2xl:flex flex-col text-left">
                <span className="font-label-md text-label-md font-semibold text-on-surface leading-tight">
                  Alistair Vance
                </span>
                <span className="font-data-mono-sm text-data-mono-sm text-on-surface-variant leading-tight">
                  Senior RM - Global Industries
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Human-in-the-Loop Protocol Ribbon */}
        <div className="bg-surface-container-low px-margin py-space-xs w-full flex items-center justify-between gap-space-sm border-t border-surface-container-high/40 shadow-[0_1px_4px_rgba(0,0,0,0.02)]">
          <div className="flex items-center gap-space-sm">
            <span className="material-symbols-outlined text-on-surface-variant text-[16px] shrink-0">
              verified_user
            </span>
            <p className="font-body-sm text-body-sm text-on-surface-variant tracking-normal">
              <strong className="font-semibold text-on-surface">Human-in-the-loop Protocol:</strong> Reminder
              drafts are generated automatically from templates but{' '}
              <span className="font-semibold text-error">NEVER send without explicit RM review and sign-off</span>.
              Timeline logs are immutably auditable under KYC Ops policy.
            </p>
          </div>
          <div className="hidden lg:flex items-center gap-space-xs shrink-0 pl-space-md border-l border-outline-variant/30">
            <span className="text-on-surface-variant font-label-sm text-label-sm">Dual Assignment:</span>
            <a
              href="/analystassist"
              className="px-2 py-0.5 rounded bg-primary-container/10 text-primary-container hover:bg-primary-container/20 font-label-sm text-label-sm font-semibold flex items-center gap-1 border border-primary-container/25 transition-colors"
            >
              <span className="material-symbols-outlined text-[14px]">open_in_new</span>
              <span>Open Assignment 2 (Analyst Assist Desk) →</span>
            </a>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="w-full pt-28 bg-surface flex-1">
        <div className="pt-space-md pb-space-2xl px-margin mx-auto max-w-[1440px]">
          {children}
        </div>
      </main>
    </div>
  );
};
