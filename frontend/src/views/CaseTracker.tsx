import React, { useState } from 'react';
import { useChaseStore } from '../store/useChaseStore';

function getInitials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return parts.length >= 2
    ? `${parts[0][0]}${parts[1][0]}`.toUpperCase()
    : name.slice(0, 2).toUpperCase();
}

export const CaseTracker: React.FC = () => {
  const {
    summary,
    selectedCase,
    selectCase,
    toggleDocumentStatus,
    startLangGraphWorkflow,
    resetCaseDemo,
    updateCaseNote,
    setActiveView,
  } = useChaseStore();

  const [docFilter, setDocFilter] = useState<'all' | 'deficient' | 'approved'>('all');
  const [editingNote, setEditingNote] = useState(false);
  const [noteDraft, setNoteDraft] = useState('');
  const [contactedToast, setContactedToast] = useState(false);

  if (!selectedCase) {
    return (
      <div className="p-space-xl rounded bg-surface-container-lowest text-on-surface-variant">
        Loading case telemetry...
      </div>
    );
  }

  const allDocs = selectedCase.documents ?? [];
  const deficientDocs = allDocs.filter((d) => d.status === 'Missing');
  const approvedDocs = allDocs.filter((d) => d.status === 'Verified' || d.status === 'Received');

  const filteredDocs =
    docFilter === 'deficient'
      ? deficientDocs
      : docFilter === 'approved'
      ? approvedDocs
      : allDocs;

  const totalDocsCount = allDocs.length || 8;
  const verifiedCount = selectedCase.verified_count || approvedDocs.length;
  const completionPct = Math.round((verifiedCount / totalDocsCount) * 100);

  const handleMarkContacted = () => {
    setContactedToast(true);
    setTimeout(() => setContactedToast(false), 3000);
  };

  const handleSaveNote = async () => {
    if (noteDraft.trim()) {
      await updateCaseNote(selectedCase.id, noteDraft);
      setEditingNote(false);
    }
  };

  return (
    <div className="flex flex-col w-full gap-space-lg">
      {/* Quick Case Switcher Ribbon */}
      <div className="flex flex-wrap items-center justify-between gap-space-sm bg-surface-container-lowest px-space-md py-space-xs rounded shadow-xs border border-border-hairline">
        <div className="flex items-center gap-space-xs flex-wrap">
          <span className="font-data-mono-sm text-data-mono-sm text-on-surface-variant uppercase mr-1">
            Active Desk Portfolio:
          </span>
          {(summary?.cases ?? []).slice(0, 6).map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => void selectCase(c.id)}
              className={`px-space-sm py-0.5 rounded font-data-mono-sm text-data-mono-sm transition-colors cursor-pointer ${
                c.id === selectedCase.id
                  ? 'bg-primary-container text-white font-bold'
                  : 'bg-surface-container-low text-on-surface-variant hover:bg-surface-container'
              }`}
            >
              {c.case_code} • {c.client_name.split(' ')[0]}
            </button>
          ))}
        </div>
        <button
          type="button"
          onClick={() => void resetCaseDemo(selectedCase.id)}
          className="flex items-center gap-1 px-space-sm py-0.5 rounded bg-surface-container-low hover:bg-surface-container text-on-surface-variant hover:text-on-surface font-data-mono-sm text-data-mono-sm transition-colors cursor-pointer"
        >
          <span className="material-symbols-outlined text-[14px]">restart_alt</span>
          <span>Reset Case SLA</span>
        </button>
      </div>

      {contactedToast && (
        <div className="p-space-sm rounded bg-secondary-container text-on-secondary-container font-label-md text-label-md flex items-center justify-between shadow-sm">
          <span>Client Marcus Sterling marked contacted via phone (Logged to audit trail).</span>
          <button type="button" onClick={() => setContactedToast(false)} className="cursor-pointer font-bold">✕</button>
        </div>
      )}

      {/* Top Sovereign Institutional Context Canvas */}
      <div className="relative w-full bg-surface-container-lowest shadow-sm rounded-lg p-space-lg overflow-hidden border border-border-hairline">
        <div className="absolute -right-16 -top-16 w-96 h-96 rounded-full bg-secondary-container/20 blur-3xl pointer-events-none" />

        {/* Entity Master Tier Bar */}
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-space-lg relative z-10 pb-space-md border-b border-surface-container-high/60">
          <div className="flex flex-wrap items-center gap-space-md min-w-0">
            <div className="w-12 h-12 rounded bg-primary-container text-white flex items-center justify-center shrink-0 font-data-mono-md text-data-mono-md font-bold shadow-sm">
              {getInitials(selectedCase.client_name)}
            </div>
            <div className="flex flex-col min-w-0">
              <div className="flex flex-wrap items-center gap-space-sm">
                <h1 className="font-headline-lg text-headline-lg text-on-surface tracking-tight font-semibold truncate">
                  {selectedCase.client_name}
                </h1>
                {selectedCase.sla_breached ? (
                  <span className="inline-flex items-center gap-space-2xs bg-error-container text-on-error-container px-space-xs py-space-2xs rounded font-label-sm text-label-sm uppercase font-semibold">
                    <span className="material-symbols-outlined text-[14px]">error</span>
                    Chasing Round {selectedCase.chase_round_count} (Overdue)
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-space-2xs bg-surface-container text-on-surface px-space-xs py-space-2xs rounded font-label-sm text-label-sm uppercase font-semibold">
                    <span className="material-symbols-outlined text-[14px]">check_circle</span>
                    Round {selectedCase.chase_round_count} Active
                  </span>
                )}
                <span className="bg-surface-container-high text-on-surface-variant font-data-mono-sm text-data-mono-sm px-space-xs py-space-2xs rounded">
                  {selectedCase.desk} Desk
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-x-space-md gap-y-space-xs mt-space-2xs font-data-mono-sm text-data-mono-sm text-on-surface-variant">
                <span>
                  Case ID: <strong className="text-on-surface">{selectedCase.case_code}</strong>
                </span>
                <span className="text-outline-variant">•</span>
                <span>
                  LEI: <span className="tracking-wider">{selectedCase.lei}</span>
                </span>
                <span className="text-outline-variant">•</span>
                <span>Entity: {selectedCase.entity_type}</span>
                <span className="text-outline-variant">•</span>
                <span className="flex items-center gap-space-2xs">
                  <span className="material-symbols-outlined text-[14px] text-secondary">public</span>
                  {selectedCase.jurisdiction}
                </span>
              </div>
            </div>
          </div>

          {/* Header Operations Actions */}
          <div className="flex flex-wrap items-center gap-space-sm shrink-0">
            <button
              type="button"
              onClick={handleMarkContacted}
              className="px-space-md py-space-xs rounded bg-surface-container text-on-surface font-label-md text-label-md hover:bg-surface-container-high transition-colors flex items-center gap-space-xs shadow-sm cursor-pointer"
            >
              <span className="material-symbols-outlined text-[16px]">call</span>
              <span>Mark Contacted</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveView('analyst-handoff')}
              className="px-space-md py-space-xs rounded bg-surface-container text-on-surface font-label-md text-label-md hover:bg-surface-container-high transition-colors flex items-center gap-space-xs shadow-sm cursor-pointer"
            >
              <span className="material-symbols-outlined text-[16px]">share</span>
              <span>Handoff</span>
            </button>
            <button
              type="button"
              onClick={() => {
                startLangGraphWorkflow(selectedCase.id, { navigateToDrafting: true });
              }}
              className="px-space-lg py-space-xs rounded bg-primary-container text-white font-label-md text-label-md hover:bg-primary transition-all flex items-center gap-space-xs shadow-md cursor-pointer font-semibold"
            >
              <span className="material-symbols-outlined text-[16px]">outgoing_mail</span>
              <span>Chase Outstanding ({selectedCase.missing_count})</span>
            </button>
          </div>
        </div>

        {/* Telemetry & Ownership Strip (6 columns) */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-space-md pt-space-md mt-space-2xs">
          <div className="flex flex-col">
            <span className="font-label-sm text-label-sm text-on-surface-variant uppercase">
              Assigned RM
            </span>
            <div className="flex items-center gap-space-xs mt-space-2xs">
              <div className="w-6 h-6 rounded-full bg-secondary-container text-on-secondary-container flex items-center justify-center font-data-mono-sm text-[10px] font-bold">
                {getInitials(selectedCase.assigned_rm)}
              </div>
              <span className="font-label-md text-label-md font-semibold text-on-surface truncate">
                {selectedCase.assigned_rm}
              </span>
            </div>
          </div>

          <div className="flex flex-col">
            <span className="font-label-sm text-label-sm text-on-surface-variant uppercase">
              Ops Coordinator
            </span>
            <div className="flex items-center gap-space-xs mt-space-2xs">
              <div className="w-6 h-6 rounded-full bg-surface-container-high text-on-surface flex items-center justify-center font-data-mono-sm text-[10px]">
                CG
              </div>
              <span className="font-label-md text-label-md font-semibold text-on-surface">
                Clara Gomez
              </span>
            </div>
          </div>

          <div className="flex flex-col">
            <span className="font-label-sm text-label-sm text-on-surface-variant uppercase">
              KYC Lead Analyst
            </span>
            <div className="flex items-center gap-space-xs mt-space-2xs">
              <div className="w-6 h-6 rounded-full bg-secondary text-white flex items-center justify-center font-data-mono-sm text-[10px]">
                DP
              </div>
              <span className="font-label-md text-label-md font-semibold text-on-surface">
                Dev Patel
              </span>
            </div>
          </div>

          <div className="flex flex-col">
            <span className="font-label-sm text-label-sm text-on-surface-variant uppercase">
              Stage Duration
            </span>
            <div className="flex items-baseline gap-space-xs mt-space-2xs">
              <span
                className={`font-data-mono-md text-data-mono-md font-semibold ${
                  selectedCase.days_since_contact > 7 ? 'text-error' : 'text-on-surface'
                }`}
              >
                {selectedCase.days_since_contact} Days
              </span>
              <span className="font-body-sm text-body-sm text-on-surface-variant">(Target: 7d)</span>
            </div>
          </div>

          <div className="flex flex-col">
            <span className="font-label-sm text-label-sm text-on-surface-variant uppercase">
              Total Elapsed
            </span>
            <div className="flex items-baseline gap-space-xs mt-space-2xs">
              <span className="font-data-mono-md text-data-mono-md font-semibold text-on-surface">
                {selectedCase.days_open} Days
              </span>
              <span className="font-body-sm text-body-sm text-on-surface-variant">Limit: 45d</span>
            </div>
          </div>

          <div className="flex flex-col">
            <span className="font-label-sm text-label-sm text-on-surface-variant uppercase">
              Completion Metric
            </span>
            <div className="flex items-center gap-space-xs mt-space-2xs">
              <div className="w-full bg-surface-container-high rounded h-2 relative overflow-hidden">
                <div
                  className="bg-primary-container h-full rounded transition-all duration-300"
                  style={{ width: `${completionPct}%` }}
                />
              </div>
              <span className="font-data-mono-sm text-data-mono-sm font-semibold text-on-surface shrink-0">
                {verifiedCount}/{totalDocsCount}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Operational Dual Layout (12 cols) */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-space-xl items-start">
        {/* LEFT 7 COLS: Document Inventory & Verification Controls */}
        <div className="xl:col-span-7 flex flex-col gap-space-lg">
          {/* Inventory Header with Filter Buttons */}
          <div className="flex items-center justify-between bg-surface-container-lowest px-space-lg py-space-md rounded shadow-sm border border-border-hairline">
            <div className="flex items-center gap-space-sm">
              <span className="material-symbols-outlined text-[20px] text-on-surface">checklist</span>
              <h2 className="font-headline-sm text-headline-sm font-semibold text-on-surface">
                Regulatory Document Inventory
              </h2>
              <span className="font-data-mono-sm text-data-mono-sm bg-surface-container text-on-surface-variant px-space-xs py-space-2xs rounded">
                {allDocs.length} Items Mandated
              </span>
            </div>
            <div className="flex items-center gap-space-xs">
              <button
                type="button"
                onClick={() => setDocFilter('all')}
                className={`px-space-xs py-space-2xs rounded font-label-sm text-label-sm cursor-pointer ${
                  docFilter === 'all'
                    ? 'bg-surface-container text-on-surface font-semibold'
                    : 'text-on-surface-variant hover:bg-surface-container'
                }`}
              >
                All ({allDocs.length})
              </button>
              <button
                type="button"
                onClick={() => setDocFilter('deficient')}
                className={`px-space-xs py-space-2xs rounded font-label-sm text-label-sm cursor-pointer ${
                  docFilter === 'deficient'
                    ? 'bg-error-container text-on-error-container font-semibold'
                    : 'text-on-surface-variant hover:bg-surface-container'
                }`}
              >
                Deficient ({deficientDocs.length})
              </button>
              <button
                type="button"
                onClick={() => setDocFilter('approved')}
                className={`px-space-xs py-space-2xs rounded font-label-sm text-label-sm cursor-pointer ${
                  docFilter === 'approved'
                    ? 'bg-surface-container text-on-surface font-semibold'
                    : 'text-on-surface-variant hover:bg-surface-container'
                }`}
              >
                Approved ({approvedDocs.length})
              </button>
            </div>
          </div>

          {/* Document Items List */}
          <div className="bg-surface-container-lowest rounded shadow-sm overflow-hidden border border-border-hairline divide-y divide-surface-container-low">
            {filteredDocs.map((doc) => {
              const isMissing = doc.status === 'Missing';
              return (
                <div
                  key={doc.id}
                  className={`p-space-md transition-colors flex flex-col md:flex-row md:items-center justify-between gap-space-md ${
                    isMissing ? 'bg-error-container/10' : 'hover:bg-surface-container-low/40'
                  }`}
                >
                  <div className="flex items-start gap-space-sm min-w-0">
                    <span
                      className={`material-symbols-outlined text-[18px] mt-0.5 shrink-0 ${
                        isMissing ? 'text-error' : 'text-status-success'
                      }`}
                    >
                      {isMissing ? 'report_problem' : 'task_alt'}
                    </span>
                    <div className="flex flex-col min-w-0">
                      <div className="flex flex-wrap items-center gap-space-xs">
                        <span className="font-body-md text-body-md font-semibold text-on-surface">
                          {doc.document_name}
                        </span>
                        {isMissing ? (
                          <span className="font-label-sm text-label-sm bg-error-container text-on-error-container px-space-xs py-space-2xs rounded">
                            Actionable Deficiency
                          </span>
                        ) : (
                          <span className="font-label-sm text-label-sm bg-secondary-container text-on-secondary-container px-space-xs py-space-2xs rounded">
                            Verified
                          </span>
                        )}
                      </div>
                      <p className="font-body-sm text-body-sm text-on-surface-variant mt-1">
                        {doc.description || doc.requirement_meta}
                      </p>
                      <div className="flex flex-wrap items-center gap-space-xs font-data-mono-sm text-data-mono-sm text-on-surface-variant mt-space-2xs">
                        <span>Doc Code: {doc.doc_code}</span>
                        <span>•</span>
                        <span>Assigned: {doc.assigned_to_or_verifier}</span>
                        <span>•</span>
                        <span className={isMissing ? 'text-error font-semibold' : 'text-status-success'}>
                          {isMissing ? 'Missing from Vault' : 'Authenticated & Approved'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Actions for Document */}
                  <div className="flex items-center gap-space-xs shrink-0 self-end md:self-center">
                    <button
                      type="button"
                      onClick={() => void toggleDocumentStatus(selectedCase.id, doc.id)}
                      className={`px-space-sm py-space-xs rounded font-label-sm text-label-sm transition-colors cursor-pointer border ${
                        isMissing
                          ? 'bg-surface-container hover:bg-surface-container-high text-on-surface border-border-structural'
                          : 'bg-surface-container-low text-on-surface-variant border-transparent hover:bg-surface-container'
                      }`}
                    >
                      {isMissing ? 'Mark Received' : 'Re-open Item'}
                    </button>
                    {isMissing && (
                      <button
                        type="button"
                        onClick={() => {
                          startLangGraphWorkflow(selectedCase.id, { navigateToDrafting: true });
                        }}
                        className="px-space-sm py-space-xs rounded bg-primary-container text-white hover:bg-primary font-label-sm text-label-sm transition-colors flex items-center gap-1 cursor-pointer font-semibold shadow-xs"
                      >
                        <span className="material-symbols-outlined text-[13px]">outgoing_mail</span>
                        <span>Chase</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* RIGHT 5 COLS: Blocked Warning, Audit Timeline, Relationship Notes */}
        <div className="xl:col-span-5 flex flex-col gap-space-lg">
          {/* Panel 1: Blocked Stages Warning Panel */}
          <div className="bg-surface-container-lowest rounded shadow-sm p-space-lg overflow-hidden relative border border-border-hairline">
            <div className="absolute top-0 left-0 w-1.5 h-full bg-error" />
            <div className="flex items-start gap-space-md">
              <div className="w-10 h-10 rounded bg-error-container text-on-error-container flex items-center justify-center shrink-0">
                <span className="material-symbols-outlined text-[24px]">gpp_bad</span>
              </div>
              <div className="flex flex-col min-w-0">
                <span className="font-label-sm text-label-sm uppercase font-semibold text-error tracking-wider">
                  Stage Blocked: UBO Extraction Cannot Proceed
                </span>
                <p className="font-body-sm text-body-sm text-on-surface mt-space-xs leading-relaxed">
                  KYC Analyst <strong>Dev Patel</strong> marked downstream stage blocked on <strong>24 Jan 2026</strong>. Missing prerequisite items:
                </p>
                <div className="bg-surface-container-low rounded p-space-sm my-space-sm flex flex-col gap-space-2xs font-data-mono-sm text-data-mono-sm text-on-surface-variant">
                  <div className="flex items-center gap-space-xs">
                    <span className="material-symbols-outlined text-[14px] text-error">close</span>
                    <span className="text-on-surface">Certified Group Ownership Structure Chart</span>
                  </div>
                  <div className="flex items-center gap-space-xs">
                    <span className="material-symbols-outlined text-[14px] text-error">close</span>
                    <span className="text-on-surface">Official Commercial Registry Extract</span>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-space-sm mt-space-xs pt-space-sm border-t border-surface-container-high/60">
                  <button
                    type="button"
                    onClick={() => setActiveView('analyst-handoff')}
                    className="px-space-md py-space-xs rounded bg-surface-container-high text-on-surface hover:bg-surface-variant font-label-md text-label-md transition-colors flex items-center gap-space-xs cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-[16px]">sync_alt</span>
                    <span>View Handoff Desk</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveView('reminder-composer')}
                    className="px-space-md py-space-xs rounded bg-primary-container text-white hover:bg-primary font-label-md text-label-md transition-colors flex items-center gap-space-xs cursor-pointer font-semibold shadow-xs"
                  >
                    <span className="material-symbols-outlined text-[16px]">outgoing_mail</span>
                    <span>Draft Urgent Follow-up</span>
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Panel 2: Chase Audit Timeline */}
          <div className="bg-surface-container-lowest rounded shadow-sm p-space-lg flex flex-col border border-border-hairline">
            <div className="flex items-center justify-between pb-space-sm mb-space-md border-b border-surface-container-high/60">
              <div className="flex items-center gap-space-xs">
                <span className="material-symbols-outlined text-[20px] text-on-surface">schedule</span>
                <h3 className="font-headline-sm text-headline-sm font-semibold text-on-surface">
                  Chase Audit Timeline
                </h3>
              </div>
              <span className="font-label-sm text-label-sm text-on-surface-variant uppercase">
                Immutable Policy Log
              </span>
            </div>

            <div className="relative pl-space-lg flex flex-col gap-space-md before:content-[''] before:absolute before:left-[11px] before:top-2 before:bottom-2 before:w-[2px] before:bg-surface-container-high">
              {(selectedCase.actions && selectedCase.actions.length > 0
                ? selectedCase.actions
                : [
                    {
                      id: 1,
                      action_type: 'Draft_Generated',
                      timestamp: '24 Feb 2026 • 09:15',
                      actor: 'LangGraph Autonomous Agent',
                      details: 'Reminder Round 2 generated by automated template; awaiting RM Vance review and sign-off.',
                    },
                    {
                      id: 2,
                      action_type: 'RM_Approved',
                      timestamp: '17 Feb 2026 • 14:30',
                      actor: 'Alistair Vance (Senior RM)',
                      details: 'First formal KYC chase notification dispatched to Marcus Sterling.',
                    },
                  ]
              ).map((act, index) => (
                <div key={act.id || index} className="relative flex items-start gap-space-sm">
                  <span className="absolute -left-[27px] top-1 w-3 h-3 rounded-full bg-secondary-container border-2 border-surface-container-lowest shadow-sm" />
                  <div className="flex flex-col w-full">
                    <div className="flex items-center justify-between">
                      <span className="font-data-mono-sm text-data-mono-sm font-semibold text-on-surface">
                        {act.timestamp}
                      </span>
                      <span className="font-label-sm text-label-sm bg-surface-container text-on-surface-variant px-space-xs py-space-2xs rounded">
                        {act.action_type}
                      </span>
                    </div>
                    <p className="font-body-sm text-body-sm text-on-surface mt-space-2xs">
                      {act.details}
                    </p>
                    <span className="font-data-mono-sm text-[10px] text-on-surface-variant mt-0.5">
                      Actor: {act.actor}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Panel 3: Relationship Notes */}
          <div className="bg-surface-container-lowest rounded shadow-sm p-space-lg flex flex-col border border-border-hairline">
            <div className="flex items-center justify-between pb-space-sm mb-space-sm border-b border-surface-container-high/60">
              <span className="font-label-sm text-label-sm uppercase font-semibold text-on-surface">
                RM Guidance & Client Context
              </span>
              <button
                type="button"
                onClick={() => {
                  setEditingNote(!editingNote);
                  setNoteDraft(selectedCase.relationship_notes);
                }}
                className="text-on-tertiary-container hover:underline font-label-sm text-label-sm cursor-pointer"
              >
                {editingNote ? 'Cancel' : 'Edit Note'}
              </button>
            </div>
            {editingNote ? (
              <div className="flex flex-col gap-2">
                <textarea
                  value={noteDraft}
                  onChange={(e) => setNoteDraft(e.target.value)}
                  className="w-full p-2 bg-surface-container-low text-on-surface font-body-sm text-body-sm rounded border border-outline-variant/30 focus:outline-none focus:ring-2 focus:ring-primary"
                  rows={3}
                />
                <button
                  type="button"
                  onClick={handleSaveNote}
                  className="self-end px-space-md py-space-xs bg-primary-container text-white rounded font-label-sm text-label-sm cursor-pointer font-semibold"
                >
                  Save Note
                </button>
              </div>
            ) : (
              <p className="font-body-sm text-body-sm text-on-surface-variant leading-relaxed">
                {selectedCase.relationship_notes || 'No specialized guidance specified for this corporate entity.'}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
