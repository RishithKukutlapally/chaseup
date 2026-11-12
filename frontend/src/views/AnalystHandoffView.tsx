import React, { useState } from 'react';
import { useChaseStore } from '../store/useChaseStore';

export const AnalystHandoffView: React.FC = () => {
  const { selectedCase, setActiveView } = useChaseStore();

  const [selectedAction, setSelectedAction] = useState('direct-chase');
  const [analystDirective, setAnalystDirective] = useState(
    'Please contact Marcus Sterling directly via telephone to request the updated Marshall Islands intermediate holding entity breakdown before Friday.'
  );
  const [actionSuccess, setActionSuccess] = useState(false);

  const clientName = selectedCase?.client_name || 'Helios Marine Logistics Ltd';
  const caseCode = selectedCase?.case_code || 'NG-2026-8812';

  const handleResolveAction = () => {
    setActionSuccess(true);
    setTimeout(() => {
      setActionSuccess(false);
      setActiveView('reminder-composer');
    }, 1500);
  };

  return (
    <div className="flex flex-col w-full">
      {/* Top Operational Breadcrumb & Handoff Ticket Meta */}
      <div className="flex flex-col md:flex-row md:items-center justify-between pb-space-lg gap-space-md">
        <div className="flex flex-wrap items-center gap-space-xs font-label-md text-label-md">
          <button
            type="button"
            onClick={() => setActiveView('chase-queue')}
            className="text-on-surface-variant hover:text-on-surface transition-colors flex items-center gap-space-2xs cursor-pointer"
          >
            <span className="material-symbols-outlined text-[16px]">folder_supervised</span>
            KYC Queue
          </button>
          <span className="text-outline-variant">/</span>
          <button
            type="button"
            onClick={() => setActiveView('case-detail')}
            className="text-on-surface-variant hover:text-on-surface transition-colors cursor-pointer"
          >
            {caseCode} ({clientName.split(' ')[0]})
          </button>
          <span className="text-outline-variant">/</span>
          <span className="text-on-surface font-semibold bg-surface-container-high px-space-xs py-space-2xs rounded">
            Analyst Handoff Desk
          </span>
        </div>
        <div className="flex items-center gap-space-sm">
          <span className="font-data-mono-sm text-data-mono-sm text-on-surface-variant bg-surface-container px-space-sm py-space-xs rounded">
            Handoff Ref: HND-UBO-8812-B
          </span>
          <span className="font-data-mono-sm text-data-mono-sm text-on-surface-variant bg-surface-container px-space-sm py-space-xs rounded flex items-center gap-space-2xs">
            <span className="w-2 h-2 rounded-full bg-error animate-pulse" />
            Desk: FCC London Floor 4
          </span>
        </div>
      </div>

      {/* 1. Critical Blocked Stage Banner */}
      <div className="bg-surface-container-lowest rounded shadow-sm p-space-lg mb-space-xl relative overflow-hidden border border-border-hairline">
        <div className="absolute left-0 top-0 bottom-0 w-1.5 bg-error" />
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-space-lg pl-space-sm">
          <div className="flex items-start gap-space-md">
            <div className="w-10 h-10 rounded bg-error-container text-on-error-container flex items-center justify-center shrink-0">
              <span className="material-symbols-outlined text-[24px]">block</span>
            </div>
            <div className="flex flex-col gap-space-2xs">
              <div className="flex flex-wrap items-center gap-space-xs">
                <span className="font-label-sm text-label-sm uppercase bg-error-container text-on-error-container px-space-xs py-space-2xs rounded font-semibold tracking-wide">
                  Critical Blocker Active
                </span>
                <span className="font-data-mono-sm text-data-mono-sm text-on-surface-variant">
                  Gate 3.4 • Beneficial Ownership Verification
                </span>
              </div>
              <h1 className="font-headline-md text-headline-md text-on-surface font-bold tracking-tight">
                Stage Blocked: UBO Extraction & Beneficial Ownership Verification
              </h1>
              <p className="font-body-sm text-body-sm text-on-surface-variant">
                Blocked by Senior KYC Analyst <strong className="text-on-surface font-semibold">Dev Patel</strong> on 24 Feb 2026, 08:30 GMT • Regulatory standard requires explicit natural-person legal chain verification before account creation.
              </p>
            </div>
          </div>

          {/* SLA Paused Callout Box */}
          <div className="bg-surface-container-high rounded p-space-md flex items-center gap-space-md shrink-0 lg:max-w-sm border border-border-hairline">
            <div className="w-9 h-9 rounded bg-surface-container-lowest text-on-surface flex items-center justify-center shrink-0 shadow-xs">
              <span className="material-symbols-outlined text-[20px] text-error">pause_circle</span>
            </div>
            <div className="flex flex-col">
              <div className="flex items-center justify-between gap-space-sm">
                <span className="font-label-sm text-label-sm uppercase text-on-surface font-semibold">
                  Stage SLA Paused
                </span>
                <span className="font-data-mono-sm text-data-mono-sm text-error font-semibold">
                  Clock Frozen
                </span>
              </div>
              <span className="font-data-mono-md text-data-mono-md text-on-surface font-semibold mt-space-2xs">
                4 days remaining
              </span>
              <span className="font-body-sm text-body-sm text-on-surface-variant">
                of 7-day target once unblocked by RM
              </span>
            </div>
          </div>
        </div>
      </div>

      {actionSuccess && (
        <div className="mb-space-lg p-space-md rounded bg-secondary-container text-on-secondary-container font-label-md text-label-md flex items-center gap-space-sm shadow-sm">
          <span className="material-symbols-outlined text-[20px]">check_circle</span>
          <span>Analyst handoff directive recorded. Opening Reminder Composer with calibrated context...</span>
        </div>
      )}

      {/* Primary Workspace: 12-Column Responsive Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-space-xl items-start">
        {/* Left Column (7 cols): Document Defects & Action Form */}
        <div className="lg:col-span-7 flex flex-col gap-space-xl">
          {/* Missing Prerequisite Document Cards */}
          <div className="flex flex-col gap-space-md">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-space-sm">
                <span className="font-headline-sm text-headline-sm text-on-surface font-semibold">
                  Prerequisite Deficiencies
                </span>
                <span className="font-data-mono-sm text-data-mono-sm bg-error-container text-on-error-container px-space-xs py-space-2xs rounded">
                  2 Unresolved
                </span>
              </div>
              <span className="font-label-sm text-label-sm text-on-surface-variant uppercase tracking-wider">
                Required by Marshall Islands MLC Reg 14
              </span>
            </div>

            {/* Defect Item 1 */}
            <div className="bg-surface-container-lowest rounded shadow-sm p-space-lg flex flex-col gap-space-md border border-border-hairline">
              <div className="flex items-start justify-between gap-space-md">
                <div className="flex items-start gap-space-sm">
                  <span className="material-symbols-outlined text-[22px] text-error mt-0.5 shrink-0">
                    account_tree
                  </span>
                  <div className="flex flex-col">
                    <div className="flex flex-wrap items-center gap-space-xs mb-space-2xs">
                      <span className="font-label-sm text-label-sm uppercase bg-error-container text-on-error-container px-space-xs py-space-2xs rounded font-semibold">
                        Overdue • Round 2 Chase Pending
                      </span>
                      <span className="font-data-mono-sm text-data-mono-sm text-on-surface-variant">
                        Doc Ref: DOC-ORG-8812
                      </span>
                    </div>
                    <h2 className="font-headline-sm text-headline-sm text-on-surface font-bold">
                      Certified Group Ownership Structure Chart (≥25% Threshold)
                    </h2>
                  </div>
                </div>
              </div>
              <div className="bg-surface-container-low rounded p-space-md text-on-surface border border-outline-variant/30">
                <div className="flex items-center gap-space-xs text-error font-label-sm text-label-sm uppercase mb-space-2xs">
                  <span className="material-symbols-outlined text-[16px]">error</span>
                  Deficiency Assessment by Dev Patel (Analyst Notes)
                </div>
                <p className="font-body-sm text-body-sm text-on-surface-variant leading-relaxed">
                  "Previous document submitted on 12 Jan was a basic operational organogram without equity percentages or natural person UBOs. Helios Marine has a Marshall Islands intermediate holding entity which requires formal certification by legal counsel or director. Ultimate economic interest for the Scandinavian trust must be quantified."
                </p>
              </div>
              <div className="flex flex-wrap items-center justify-between text-on-surface-variant pt-space-xs gap-space-sm border-t border-surface-container-high/60">
                <div className="flex items-center gap-space-md font-data-mono-sm text-data-mono-sm">
                  <span className="flex items-center gap-space-2xs">
                    <span className="material-symbols-outlined text-[15px]">event</span>
                    Rejected: 14 Jan 2026
                  </span>
                  <span className="flex items-center gap-space-2xs">
                    <span className="material-symbols-outlined text-[15px]">history</span>
                    2 Reminders Sent
                  </span>
                </div>
                <span className="font-label-sm text-label-sm uppercase bg-surface-container text-on-surface px-space-xs py-space-2xs rounded">
                  Action Needed: Legal Certified Chart
                </span>
              </div>
            </div>

            {/* Defect Item 2 */}
            <div className="bg-surface-container-lowest rounded shadow-sm p-space-lg flex flex-col gap-space-md border border-border-hairline">
              <div className="flex items-start justify-between gap-space-md">
                <div className="flex items-start gap-space-sm">
                  <span className="material-symbols-outlined text-[22px] text-error mt-0.5 shrink-0">
                    badge
                  </span>
                  <div className="flex flex-col">
                    <div className="flex flex-wrap items-center gap-space-xs mb-space-2xs">
                      <span className="font-label-sm text-label-sm uppercase bg-error-container text-on-error-container px-space-xs py-space-2xs rounded font-semibold">
                        Overdue • Registry Staleness
                      </span>
                      <span className="font-data-mono-sm text-data-mono-sm text-on-surface-variant">
                        Doc Ref: DOC-MHL-EXTR-401
                      </span>
                    </div>
                    <h2 className="font-headline-sm text-headline-sm text-on-surface font-bold">
                      Official Commercial Registry Extract (Marshall Islands Maritime & Corporate Registry)
                    </h2>
                  </div>
                </div>
              </div>
              <div className="bg-surface-container-low rounded p-space-md text-on-surface border border-outline-variant/30">
                <div className="flex items-center gap-space-xs text-error font-label-sm text-label-sm uppercase mb-space-2xs">
                  <span className="material-symbols-outlined text-[16px]">error</span>
                  Deficiency Assessment by Dev Patel
                </div>
                <p className="font-body-sm text-body-sm text-on-surface-variant leading-relaxed">
                  "The submitted extract was dated over 12 months ago. Bank policy (AML-POL-2024.3) requires an original extract issued within the past 90 days with Apostille stamp."
                </p>
              </div>
            </div>
          </div>

          {/* Unblock & Resolution Action Desk */}
          <div className="bg-surface-container-lowest rounded shadow-sm p-space-lg flex flex-col gap-space-md border border-border-hairline">
            <div className="flex items-center justify-between pb-space-sm border-b border-surface-container-high/60">
              <div className="flex items-center gap-space-xs">
                <span className="material-symbols-outlined text-primary text-[18px]">verified_user</span>
                <h3 className="font-headline-sm text-headline-sm font-semibold text-on-surface">
                  RM Blocker Resolution Directives
                </h3>
              </div>
              <span className="font-label-sm text-label-sm uppercase text-on-surface-variant">
                Sign-off: Alistair Vance
              </span>
            </div>

            <div className="flex flex-col gap-space-xs">
              <label className="font-label-sm text-label-sm uppercase text-on-surface-variant">
                Remediation Strategy
              </label>
              <select
                value={selectedAction}
                onChange={(e) => setSelectedAction(e.target.value)}
                className="w-full bg-surface-container-low text-on-surface font-body-md text-body-md px-space-md py-space-sm rounded border border-outline-variant/30 focus:outline-none focus:ring-2 focus:ring-primary cursor-pointer"
              >
                <option value="direct-chase">
                  Issue Urgent Document Request to Client (Direct RM Outreach)
                </option>
                <option value="waiver">
                  Escalate to FCC Policy Committee for Temporary Conditional Waiver
                </option>
                <option value="kroll">
                  Reassign to External Corporate Investigations (Kroll / Refinitiv)
                </option>
              </select>
            </div>

            <div className="flex flex-col gap-space-xs">
              <label className="font-label-sm text-label-sm uppercase text-on-surface-variant">
                Directive & Guidance to Operations Desk
              </label>
              <textarea
                rows={4}
                value={analystDirective}
                onChange={(e) => setAnalystDirective(e.target.value)}
                className="w-full bg-surface-container-low text-on-surface font-body-md text-body-md p-space-md rounded border border-outline-variant/30 focus:outline-none focus:ring-2 focus:ring-primary"
              />
            </div>

            <div className="flex items-center justify-end gap-space-sm pt-space-xs">
              <button
                type="button"
                onClick={() => setActiveView('case-detail')}
                className="px-space-md py-space-sm rounded bg-surface-container-low hover:bg-surface-container text-on-surface font-label-md text-label-md transition-colors cursor-pointer"
              >
                Return to Case
              </button>
              <button
                type="button"
                onClick={handleResolveAction}
                className="px-space-xl py-space-sm rounded bg-primary-container text-white hover:bg-primary font-label-md text-label-md transition-all shadow-md flex items-center gap-space-xs cursor-pointer font-bold"
              >
                <span className="material-symbols-outlined text-[18px]">outgoing_mail</span>
                <span>Proceed to Reminder Composer</span>
              </button>
            </div>
          </div>
        </div>

        {/* Right Column (5 cols): Beneficial Ownership Diagram & Audit Thread */}
        <div className="lg:col-span-5 flex flex-col gap-space-lg">
          {/* UBO Ownership Tree Structure Card */}
          <div className="bg-surface-container-lowest rounded shadow-sm p-space-lg flex flex-col gap-space-md border border-border-hairline">
            <div className="flex items-center justify-between pb-space-sm border-b border-surface-container-high/60">
              <div className="flex items-center gap-space-xs">
                <span className="material-symbols-outlined text-[20px] text-on-surface">account_tree</span>
                <h3 className="font-headline-sm text-headline-sm font-semibold text-on-surface">
                  Recorded Entity Tree Structure
                </h3>
              </div>
              <span className="font-label-sm text-label-sm uppercase text-error font-semibold">
                Incomplete Chain
              </span>
            </div>

            <div className="bg-surface-container-low p-space-md rounded flex flex-col gap-space-sm border border-outline-variant/30 font-data-mono-sm text-data-mono-sm">
              <div className="p-space-sm rounded bg-surface-container-lowest border border-border-hairline">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-on-surface">Helios Marine Logistics Ltd (UK)</span>
                  <span className="text-secondary">Target Entity</span>
                </div>
                <div className="text-on-surface-variant text-[11px] mt-1">100% Operating Asset Fleet</div>
              </div>

              <div className="pl-6 border-l-2 border-dashed border-outline-variant flex flex-col gap-space-sm my-1">
                <div className="p-space-sm rounded bg-surface-container-lowest border border-border-hairline">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-on-surface">Nordic Maritime Holdings Inc (MHL)</span>
                    <span className="text-on-secondary-container">100% Equity</span>
                  </div>
                  <div className="text-error text-[11px] mt-1">Missing Certified Extract</div>
                </div>

                <div className="pl-6 border-l-2 border-dashed border-error flex flex-col gap-space-sm">
                  <div className="p-space-sm rounded bg-error-container/30 border border-error/40">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-error">Scandinavian Maritime Trust (Discretionary)</span>
                      <span className="text-error font-bold">UBO Gate Blocked</span>
                    </div>
                    <div className="text-on-surface text-[11px] mt-1 font-sans">
                      Requires identification of natural person beneficiaries holding ≥25% equivalent economic rights.
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Analyst Desk Notes */}
          <div className="bg-surface-container-lowest rounded shadow-sm p-space-lg flex flex-col gap-space-md border border-border-hairline">
            <div className="flex items-center justify-between pb-space-sm border-b border-surface-container-high/60">
              <div className="flex items-center gap-space-xs">
                <span className="material-symbols-outlined text-[20px] text-on-surface">support_agent</span>
                <h3 className="font-headline-sm text-headline-sm font-semibold text-on-surface">
                  Analyst Desk Coordination
                </h3>
              </div>
              <span className="font-label-sm text-label-sm uppercase text-on-surface-variant">Live Desk</span>
            </div>

            <div className="flex items-start gap-space-sm">
              <div className="w-8 h-8 rounded-full bg-secondary text-white flex items-center justify-center font-data-mono-sm text-data-mono-sm font-semibold shrink-0">
                DP
              </div>
              <div className="flex flex-col bg-surface-container-low p-space-sm rounded border border-outline-variant/30 w-full">
                <div className="flex items-center justify-between">
                  <span className="font-label-md text-label-md font-semibold text-on-surface">Dev Patel (Lead Analyst)</span>
                  <span className="font-data-mono-sm text-[11px] text-on-surface-variant">24 Feb 08:30 GMT</span>
                </div>
                <p className="font-body-sm text-body-sm text-on-surface-variant mt-1 leading-relaxed">
                  "Alistair, we cannot clear the account without the certified chart. If Marcus can send an original signed declaration from trust counsel in Stockholm, that will satisfy Reg 14."
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
