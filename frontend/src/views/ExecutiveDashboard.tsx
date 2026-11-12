import React, { useEffect, useState } from 'react';
import { useChaseStore } from '../store/useChaseStore';

export const ExecutiveDashboard: React.FC = () => {
  const { dashboardMetrics, fetchDashboardMetrics } = useChaseStore();
  const [activeCadence, setActiveCadence] = useState<'mtd' | 'q1' | 'trailing'>('mtd');

  useEffect(() => {
    void fetchDashboardMetrics();
  }, [fetchDashboardMetrics]);

  const m = dashboardMetrics;
  const daysPerRound = m?.days_per_chase_round ?? 3.1;
  const velocityDelta = m?.velocity_delta_pct ?? -43.6;
  const pilotChasingDays = m?.pilot_chasing_days ?? 7.8;
  const baselineChasingDays = m?.baseline_chasing_days ?? 17.0;

  const handleExportPDF = () => {
    window.print();
  };

  return (
    <div className="flex flex-col w-full">
      {/* Operational Oversight Context Banner */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between pb-space-lg gap-space-md">
        <div className="flex flex-col gap-space-2xs">
          <div className="flex items-center gap-space-xs flex-wrap">
            <span className="font-data-mono-sm text-data-mono-sm uppercase bg-primary-container text-white px-space-xs py-space-2xs rounded">
              CIB-EXEC-OPS-77A
            </span>
            <span className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider">
              COO & FinCrime Oversight Cockpit
            </span>
            <span className="w-1.5 h-1.5 rounded-full bg-error" />
            <span className="font-data-mono-sm text-data-mono-sm text-error font-semibold">
              Stage 2 Congestion Critical
            </span>
          </div>
          <h1 className="font-headline-lg text-headline-lg text-on-surface font-semibold tracking-tight">
            Institutional KYC Onboarding Pipeline Velocity & Chase Impact
          </h1>
          <p className="font-body-sm text-body-sm text-on-surface-variant max-w-4xl">
            Monthly quantitative cycle analytics evaluating operational latency, carrying cost exposure, and client friction across 402 Corporate & Institutional Banking intake cases.
          </p>
        </div>

        {/* Filter & Cadence Controls */}
        <div className="flex items-center gap-space-xs self-start lg:self-center shrink-0 bg-surface-container-low p-space-2xs rounded shadow-xs border border-border-hairline">
          <button
            type="button"
            onClick={() => setActiveCadence('mtd')}
            className={`px-space-md py-space-xs rounded font-label-md text-label-md transition-colors cursor-pointer ${
              activeCadence === 'mtd'
                ? 'bg-surface-container-lowest text-on-surface font-semibold shadow-xs'
                : 'text-on-surface-variant hover:text-on-surface'
            }`}
          >
            MTD (April 2026)
          </button>
          <button
            type="button"
            onClick={() => setActiveCadence('q1')}
            className={`px-space-md py-space-xs rounded font-label-md text-label-md transition-colors cursor-pointer ${
              activeCadence === 'q1'
                ? 'bg-surface-container-lowest text-on-surface font-semibold shadow-xs'
                : 'text-on-surface-variant hover:text-on-surface'
            }`}
          >
            Q1 Consolidated
          </button>
          <button
            type="button"
            onClick={() => setActiveCadence('trailing')}
            className={`px-space-md py-space-xs rounded font-label-md text-label-md transition-colors cursor-pointer ${
              activeCadence === 'trailing'
                ? 'bg-surface-container-lowest text-on-surface font-semibold shadow-xs'
                : 'text-on-surface-variant hover:text-on-surface'
            }`}
          >
            Trailing 12M
          </button>
          <div className="w-px h-5 bg-outline-variant mx-space-2xs" />
          <button
            type="button"
            onClick={handleExportPDF}
            className="flex items-center gap-space-xs px-space-sm py-space-xs rounded bg-surface-container-high text-on-surface hover:bg-surface-container-highest transition-colors font-label-md text-label-md cursor-pointer"
          >
            <span className="material-symbols-outlined text-[16px]">file_download</span>
            <span>Executive PDF</span>
          </button>
        </div>
      </div>

      {/* SECTION 1: Executive KPI Cards Mosaic (4 cards) */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-gutter mb-space-xl">
        {/* KPI 1 */}
        <div className="bg-surface-container-lowest p-space-lg rounded shadow-sm flex flex-col justify-between border border-border-hairline">
          <div>
            <div className="flex items-center justify-between">
              <span className="font-label-sm text-label-sm uppercase text-on-surface-variant">Pipeline Duration</span>
              <span className="font-data-mono-sm text-data-mono-sm bg-error-container text-on-error-container px-space-xs py-space-2xs rounded">
                {velocityDelta > 0 ? `+${velocityDelta}%` : `${velocityDelta}%`} Delta ({daysPerRound.toFixed(1)}d / Round)
              </span>
            </div>
            <div className="mt-space-sm flex items-baseline gap-space-xs">
              <span className="font-headline-lg text-headline-lg font-bold text-on-surface text-[32px] leading-tight">
                62
              </span>
              <span className="font-label-md text-label-md text-on-surface-variant font-medium">
                Days (Median Total)
              </span>
            </div>
          </div>
          <div className="mt-space-md pt-space-sm bg-surface-container-low p-space-xs rounded flex items-center justify-between font-data-mono-sm text-data-mono-sm">
            <span className="text-on-surface-variant">Benchmark SLA Target:</span>
            <span className="font-semibold text-on-surface">35.0 Days</span>
          </div>
        </div>

        {/* KPI 2 (Primary Drag Stage Hero) */}
        <div className="bg-surface-container-lowest p-space-lg rounded shadow-sm relative overflow-hidden flex flex-col justify-between border border-border-hairline">
          <div className="absolute -right-6 -bottom-6 w-28 h-28 bg-error-container opacity-40 rounded-full blur-xl pointer-events-none" />
          <div>
            <div className="flex items-center justify-between">
              <span className="font-label-sm text-label-sm uppercase text-error font-semibold flex items-center gap-space-2xs">
                <span className="material-symbols-outlined text-[14px]">warning</span> Primary Drag Stage
              </span>
              <span className="font-data-mono-sm text-data-mono-sm bg-error-container text-on-error-container px-space-xs py-space-2xs rounded font-semibold">
                27.4% Pipeline
              </span>
            </div>
            <div className="mt-space-sm flex items-baseline gap-space-xs">
              <span className="font-headline-lg text-headline-lg font-bold text-error text-[32px] leading-tight">
                {baselineChasingDays.toFixed(1)}
              </span>
              <span className="font-label-md text-label-md text-on-surface font-medium">
                Days in Chase (vs {pilotChasingDays.toFixed(1)}d Pilot)
              </span>
            </div>
          </div>
          <div className="mt-space-md pt-space-sm bg-error-container/40 p-space-xs rounded flex items-center justify-between font-data-mono-sm text-data-mono-sm text-on-error-container">
            <span>Longest Stage Pipeline Rank:</span>
            <span className="font-bold">#1 Bottleneck (Stage 2)</span>
          </div>
        </div>

        {/* KPI 3 */}
        <div className="bg-surface-container-lowest p-space-lg rounded shadow-sm flex flex-col justify-between border border-border-hairline">
          <div>
            <div className="flex items-center justify-between">
              <span className="font-label-sm text-label-sm uppercase text-on-surface-variant">Carrying Cost Exposure</span>
              <span className="font-data-mono-sm text-data-mono-sm bg-surface-container-high text-on-secondary-container px-space-xs py-space-2xs rounded">
                Analyst + RM Hours
              </span>
            </div>
            <div className="mt-space-sm flex items-baseline gap-space-xs">
              <span className="font-headline-lg text-headline-lg font-bold text-on-surface text-[32px] leading-tight">
                $4,850
              </span>
              <span className="font-label-md text-label-md text-on-surface-variant font-medium">Ops Cost / Case</span>
            </div>
          </div>
          <div className="mt-space-md pt-space-sm bg-surface-container-low p-space-xs rounded flex items-center justify-between font-data-mono-sm text-data-mono-sm">
            <span className="text-on-surface-variant">Annualized Carrying Drag:</span>
            <span className="font-semibold text-on-surface">$1.95M / Year</span>
          </div>
        </div>

        {/* KPI 4 */}
        <div className="bg-surface-container-lowest p-space-lg rounded shadow-sm flex flex-col justify-between border border-border-hairline">
          <div>
            <div className="flex items-center justify-between">
              <span className="font-label-sm text-label-sm uppercase text-on-surface-variant">Intake Capacity</span>
              <span className="font-data-mono-sm text-data-mono-sm bg-surface-container-highest text-on-surface-variant px-space-xs py-space-2xs rounded">
                Queue Health: 104%
              </span>
            </div>
            <div className="mt-space-sm flex items-baseline gap-space-xs">
              <span className="font-headline-lg text-headline-lg font-bold text-on-surface text-[32px] leading-tight">
                402
              </span>
              <span className="font-label-md text-label-md text-on-surface-variant font-medium">New Entities / Mo</span>
            </div>
          </div>
          <div className="mt-space-md pt-space-sm bg-surface-container-low p-space-xs rounded flex items-center justify-between font-data-mono-sm text-data-mono-sm">
            <span className="text-on-surface-variant">Active Pipeline In-Flight:</span>
            <span className="font-semibold text-on-surface">418 Active Files</span>
          </div>
        </div>
      </div>

      {/* SECTION 2: Pipeline Stage Flowchart & Latency Breakdown (6 Stages) */}
      <div className="bg-surface-container-lowest p-space-lg rounded shadow-sm mb-space-xl border border-border-hairline">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-space-sm mb-space-lg">
          <div className="flex flex-col">
            <div className="flex items-center gap-space-xs">
              <span className="font-label-sm text-label-sm uppercase bg-surface-container text-on-surface px-space-xs py-space-2xs rounded">
                End-to-End Waterfall
              </span>
              <span className="font-label-md text-label-md font-semibold text-on-surface">
                Median Stage Progression Architecture
              </span>
            </div>
            <span className="font-body-sm text-body-sm text-on-surface-variant mt-1">
              Total cumulative pipeline cycle: 62.0 Median Days across all 6 verified regulatory gates.
            </span>
          </div>
          <div className="flex items-center gap-space-md font-data-mono-sm text-data-mono-sm text-on-surface-variant">
            <span className="flex items-center gap-space-2xs">
              <span className="w-3 h-3 rounded-sm bg-surface-container-high" /> Standard Velocity Gate
            </span>
            <span className="flex items-center gap-space-2xs">
              <span className="w-3 h-3 rounded-sm bg-primary-container" /> Severe Friction / Bottleneck
            </span>
          </div>
        </div>

        {/* 6 Stage Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-6 gap-space-sm items-stretch">
          {/* Stage 1 */}
          <div className="bg-surface-container-low p-space-md rounded flex flex-col justify-between transition-all hover:bg-surface-container border border-outline-variant/20">
            <div>
              <div className="flex items-center justify-between mb-space-2xs">
                <span className="font-data-mono-sm text-data-mono-sm text-on-surface-variant">STAGE 01</span>
                <span className="font-label-sm text-label-sm bg-surface-container-highest px-space-2xs py-space-2xs rounded font-semibold">14.5%</span>
              </div>
              <p className="font-label-md text-label-md font-semibold text-on-surface leading-tight">Document Intake & Triage</p>
              <p className="font-body-sm text-body-sm text-on-surface-variant mt-space-xs">Submission receipt, indexing, preliminary validation.</p>
            </div>
            <div className="mt-space-md pt-space-sm bg-surface-container-lowest/80 p-space-xs rounded flex items-center justify-between">
              <span className="font-data-mono-sm text-data-mono-sm text-on-surface-variant">Duration:</span>
              <span className="font-headline-sm text-headline-sm font-bold text-on-surface">9.0 Days</span>
            </div>
          </div>

          {/* Stage 2: HERO BOTTLENECK */}
          <div className="bg-primary-container text-white p-space-md rounded shadow-md relative overflow-hidden flex flex-col justify-between">
            <div className="absolute top-0 right-0 transform translate-x-2 -translate-y-2 w-16 h-16 bg-error/30 rounded-full blur-md" />
            <div>
              <div className="flex items-center justify-between mb-space-2xs">
                <span className="font-data-mono-sm text-data-mono-sm text-white/70">STAGE 02</span>
                <span className="font-label-sm text-label-sm bg-error text-white px-space-2xs py-space-2xs rounded font-bold">27.4% DRAG</span>
              </div>
              <p className="font-label-md text-label-md font-bold text-white leading-tight">Document Chasing & Follow-ups</p>
              <p className="font-body-sm text-body-sm text-white/80 mt-space-xs">
                Automated multi-round chasing, deficient re-submissions, RM escalation.
              </p>
            </div>
            <div className="mt-space-md pt-space-sm bg-black/30 p-space-xs rounded flex items-center justify-between">
              <span className="font-data-mono-sm text-data-mono-sm text-white/70">Duration:</span>
              <span className="font-headline-sm text-headline-sm font-bold text-error">17.0 Days</span>
            </div>
          </div>

          {/* Stage 3 */}
          <div className="bg-surface-container-low p-space-md rounded flex flex-col justify-between transition-all hover:bg-surface-container border border-outline-variant/20">
            <div>
              <div className="flex items-center justify-between mb-space-2xs">
                <span className="font-data-mono-sm text-data-mono-sm text-on-surface-variant">STAGE 03</span>
                <span className="font-label-sm text-label-sm bg-surface-container-highest px-space-2xs py-space-2xs rounded font-semibold">22.6%</span>
              </div>
              <p className="font-label-md text-label-md font-semibold text-on-surface leading-tight">UBO Extraction & Analysis</p>
              <p className="font-body-sm text-body-sm text-on-surface-variant mt-space-xs">Beneficial ownership mapping, natural person verification.</p>
            </div>
            <div className="mt-space-md pt-space-sm bg-surface-container-lowest/80 p-space-xs rounded flex items-center justify-between">
              <span className="font-data-mono-sm text-data-mono-sm text-on-surface-variant">Duration:</span>
              <span className="font-headline-sm text-headline-sm font-bold text-on-surface">14.0 Days</span>
            </div>
          </div>

          {/* Stage 4 */}
          <div className="bg-surface-container-low p-space-md rounded flex flex-col justify-between transition-all hover:bg-surface-container border border-outline-variant/20">
            <div>
              <div className="flex items-center justify-between mb-space-2xs">
                <span className="font-data-mono-sm text-data-mono-sm text-on-surface-variant">STAGE 04</span>
                <span className="font-label-sm text-label-sm bg-surface-container-highest px-space-2xs py-space-2xs rounded font-semibold">9.7%</span>
              </div>
              <p className="font-label-md text-label-md font-semibold text-on-surface leading-tight">Screening & Sanctions</p>
              <p className="font-body-sm text-body-sm text-on-surface-variant mt-space-xs">PEP, adverse media, sanctions lists, legal screening.</p>
            </div>
            <div className="mt-space-md pt-space-sm bg-surface-container-lowest/80 p-space-xs rounded flex items-center justify-between">
              <span className="font-data-mono-sm text-data-mono-sm text-on-surface-variant">Duration:</span>
              <span className="font-headline-sm text-headline-sm font-bold text-on-surface">6.0 Days</span>
            </div>
          </div>

          {/* Stage 5 */}
          <div className="bg-surface-container-low p-space-md rounded flex flex-col justify-between transition-all hover:bg-surface-container border border-outline-variant/20">
            <div>
              <div className="flex items-center justify-between mb-space-2xs">
                <span className="font-data-mono-sm text-data-mono-sm text-on-surface-variant">STAGE 05</span>
                <span className="font-label-sm text-label-sm bg-surface-container-highest px-space-2xs py-space-2xs rounded font-semibold">14.5%</span>
              </div>
              <p className="font-label-md text-label-md font-semibold text-on-surface leading-tight">Risk & Sign-off Approval</p>
              <p className="font-body-sm text-body-sm text-on-surface-variant mt-space-xs">Risk committee review, senior AML approval.</p>
            </div>
            <div className="mt-space-md pt-space-sm bg-surface-container-lowest/80 p-space-xs rounded flex items-center justify-between">
              <span className="font-data-mono-sm text-data-mono-sm text-on-surface-variant">Duration:</span>
              <span className="font-headline-sm text-headline-sm font-bold text-on-surface">9.0 Days</span>
            </div>
          </div>

          {/* Stage 6 */}
          <div className="bg-surface-container-low p-space-md rounded flex flex-col justify-between transition-all hover:bg-surface-container border border-outline-variant/20">
            <div>
              <div className="flex items-center justify-between mb-space-2xs">
                <span className="font-data-mono-sm text-data-mono-sm text-on-surface-variant">STAGE 06</span>
                <span className="font-label-sm text-label-sm bg-surface-container-highest px-space-2xs py-space-2xs rounded font-semibold">11.3%</span>
              </div>
              <p className="font-label-md text-label-md font-semibold text-on-surface leading-tight">Account Opening & Settlement</p>
              <p className="font-body-sm text-body-sm text-on-surface-variant mt-space-xs">Core-banking ledger provisioning & SWIFT setup.</p>
            </div>
            <div className="mt-space-md pt-space-sm bg-surface-container-lowest/80 p-space-xs rounded flex items-center justify-between">
              <span className="font-data-mono-sm text-data-mono-sm text-on-surface-variant">Duration:</span>
              <span className="font-headline-sm text-headline-sm font-bold text-on-surface">7.0 Days</span>
            </div>
          </div>
        </div>

        {/* Bottleneck Callout */}
        <div className="mt-space-md p-space-md bg-error-container/30 rounded flex flex-col md:flex-row md:items-center justify-between gap-space-md border border-error/20">
          <div className="flex items-start gap-space-sm">
            <span className="material-symbols-outlined text-error text-[24px] mt-space-2xs shrink-0">
              emergency
            </span>
            <div>
              <h4 className="font-headline-sm text-headline-sm font-semibold text-on-surface">
                Direct Operational Cascade: Stage 2 Stalls Downstream Verification Workflows
              </h4>
              <p className="font-body-sm text-body-sm text-on-surface-variant mt-space-2xs max-w-4xl leading-relaxed">
                Document chasing at Stage 2 accounts for <strong className="text-error font-semibold">68% of downstream idle analyst hours</strong> in Stage 3 (UBO extraction). Specialists sit idle waiting for Apostilled articles and verified trust deeds, compounding file age before compliance review can commence.
              </p>
            </div>
          </div>
          <div className="bg-surface-container-lowest px-space-md py-space-xs rounded shadow-xs text-right border border-border-hairline shrink-0">
            <span className="font-label-sm text-label-sm uppercase text-on-surface-variant block">Analyst Idle Hours Lost</span>
            <span className="font-data-mono-md text-data-mono-md font-bold text-error">1,420 Hours / Mo</span>
          </div>
        </div>
      </div>

      {/* SECTION 3: Chase Rounds Distribution & Volume Table */}
      <div className="bg-surface-container-lowest p-space-lg rounded shadow-sm mb-space-xl overflow-hidden border border-border-hairline">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-space-sm mb-space-md">
          <div>
            <div className="flex items-center gap-space-xs">
              <span className="font-label-sm text-label-sm uppercase bg-surface-container text-on-surface px-space-xs py-space-2xs rounded">
                Iteration Analysis
              </span>
              <h3 className="font-headline-md text-headline-md font-semibold text-on-surface">
                Chase Rounds Distribution & Volume Tiering
              </h3>
            </div>
            <p className="font-body-sm text-body-sm text-on-surface-variant mt-1">
              Breakdown of 402 completed corporate onboardings by client responsiveness and required RM interventions.
            </p>
          </div>
          <div className="font-data-mono-sm text-data-mono-sm text-on-surface-variant bg-surface-container-low px-space-sm py-space-xs rounded border border-border-hairline">
            Dataset: 402 Verified Entity Files Analyzed
          </div>
        </div>

        <div className="overflow-x-auto w-full">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="bg-surface-container-low text-on-surface font-label-sm text-label-sm uppercase tracking-wider">
                <th className="py-space-sm px-space-md">Chase Round Tier</th>
                <th className="py-space-sm px-space-md">Cases (This Month)</th>
                <th className="py-space-sm px-space-md">% of Total Intake</th>
                <th className="py-space-sm px-space-md">Median Days to Resolution</th>
                <th className="py-space-sm px-space-md">Downstream Operational Impact</th>
                <th className="py-space-sm px-space-md">Standard Remediation Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-surface-container-low font-body-sm text-body-sm text-on-surface">
              <tr className="hover:bg-surface-container-low/50 transition-colors">
                <td className="py-space-sm px-space-md font-medium flex items-center gap-space-xs">
                  <span className="w-2 h-2 rounded-full bg-secondary" />
                  <span>Round 1 (Single Reminder Resolved)</span>
                </td>
                <td className="py-space-sm px-space-md font-data-mono-md text-data-mono-md font-semibold">184 Cases</td>
                <td className="py-space-sm px-space-md">
                  <div className="flex items-center gap-space-xs">
                    <div className="w-16 h-2 bg-surface-container-high rounded overflow-hidden">
                      <div className="h-full bg-secondary" style={{ width: '46%' }} />
                    </div>
                    <span className="font-data-mono-sm text-data-mono-sm font-semibold">46%</span>
                  </div>
                </td>
                <td className="py-space-sm px-space-md font-data-mono-md text-data-mono-md text-secondary font-bold">6.0 Days</td>
                <td className="py-space-sm px-space-md text-on-surface-variant">Zero downstream delay; within operational buffer</td>
                <td className="py-space-sm px-space-md">
                  <span className="font-label-sm text-label-sm uppercase bg-surface-container text-on-surface px-space-xs py-space-2xs rounded">
                    Automated nudge effective
                  </span>
                </td>
              </tr>

              <tr className="hover:bg-surface-container-low/50 transition-colors bg-surface-container-lowest">
                <td className="py-space-sm px-space-md font-medium flex items-center gap-space-xs">
                  <span className="w-2 h-2 rounded-full bg-outline" />
                  <span>Round 2 (Secondary Escalation Required)</span>
                </td>
                <td className="py-space-sm px-space-md font-data-mono-md text-data-mono-md font-semibold">142 Cases</td>
                <td className="py-space-sm px-space-md">
                  <div className="flex items-center gap-space-xs">
                    <div className="w-16 h-2 bg-surface-container-high rounded overflow-hidden">
                      <div className="h-full bg-outline" style={{ width: '35%' }} />
                    </div>
                    <span className="font-data-mono-sm text-data-mono-sm font-semibold">35%</span>
                  </div>
                </td>
                <td className="py-space-sm px-space-md font-data-mono-md text-data-mono-md text-on-surface font-bold">15.0 Days</td>
                <td className="py-space-sm px-space-md text-on-surface-variant">UBO analyst idle avg 4.2 days; queue re-prioritization</td>
                <td className="py-space-sm px-space-md">
                  <span className="font-label-sm text-label-sm uppercase bg-surface-container-high text-on-secondary-container px-space-xs py-space-2xs rounded font-medium">
                    RM phone follow-up triggered
                  </span>
                </td>
              </tr>

              <tr className="bg-error-container/20 hover:bg-error-container/30 transition-colors">
                <td className="py-space-sm px-space-md font-medium flex items-center gap-space-xs">
                  <span className="w-2 h-2 rounded-full bg-error" />
                  <span className="text-error font-semibold">Round 3+ (Severe Delinquency / Senior Intervention)</span>
                </td>
                <td className="py-space-sm px-space-md font-data-mono-md text-data-mono-md font-bold text-error">76 Cases</td>
                <td className="py-space-sm px-space-md">
                  <div className="flex items-center gap-space-xs">
                    <div className="w-16 h-2 bg-surface-container-high rounded overflow-hidden">
                      <div className="h-full bg-error" style={{ width: '19%' }} />
                    </div>
                    <span className="font-data-mono-sm text-data-mono-sm font-bold text-error">19%</span>
                  </div>
                </td>
                <td className="py-space-sm px-space-md font-data-mono-md text-data-mono-md text-error font-bold">28.0 Days</td>
                <td className="py-space-sm px-space-md text-error font-medium">Blocked downstream stages in 82% of files; severe capacity drain</td>
                <td className="py-space-sm px-space-md">
                  <span className="font-label-sm text-label-sm uppercase bg-error text-white px-space-xs py-space-2xs rounded font-bold">
                    Requires Division Head Notice
                  </span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
