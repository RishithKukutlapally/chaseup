import React, { useState, useEffect } from 'react';
import { useChaseStore } from '../store/useChaseStore';

export const DraftingAgentView: React.FC = () => {
  const {
    selectedCase,
    workflow,
    startLangGraphWorkflow,
    adjustTone,
    approveAndSend,
    setActiveView,
    lastDispatchResult,
    clearLastDispatch,
  } = useChaseStore();

  const [subjectInput, setSubjectInput] = useState('');
  const [bodyInput, setBodyInput] = useState('');
  const [selectedTemplate, setSelectedTemplate] = useState('urgent-stage');
  const [selectedTone, setSelectedTone] = useState('urgent');
  const [isSending, setIsSending] = useState(false);
  const [showSuccessModal, setShowSuccessModal] = useState(false);

  useEffect(() => {
    if (selectedCase) {
      const defaultSubj =
        workflow.streamedSubject ||
        selectedCase.current_draft_subject ||
        `Urgent Follow-Up: Overdue KYC Documentation for ${selectedCase.client_name} (Ref: ${selectedCase.case_code})`;
      const defaultBody =
        workflow.streamedText ||
        selectedCase.current_draft_body ||
        `Dear Marcus,\n\nWe write further to our initial onboarding request regarding the institutional account opening for ${selectedCase.client_name} (Case ID: ${selectedCase.case_code}).\n\nOur Financial Crime Compliance desk notes that key prerequisite filings remain outstanding past our standard 3-day turnaround:\n\n• Certified Group Ownership Structure Chart (≥25% Threshold)\n• Official Commercial Registry Extract (Marshall Islands Maritime Registry)\n\nPlease submit the required documents via the secure Northgate Vault by Friday, 06 March 2026 to avoid further operational hold.\n\nSincerely,\nAlistair Vance\nSenior Relationship Manager — Corporate & Institutional Banking\nNorthgate Chase Bank`;

      setSubjectInput(defaultSubj);
      setBodyInput(defaultBody);
    }
  }, [selectedCase, workflow.streamedSubject, workflow.streamedText]);

  if (!selectedCase) {
    return (
      <div className="p-space-xl rounded bg-surface-container-lowest text-on-surface-variant">
        Select a corporate case from the Chase Queue to compose or review reminder drafts.
      </div>
    );
  }

  const missingDocs = selectedCase.documents.filter((d) => d.status === 'Missing');
  const wordCount = bodyInput.trim() ? bodyInput.trim().split(/\s+/).length : 0;

  const handleTemplateChange = (templateKey: string) => {
    setSelectedTemplate(templateKey);
    let toneVal = 'standard';
    if (templateKey === 'urgent-stage') toneVal = 'urgent';
    if (templateKey === 'final-warning') toneVal = 'legal';
    setSelectedTone(toneVal);
    void adjustTone(selectedCase.id, toneVal);
  };

  const handleToneChange = (toneVal: string) => {
    setSelectedTone(toneVal);
    void adjustTone(selectedCase.id, toneVal);
  };

  const handleSignAndSend = async () => {
    setIsSending(true);
    try {
      await approveAndSend(selectedCase.id, {
        subject: subjectInput,
        body: bodyInput,
        notify_analyst: true,
        cc_emails: ['legal@heliosmarine.co.uk', 'alistair.vance@northgatechase.com'],
      });
      setShowSuccessModal(true);
    } catch (err) {
      console.error('Dispatch failed', err);
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="flex flex-col w-full">
      {/* Top Sovereign Protocol & Governance Banner */}
      <div className="w-full bg-surface-container-high rounded p-space-lg shadow-sm mb-space-xl relative overflow-hidden border border-border-hairline">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-space-md relative z-10">
          <div className="flex items-start gap-space-md max-w-4xl">
            <div className="w-10 h-10 rounded bg-surface-container-lowest flex items-center justify-center shrink-0 shadow-sm text-error">
              <span className="material-symbols-outlined text-[24px]">gavel</span>
            </div>
            <div className="flex flex-col gap-space-2xs">
              <div className="flex items-center gap-space-sm flex-wrap">
                <span className="font-headline-sm text-headline-sm text-on-surface font-semibold">
                  DRAFT FOR RM REVIEW — DRAFTS NEVER SEND AUTOMATICALLY
                </span>
                <span className="font-label-sm text-label-sm uppercase bg-surface-container-lowest text-on-surface px-space-xs py-space-2xs rounded shadow-xs flex items-center gap-space-2xs border border-border-hairline">
                  <span className="w-2 h-2 rounded-full bg-error" />
                  Unapproved (Pending Alistair Vance Sign-off)
                </span>
              </div>
              <p className="font-body-md text-body-md text-on-surface-variant leading-relaxed">
                Review, calibrate formal wording, or tailor operational deadlines before authorizing sovereign dispatch. All electronic dispatches are immutably archived and hashed to the corporate case timeline under <strong>ISO-27001 KYC Regulatory Ledger Rules</strong>.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-space-sm shrink-0 bg-surface-container-lowest px-space-md py-space-sm rounded shadow-sm border border-border-hairline">
            <span className="material-symbols-outlined text-on-surface-variant text-[20px]">fingerprint</span>
            <div className="flex flex-col text-right">
              <span className="font-label-sm text-label-sm uppercase text-on-surface-variant">Sign-off Authority</span>
              <span className="font-data-mono-sm text-data-mono-sm font-semibold text-on-surface">A. Vance (RM-48821)</span>
            </div>
          </div>
        </div>
      </div>

      {/* Primary Workspace: Split Grid Architecture (12 cols) */}
      <div className="w-full grid grid-cols-1 lg:grid-cols-12 gap-space-xl items-start">
        {/* Left Column: Case Meta & Configuration Controls (5 Cols) */}
        <div className="lg:col-span-5 flex flex-col gap-space-lg">
          {/* Target Entity Card */}
          <div className="bg-surface-container-lowest rounded p-space-lg shadow-sm flex flex-col gap-space-md border border-border-hairline">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-space-xs text-on-surface-variant font-label-sm text-label-sm uppercase">
                <span className="material-symbols-outlined text-[16px]">domain</span>
                <span>Target Onboarding Case File</span>
              </div>
              <span className="font-data-mono-sm text-data-mono-sm bg-surface-container px-space-xs py-space-2xs rounded font-medium text-on-surface">
                {selectedCase.case_code}
              </span>
            </div>

            <div className="flex items-start justify-between gap-space-md">
              <div>
                <h2 className="font-headline-md text-headline-md text-on-surface font-semibold">
                  {selectedCase.client_name}
                </h2>
                <p className="font-body-sm text-body-sm text-on-surface-variant mt-space-2xs">
                  {selectedCase.jurisdiction} {selectedCase.entity_type} • Stage: Document Chasing
                </p>
              </div>
              <div className="w-12 h-12 rounded bg-surface-container flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined text-on-surface text-[24px]">corporate_fare</span>
              </div>
            </div>

            <div className="grid grid-cols-3 gap-space-sm pt-space-xs text-center">
              <div className="bg-surface-container-low rounded p-space-xs">
                <span className="font-label-sm text-label-sm uppercase text-on-surface-variant block">First Notice</span>
                <span className="font-data-mono-sm text-data-mono-sm font-medium text-on-surface">
                  {selectedCase.last_contact_date || '19 Feb 2026'}
                </span>
              </div>
              <div className="bg-surface-container-low rounded p-space-xs">
                <span className="font-label-sm text-label-sm uppercase text-on-surface-variant block">Days Elapsed</span>
                <span className="font-data-mono-sm text-data-mono-sm font-medium text-error">
                  +{selectedCase.days_since_contact} Days
                </span>
              </div>
              <div className="bg-surface-container-low rounded p-space-xs">
                <span className="font-label-sm text-label-sm uppercase text-on-surface-variant block">Deficiencies</span>
                <span className="font-data-mono-sm text-data-mono-sm font-semibold text-on-surface">
                  {missingDocs.length} Items
                </span>
              </div>
            </div>
          </div>

          {/* Dispatch Configuration Panel */}
          <div className="bg-surface-container-lowest rounded p-space-lg shadow-sm flex flex-col gap-space-md border border-border-hairline">
            <div className="flex items-center justify-between border-b pb-space-sm border-surface-container-high/60">
              <div className="flex items-center gap-space-xs">
                <span className="material-symbols-outlined text-primary text-[18px]">tune</span>
                <span className="font-headline-sm text-headline-sm text-on-surface font-semibold">
                  Dispatch Configuration
                </span>
              </div>
              <span className="font-label-sm text-label-sm text-on-surface-variant uppercase">
                Protocol: Chase Round {selectedCase.chase_round_count}
              </span>
            </div>

            {/* Template Selector */}
            <div className="flex flex-col gap-space-2xs">
              <label className="font-label-sm text-label-sm uppercase text-on-surface-variant flex items-center justify-between">
                <span>Template Formulation</span>
                <span className="text-on-surface font-semibold lowercase">ai-assisted draft</span>
              </label>
              <div className="relative">
                <select
                  value={selectedTemplate}
                  onChange={(e) => handleTemplateChange(e.target.value)}
                  className="w-full bg-surface-container-low text-on-surface font-body-md text-body-md px-space-md py-space-sm rounded appearance-none cursor-pointer focus:outline-none focus:bg-surface-container-lowest shadow-xs border border-outline-variant/30 pr-space-2xl"
                >
                  <option value="first-nudge">Corporate Onboarding — First Friendly Nudge (Standard T+3)</option>
                  <option value="urgent-stage">Corporate Onboarding — Second Follow-up (Urgent / Stage Blocked)</option>
                  <option value="final-warning">Corporate Onboarding — Final Pre-Escalation Warning (T+14 to Legal)</option>
                  <option value="ad-hoc">Ad-Hoc Specialized Corporate Filing Item Request</option>
                </select>
                <span className="material-symbols-outlined pointer-events-none absolute right-space-md top-1/2 -translate-y-1/2 text-on-surface-variant text-[20px]">
                  expand_more
                </span>
              </div>
            </div>

            {/* Recipient */}
            <div className="flex flex-col gap-space-2xs">
              <label className="font-label-sm text-label-sm uppercase text-on-surface-variant">
                Primary Signatory & Recipient
              </label>
              <div className="flex items-center gap-space-sm bg-surface-container-low px-space-md py-space-sm rounded border border-outline-variant/30">
                <span className="material-symbols-outlined text-on-surface-variant text-[18px]">badge</span>
                <div className="flex flex-col min-w-0">
                  <span className="font-body-md text-body-md text-on-surface font-medium truncate">
                    {selectedCase.contact_name} &lt;{selectedCase.contact_email}&gt;
                  </span>
                  <span className="font-label-sm text-label-sm text-on-surface-variant truncate">
                    {selectedCase.contact_role}
                  </span>
                </div>
              </div>
            </div>

            {/* CC Distribution */}
            <div className="flex flex-col gap-space-2xs">
              <label className="font-label-sm text-label-sm uppercase text-on-surface-variant">
                Audited CC Distribution
              </label>
              <div className="bg-surface-container-low p-space-sm rounded flex flex-col gap-space-xs border border-outline-variant/30">
                <div className="flex flex-wrap gap-space-2xs">
                  <span className="bg-surface-container-lowest text-on-surface font-data-mono-sm text-data-mono-sm px-space-xs py-space-2xs rounded shadow-xs flex items-center gap-space-2xs border border-border-hairline">
                    legal@{selectedCase.client_name.toLowerCase().replace(/[^a-z]/g, '')}.com
                  </span>
                  <span className="bg-surface-container-lowest text-on-surface font-data-mono-sm text-data-mono-sm px-space-xs py-space-2xs rounded shadow-xs flex items-center gap-space-2xs border border-border-hairline">
                    alistair.vance@northgatechase.com
                    <span className="material-symbols-outlined text-[14px] text-on-surface-variant">lock</span>
                  </span>
                  <span className="bg-surface-container-lowest text-on-surface font-data-mono-sm text-data-mono-sm px-space-xs py-space-2xs rounded shadow-xs flex items-center gap-space-2xs border border-border-hairline">
                    kyc-ops-desk@northgatechase.com
                    <span className="material-symbols-outlined text-[14px] text-on-surface-variant">lock</span>
                  </span>
                </div>
              </div>
            </div>

            {/* Tone Calibration Buttons */}
            <div className="flex flex-col gap-space-2xs">
              <label className="font-label-sm text-label-sm uppercase text-on-surface-variant">
                Tone & Authority Calibration
              </label>
              <div className="grid grid-cols-3 gap-space-xs">
                <button
                  type="button"
                  onClick={() => handleToneChange('polite')}
                  className={`py-space-xs px-space-sm rounded font-label-sm text-label-sm cursor-pointer transition-colors ${
                    selectedTone === 'polite'
                      ? 'bg-primary-container text-white font-semibold'
                      : 'bg-surface-container-low text-on-surface hover:bg-surface-container'
                  }`}
                >
                  Standard Professional
                </button>
                <button
                  type="button"
                  onClick={() => handleToneChange('urgent')}
                  className={`py-space-xs px-space-sm rounded font-label-sm text-label-sm cursor-pointer transition-colors ${
                    selectedTone === 'urgent'
                      ? 'bg-error-container text-on-error-container font-semibold border border-error/30'
                      : 'bg-surface-container-low text-on-surface hover:bg-surface-container'
                  }`}
                >
                  Urgent Escalated
                </button>
                <button
                  type="button"
                  onClick={() => handleToneChange('legal')}
                  className={`py-space-xs px-space-sm rounded font-label-sm text-label-sm cursor-pointer transition-colors ${
                    selectedTone === 'legal'
                      ? 'bg-secondary text-white font-semibold'
                      : 'bg-surface-container-low text-on-surface hover:bg-surface-container'
                  }`}
                >
                  Legal Pre-Action
                </button>
              </div>
            </div>

            {/* Run AI Generator Trigger */}
            <button
              type="button"
              onClick={() => {
                startLangGraphWorkflow(selectedCase.id, {
                  navigateToDrafting: true,
                  tone: selectedTone,
                });
              }}
              disabled={workflow.isRunning}
              className="mt-space-xs w-full py-space-sm rounded bg-surface-container hover:bg-surface-container-high text-on-surface font-label-md text-label-md transition-colors flex items-center justify-center gap-space-xs cursor-pointer border border-border-hairline"
            >
              <span className="material-symbols-outlined text-[16px]">smart_toy</span>
              <span>{workflow.isRunning ? 'Streaming Synthesis...' : 'Regenerate AI Variant via LangGraph'}</span>
            </button>
          </div>
        </div>

        {/* Right Column: The Live Reminder Letter & Sign-Off Chassis (7 Cols) */}
        <div className="lg:col-span-7 flex flex-col gap-space-lg">
          <div className="bg-surface-container-lowest rounded p-space-lg shadow-sm flex flex-col gap-space-md border border-border-hairline">
            <div className="flex items-center justify-between pb-space-sm border-b border-surface-container-high/60">
              <span className="font-headline-sm text-headline-sm font-semibold text-on-surface">
                Formal Dispatch Letter Draft
              </span>
              <div className="flex items-center gap-space-xs">
                <span className="font-label-sm text-label-sm text-status-success bg-surface-container-low px-space-xs py-space-2xs rounded flex items-center gap-1">
                  <span className="material-symbols-outlined text-[13px]">check_circle</span>
                  Compliance Validated
                </span>
                <span className="font-data-mono-sm text-data-mono-sm text-on-surface-variant bg-surface-container px-space-xs py-space-2xs rounded">
                  {wordCount} words
                </span>
              </div>
            </div>

            {/* Subject Line */}
            <div className="flex flex-col gap-space-2xs">
              <label className="font-label-sm text-label-sm uppercase text-on-surface-variant">Subject Line</label>
              <input
                type="text"
                value={subjectInput}
                onChange={(e) => setSubjectInput(e.target.value)}
                className="w-full bg-surface-container-low text-on-surface font-body-md text-body-md px-space-md py-space-sm rounded focus:outline-none focus:bg-surface-container-lowest focus:ring-2 focus:ring-primary border border-outline-variant/30 font-medium"
              />
            </div>

            {/* Letter Body Textarea */}
            <div className="flex flex-col gap-space-2xs">
              <label className="font-label-sm text-label-sm uppercase text-on-surface-variant flex items-center justify-between">
                <span>Formal Notification Text (RM Editable)</span>
                <span className="text-on-surface-variant text-[11px]">Audit ID: HASH-2026-8812-CIB</span>
              </label>
              <textarea
                rows={16}
                value={bodyInput}
                onChange={(e) => setBodyInput(e.target.value)}
                className="w-full bg-surface-container-low text-on-surface font-body-md text-body-md p-space-md rounded focus:outline-none focus:bg-surface-container-lowest focus:ring-2 focus:ring-primary border border-outline-variant/30 font-mono text-[13px] leading-relaxed"
              />
            </div>

            {/* Governance Sign-Off Action Bar */}
            <div className="pt-space-md border-t border-surface-container-high/60 flex flex-wrap items-center justify-between gap-space-md">
              <div className="flex items-center gap-space-sm text-on-surface-variant font-label-sm text-label-sm">
                <span className="material-symbols-outlined text-[18px]">verified_user</span>
                <span>RM Vance digital certificate will be attached</span>
              </div>

              <div className="flex items-center gap-space-sm">
                <button
                  type="button"
                  onClick={() => setActiveView('chase-queue')}
                  className="px-space-md py-space-sm rounded bg-surface-container-low hover:bg-surface-container text-on-surface font-label-md text-label-md transition-colors cursor-pointer"
                >
                  Discard / Return
                </button>
                <button
                  type="button"
                  onClick={handleSignAndSend}
                  disabled={isSending || workflow.isRunning}
                  className="px-space-xl py-space-sm rounded bg-primary-container text-white hover:bg-primary font-label-md text-label-md transition-all shadow-md flex items-center gap-space-xs cursor-pointer font-bold disabled:opacity-50"
                >
                  <span className="material-symbols-outlined text-[18px]">send</span>
                  <span>{isSending ? 'Authenticating & Sending...' : 'Sign & Authorize Sovereign Dispatch (A. Vance)'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Dispatch Success Modal */}
      {showSuccessModal && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
          <div className="bg-surface-container-lowest rounded-lg max-w-lg w-full p-space-xl shadow-2xl border border-border-hairline flex flex-col gap-space-md">
            <div className="w-12 h-12 rounded-full bg-secondary-container text-on-secondary-container flex items-center justify-center">
              <span className="material-symbols-outlined text-[28px]">check_circle</span>
            </div>
            <h3 className="font-headline-md text-headline-md font-bold text-on-surface">
              Sovereign Dispatch Completed
            </h3>
            <p className="font-body-md text-body-md text-on-surface-variant">
              The KYC chase notice has been authorized by <strong>Alistair Vance</strong> and transmitted to <strong>{selectedCase.contact_name}</strong>.
            </p>
            <div className="bg-surface-container-low p-space-sm rounded font-data-mono-sm text-data-mono-sm text-on-surface flex flex-col gap-1">
              <div>Tracking Ref: <span className="font-bold">{lastDispatchResult?.tracking_id || 'CHASE-TRK-8812-B'}</span></div>
              <div className="truncate text-on-surface-variant text-[10px]">
                Immutable Hash: {lastDispatchResult?.audit_hash || '0x7f48e920fa392817d8329bc01928471928374'}
              </div>
            </div>
            <div className="flex justify-end gap-space-sm mt-space-sm">
              <button
                type="button"
                onClick={() => {
                  setShowSuccessModal(false);
                  clearLastDispatch();
                  setActiveView('chase-queue');
                }}
                className="px-space-lg py-space-sm rounded bg-primary-container text-white font-label-md text-label-md cursor-pointer font-semibold"
              >
                Return to Chase Queue
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
