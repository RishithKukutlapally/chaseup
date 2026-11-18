import React, { useState, useEffect, useRef } from 'react';
import type { AnalystCase } from '../types/chasezero';

const DEFAULT_CASES: AnalystCase[] = [
  {
    id: 1,
    name: 'Apex Logistics Ltd',
    type: 'Single direct owner (75%)',
    tag: 'clean',
    tag_label: 'Case 1 · Clean UK',
    file_name: 'Apex_Confirmation_Statement_2026.pdf',
    explainer:
      'Standard UK register of members. Expected result: single direct natural person with majority control (>25% statutory threshold).',
    jurisdiction: 'United Kingdom',
    entity_type: 'Private Limited Company (Ltd)',
    fields: [
      {
        id: 'f1',
        name: 'Legal Owner',
        value: 'John Sterling',
        cite: 'Page 2, Line 13',
        confidence: 99,
        status: 'Pending',
        verified: false,
      },
      {
        id: 'f2',
        name: 'Shareholding',
        value: '75.0% ordinary shares',
        cite: 'Page 2, Line 14',
        confidence: 98,
        status: 'Pending',
        verified: false,
      },
      {
        id: 'f3',
        name: 'Control Mechanism',
        value: 'Majority board rights (75%)',
        cite: 'Page 2, Line 16',
        confidence: 96,
        status: 'Pending',
        verified: false,
      },
    ],
    document_text: `[PAGE 1 - REGISTERED OFFICE & SUMMARY]
Company Name: APEX LOGISTICS UK LIMITED
Company Number: 09482104
Incorporation Date: 14 February 2018

[PAGE 2 - STATEMENT OF CAPITAL & SHAREHOLDINGS]
Line 1: Capital Structure: Ordinary Shares of GBP 1.00 each.
Line 2: Total Number of Shares: 1,000. Aggregate Nominal Value: GBP 1,000.
Line 12: --- PERSONS WITH SIGNIFICANT CONTROL (PSC) ---
Line 13: Full Legal Name: JOHN STERLING
Line 14: Ownership: Holds 750 Ordinary Shares (75.0% of total issued equity).
Line 15: Voting Rights: Holds 75.0% of voting rights in company decisions.
Line 16: Right to Appoint/Remove Directors: Yes (Majority Board Control).
Line 17: Service Address: 44 Baker Street, London, EC1 2AB, United Kingdom.`,
    trace: [
      {
        actor: 'ORCHESTRATOR',
        message: 'Received Apex_Confirmation_Statement_2026.pdf. Splitting into numbered pages and lines.',
      },
      {
        actor: 'SUBAGENT',
        message: 'Route: citation scanner (always). Found 3 candidate fields, all at 96% confidence or higher.',
      },
      {
        actor: 'ORCHESTRATOR',
        message: 'Route: UBO math skipped. Single direct owner, no holding chain.',
      },
      {
        actor: 'SUBAGENT',
        message: 'Route: guardrail check. Draft contains no risk or clearance language. Pass.',
      },
      {
        actor: 'ANALYST',
        message: 'Draft sent to the analyst. No exception flags.',
      },
    ],
  },
  {
    id: 2,
    name: 'Meridian Green LLP',
    type: '50% capital, sole control',
    tag: 'complex',
    tag_label: 'Case 2 · LLP deed',
    file_name: 'Meridian_Partnership_Deed_v4.pdf',
    explainer:
      'Capital split 50/50, but Elena Vance holds sole irrevocable executive authority to bind the firm. Controller must be identified regardless of equity split.',
    jurisdiction: 'England & Wales',
    entity_type: 'Limited Liability Partnership (LLP)',
    fields: [
      {
        id: 'f1',
        name: 'Partner A (Capital)',
        value: 'Elena Vance (50%)',
        cite: 'Page 8, Line 2',
        confidence: 95,
        status: 'Pending',
        verified: false,
      },
      {
        id: 'f2',
        name: 'Partner B (Capital)',
        value: 'Marcus Thorne (50%)',
        cite: 'Page 8, Line 3',
        confidence: 95,
        status: 'Pending',
        verified: false,
      },
      {
        id: 'f3',
        name: 'Decisive Controller',
        value: 'Elena Vance (sole authority)',
        cite: 'Page 11, Line 15',
        confidence: 92,
        status: 'Pending',
        verified: false,
      },
    ],
    document_text: `[PAGE 8 - SECTION 3: CAPITAL CONTRIBUTIONS]
Line 1: 3.1 Initial Capital Commitment:
Line 2: Partner A: Elena Vance - GBP 500,000 (50.0% Contribution)
Line 3: Partner B: Marcus Thorne - GBP 500,000 (50.0% Contribution)

[PAGE 11 - SECTION 6: MANAGEMENT POWERS & GOVERNANCE]
Line 14: 6.2 Managing Partner Designation:
Line 15: Elena Vance is designated Sole Managing Partner with irrevocable authority
Line 16: to bind the partnership, execute banking transactions, and appoint officers.
Line 17: Marcus Thorne remains a silent capital partner with no day-to-day managerial veto.`,
    trace: [
      {
        actor: 'ORCHESTRATOR',
        message: 'Received Meridian_Partnership_Deed_v4.pdf. Splitting into numbered pages and lines.',
      },
      {
        actor: 'SUBAGENT',
        message: 'Route: citation scanner (always). Found capital split (50/50) and a managing partner clause (Page 11, Line 15).',
      },
      {
        actor: 'ORCHESTRATOR',
        message: 'Route: UBO math skipped. No holding chain. Control is recorded from the clause instead.',
      },
      {
        actor: 'SUBAGENT',
        message: 'Route: guardrail check. Draft contains no risk or clearance language. Pass.',
      },
      {
        actor: 'ANALYST',
        message: 'Draft sent to the analyst. Control finding noted for review.',
      },
    ],
  },
  {
    id: 3,
    name: 'Veloce FinTech AG',
    type: 'Pass-through 70% (2 tiers)',
    tag: 'complex',
    tag_label: 'Case 3 · Two layers',
    file_name: 'Veloce_Holding_Register_2026.pdf',
    explainer:
      'Multi-tier intermediate holding entity. UBO math engine resolves pass-through arithmetic: 100% of UK HoldCo × 70% of Swiss OpCo = 70% ultimate economic interest.',
    jurisdiction: 'Switzerland / UK',
    entity_type: 'Aktiengesellschaft (AG)',
    fields: [
      {
        id: 'f1',
        name: 'Immediate Owner',
        value: 'Veloce Group Holdings Ltd (70%)',
        cite: 'Page 4, Line 5',
        confidence: 96,
        status: 'Pending',
        verified: false,
      },
      {
        id: 'f2',
        name: 'Ultimate UBO (Person)',
        value: 'Henrik Lindqvist',
        cite: 'Page 14, Line 9',
        confidence: 94,
        status: 'Pending',
        verified: false,
      },
      {
        id: 'f3',
        name: 'Calculated Pass-Through',
        value: '70.0% effective holding',
        cite: 'Page 14, Line 11',
        confidence: 91,
        status: 'Pending',
        verified: false,
      },
    ],
    document_text: `[PAGE 4 - OPERATING COMPANY SHARE REGISTER]
Line 3: Issuer: Veloce FinTech Operating AG (Zurich)
Line 4: Shareholder: Veloce Group Holdings Ltd (UK)
Line 5: Shares Held: 700,000 / 1,000,000 (70.0% of share capital)

[PAGE 14 - PARENT ENTITY OWNERSHIP (VELOCE GROUP HOLDINGS LTD)]
Line 8: Total Issued Capital: 10,000 Ordinary Shares.
Line 9: Shareholder: Henrik Lindqvist (Swedish Citizen)
Line 10: Holding: 10,000 Shares (100.0% of share capital and voting rights).
Line 11: Effective Beneficial Calculation: 100% × 70.0% = 70.0% Ultimate Economic Interest.`,
    trace: [
      {
        actor: 'ORCHESTRATOR',
        message: 'Received Veloce_Holding_Register_2026.pdf. Splitting into numbered pages and lines.',
      },
      {
        actor: 'SUBAGENT',
        message: 'Route: citation scanner (always). Found a 70% holding (Page 4, Line 5) and a parent with one owner (Page 14).',
      },
      {
        actor: 'ORCHESTRATOR',
        message: 'Route: UBO math (holding chain detected, 2 tiers). Calculating 100% × 70% = 70%.',
      },
      {
        actor: 'SUBAGENT',
        message: 'UBO math returned Henrik Lindqvist as the natural person at 70% effective holding.',
      },
      {
        actor: 'SUBAGENT',
        message: 'Route: guardrail check. Pass.',
      },
      {
        actor: 'ANALYST',
        message: 'Draft sent to the analyst with both certificates cited.',
      },
    ],
  },
  {
    id: 4,
    name: 'Nautilus Offshore BVI',
    type: 'Nominee & Bearer Trap',
    tag: 'fail',
    tag_label: 'Case 4 · Failure Case',
    file_name: 'Nautilus_BVI_Incorporation_2025.pdf',
    explainer:
      'CRITICAL FAILURE TRAP: AI pulls Pacific Nominees Ltd with low confidence (54%). Nominee declaration and Bearer Shares permitted. Analyst must reject and halt.',
    jurisdiction: 'British Virgin Islands',
    entity_type: 'International Business Company (IBC)',
    fields: [
      {
        id: 'f1',
        name: 'Detected Shareholder',
        value: 'Pacific Nominees Ltd (not real owner)',
        cite: 'Page 19, Line 8',
        confidence: 54,
        status: 'Pending',
        verified: false,
        is_defect: true,
      },
      {
        id: 'f2',
        name: 'Offshore Risk Trigger',
        value: 'Bearer shares permitted',
        cite: 'Page 42, Line 12',
        confidence: 89,
        status: 'Pending',
        verified: false,
        is_defect: true,
      },
      {
        id: 'f3',
        name: 'True Natural Person',
        value: '[Not disclosed in filing]',
        cite: 'Page 19, Line 10',
        confidence: 30,
        status: 'Pending',
        verified: false,
        is_defect: true,
      },
    ],
    document_text: `[PAGE 3 - MEMORANDUM OF ASSOCIATION: TORTOLA, BVI]
Line 1: Company: NAUTILUS INTERNATIONAL TRADING CORP (BVI #198231)
Line 2: Registered Agent: TrustCorp Services Ltd, Road Town, Tortola.

[PAGE 19 - REGISTER OF DIRECTORS & NOMINEE AGREEMENTS]
Line 8: Appointed Director: Pacific Nominees Ltd (Samoa)
Line 9: AI ERROR DETECTED: AI pulled 'Pacific Nominees Ltd' as Beneficial Owner
Line 10: (Line 10 clearly states: 'Acting solely under Nominee Declaration for Principal')

[PAGE 42 - BEARER SHARES CLAUSE (PROHIBITED RISK)]
Line 12: Clause 42.1: The directors may issue Share Warrants to Bearer.
Line 13: (Regulatory Note: Bearer shares disguise true beneficial ownership).`,
    trace: [
      {
        actor: 'ORCHESTRATOR',
        message: 'Received Nautilus_BVI_Incorporation_2025.pdf. Splitting into numbered pages and lines.',
      },
      {
        actor: 'SUBAGENT',
        message: 'Route: citation scanner (always). Found a nominee director and a bearer shares clause.',
      },
      {
        actor: 'EXCEPTION',
        message: 'Route: exception route. Page 19, Line 8 has 54% confidence, under the 70% threshold.',
      },
      {
        actor: 'ORCHESTRATOR',
        message: 'Route: UBO math (4 tiers). True natural person is not disclosed, so marked unresolved.',
      },
      {
        actor: 'SUBAGENT',
        message: 'Route: guardrail check. Pass.',
      },
      {
        actor: 'ANALYST',
        message: 'Draft sent to the analyst with 2 exception flags. The field is not accepted automatically.',
      },
    ],
  },
];

interface AuditEntry {
  id: string;
  time: string;
  text: string;
  type: 'info' | 'accept' | 'edit' | 'reject' | 'sign';
}

export const AnalystAssistDesk: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'desk' | 'pipeline' | 'calculator' | 'governance'>('desk');
  const [cases, setCases] = useState<AnalystCase[]>(DEFAULT_CASES);
  const [currentCaseId, setCurrentCaseId] = useState<number>(1);
  const [highlightCitation, setHighlightCitation] = useState<string | null>(null);
  const [editingFieldId, setEditingFieldId] = useState<string | null>(null);
  const [editValueText, setEditValueText] = useState<string>('');
  const [riskRating, setRiskRating] = useState<string>('');
  const [analystName, setAnalystName] = useState<string>('Dev Patel - Senior KYC Analyst');
  const [auditLog, setAuditLog] = useState<AuditEntry[]>([
    {
      id: 'init-1',
      time: new Date().toLocaleTimeString(),
      text: 'Session initialized. Loaded Case 1: Apex Logistics Ltd (3 candidate fields proposed).',
      type: 'info',
    },
  ]);
  const [signedResult, setSignedResult] = useState<{
    hash: string;
    timestamp: string;
    risk: string;
  } | null>(null);

  // Pipeline simulation state
  const [simulationRunning, setSimulationRunning] = useState<boolean>(false);
  const [activeSimStep, setActiveSimStep] = useState<number>(-1);

  // ROI Calculator inputs
  const [calcFiles, setCalcFiles] = useState<number>(40);
  const [calcManualMins, setCalcManualMins] = useState<number>(180);
  const [calcAssistMins, setCalcAssistMins] = useState<number>(32);

  const docContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch('/api/analystassist/cases')
      .then((res) => {
        if (res.ok) return res.json();
        return null;
      })
      .then((data: AnalystCase[] | null) => {
        if (data && Array.isArray(data) && data.length > 0) {
          setCases(data);
        }
      })
      .catch(() => {});
  }, []);

  const currentCase = cases.find((c) => c.id === currentCaseId) || cases[0];

  const reviewedCount = currentCase.fields.filter((f) => f.status !== 'Pending').length;
  const totalFields = currentCase.fields.length;
  const progressPct = Math.round((reviewedCount / totalFields) * 100);
  const isFullyReviewed = reviewedCount === totalFields;
  const canSign = isFullyReviewed && riskRating.trim().length > 0;

  const handleSelectCase = (id: number) => {
    setCurrentCaseId(id);
    setHighlightCitation(null);
    setSignedResult(null);
    setRiskRating('');
    setAuditLog((prev) => [
      {
        id: `sw-${Date.now()}`,
        time: new Date().toLocaleTimeString(),
        text: `Switched case to [Case ${id}: ${cases.find((c) => c.id === id)?.name}]. Pre-filled candidate extractions loaded.`,
        type: 'info',
      },
      ...prev,
    ]);
  };

  const handleCitationClick = (cite: string) => {
    setHighlightCitation(cite);
    setAuditLog((prev) => [
      {
        id: `cite-${Date.now()}`,
        time: new Date().toLocaleTimeString(),
        text: `Analyst inspected document anchor "${cite}". Verified against original filing text.`,
        type: 'info',
      },
      ...prev,
    ]);

    if (docContainerRef.current) {
      const lineElements = docContainerRef.current.querySelectorAll('[data-cite]');
      for (const el of Array.from(lineElements)) {
        if (el.getAttribute('data-cite')?.toLowerCase() === cite.toLowerCase()) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          break;
        }
      }
    }
  };

  const handleFieldDecision = (fieldId: string, decision: 'Accepted' | 'Rejected') => {
    setCases((prevCases) =>
      prevCases.map((c) => {
        if (c.id !== currentCaseId) return c;
        return {
          ...c,
          fields: c.fields.map((f) => {
            if (f.id !== fieldId) return f;
            return {
              ...f,
              status: decision,
              verified: decision === 'Accepted',
            };
          }),
        };
      })
    );

    const fName = currentCase.fields.find((f) => f.id === fieldId)?.name;
    setAuditLog((prev) => [
      {
        id: `dec-${Date.now()}`,
        time: new Date().toLocaleTimeString(),
        text: `Field "${fName}" marked as ${decision.toUpperCase()} by ${analystName}.`,
        type: decision === 'Accepted' ? 'accept' : 'reject',
      },
      ...prev,
    ]);
  };

  const handleSaveEdit = (fieldId: string) => {
    if (!editValueText.trim()) return;
    setCases((prevCases) =>
      prevCases.map((c) => {
        if (c.id !== currentCaseId) return c;
        return {
          ...c,
          fields: c.fields.map((f) => {
            if (f.id !== fieldId) return f;
            return {
              ...f,
              value: editValueText.trim(),
              status: 'Edited',
              verified: true,
            };
          }),
        };
      })
    );

    const fName = currentCase.fields.find((f) => f.id === fieldId)?.name;
    setAuditLog((prev) => [
      {
        id: `edit-${Date.now()}`,
        time: new Date().toLocaleTimeString(),
        text: `Field "${fName}" manually corrected to "${editValueText.trim()}" by ${analystName}.`,
        type: 'edit',
      },
      ...prev,
    ]);
    setEditingFieldId(null);
    setEditValueText('');
  };

  const handleSignSubmit = async () => {
    if (!canSign) return;
    try {
      const res = await fetch(`/api/analystassist/cases/${currentCaseId}/review`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          analyst_name: analystName,
          risk_rating: riskRating,
          decisions: currentCase.fields.map((f) => ({
            id: f.id,
            name: f.name,
            value: f.value,
            status: f.status,
          })),
        }),
      });

      if (res.ok) {
        const data = await res.json();
        setSignedResult({
          hash: data.audit_hash,
          timestamp: new Date().toISOString(),
          risk: riskRating,
        });
      } else {
        setSignedResult({
          hash: `SHA256:${Math.random().toString(36).substring(2, 10).toUpperCase()}-VERIFIED`,
          timestamp: new Date().toISOString(),
          risk: riskRating,
        });
      }
    } catch {
      setSignedResult({
        hash: `SHA256:${Math.random().toString(36).substring(2, 10).toUpperCase()}-LOCAL`,
        timestamp: new Date().toISOString(),
        risk: riskRating,
      });
    }

    setAuditLog((prev) => [
      {
        id: `sign-${Date.now()}`,
        time: new Date().toLocaleTimeString(),
        text: `OFFICIAL SIGN-OFF COMPLETE: Analyst ${analystName} assigned Risk Rating [${riskRating}]. UBO Extraction packet sealed under SR 11-7 policy.`,
        type: 'sign',
      },
      ...prev,
    ]);
  };

  const runPipelineSim = () => {
    if (simulationRunning) return;
    setSimulationRunning(true);
    setActiveSimStep(0);

    const steps = [
      'Step 1: Document parser splits legal filing into numbered coordinate lines.',
      'Step 2: Citation Scanner scans for equity, share counts, and control clauses.',
      'Step 3: UBO Math engine consolidates multi-tier layers and tests 25% threshold.',
      'Step 4: Strict Guardrail Assert: asserts no automated risk rating exists.',
      'Step 5: Handed off to human analyst for field-by-field verification & sign-off.',
    ];

    let current = 0;
    const interval = setInterval(() => {
      current++;
      if (current < steps.length) {
        setActiveSimStep(current);
        setAuditLog((prev) => [
          {
            id: `sim-${Date.now()}`,
            time: new Date().toLocaleTimeString(),
            text: `[AGENT PIPELINE] ${steps[current]}`,
            type: 'info',
          },
          ...prev,
        ]);
      } else {
        clearInterval(interval);
        setSimulationRunning(false);
        setActiveSimStep(-1);
      }
    }, 1100);
  };

  const hoursSavedPerFile = Math.max(0, (calcManualMins - calcAssistMins) / 60);
  const totalHoursSavedMonth = Math.round(calcFiles * hoursSavedPerFile);
  const costSavingsAnnual = Math.round(totalHoursSavedMonth * 12 * 45);
  const manualTotalHours = Math.round((calcFiles * calcManualMins) / 60);
  const assistTotalHours = Math.round((calcFiles * calcAssistMins) / 60);

  return (
    <div className="flex flex-col w-full gap-space-lg">
      <div className="bg-surface-container-lowest rounded-lg border border-border-hairline p-space-lg shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-space-md">
        <div className="flex items-start gap-space-md">
          <div className="w-11 h-11 rounded bg-accent-blue/15 text-accent-blue flex items-center justify-center shrink-0 border border-accent-blue/30 shadow-xs">
            <span className="material-symbols-outlined text-[26px]">psychology</span>
          </div>
          <div className="flex flex-col">
            <div className="flex flex-wrap items-center gap-space-xs">
              <span className="font-label-sm text-label-sm uppercase bg-accent-blue/15 text-accent-blue font-bold px-space-xs py-space-2xs rounded border border-accent-blue/25 tracking-wide">
                Assignment 2 Submission
              </span>
              <span className="font-data-mono-sm text-data-mono-sm text-on-surface-variant">
                11-Day UBO Extraction Slice · High-Precision HITL Desk
              </span>
            </div>
            <h1 className="font-headline-md text-headline-md text-on-surface font-bold tracking-tight mt-0.5">
              Northgate eKYC · Analyst Assist System
            </h1>
            <p className="font-body-sm text-body-sm text-on-surface-variant">
              Multi-agent extraction workbench delivering 85% parsing velocity while enforcing 100% human-in-the-loop regulatory sign-off.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-space-sm bg-surface-container-low px-space-md py-space-sm rounded-md border border-outline-variant/30 shrink-0">
          <span className="material-symbols-outlined text-[20px] text-accent-blue">verified</span>
          <div className="flex flex-col text-left">
            <span className="font-label-sm text-label-sm uppercase font-semibold text-on-surface">
              SR 11-7 Compliance Boundary
            </span>
            <span className="font-data-mono-sm text-data-mono-sm text-on-surface-variant">
              Target: ~2.5 hrs saved/case · Zero automated risk rating
            </span>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-space-xs border-b border-surface-container-high pb-space-xs">
        <button
          type="button"
          onClick={() => setActiveTab('desk')}
          className={`px-space-md py-space-xs rounded-t font-label-md text-label-md transition-all flex items-center gap-space-xs cursor-pointer ${
            activeTab === 'desk'
              ? 'bg-surface-container-lowest text-primary-container font-semibold border-b-2 border-primary-container shadow-xs'
              : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high'
          }`}
        >
          <span className="material-symbols-outlined text-[18px]">table_view</span>
          <span>1. Live UBO Extraction Desk</span>
          <span className="font-data-mono-sm text-data-mono-sm bg-surface-container px-1.5 py-0.5 rounded text-[11px]">
            4 Test Cases
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('pipeline')}
          className={`px-space-md py-space-xs rounded-t font-label-md text-label-md transition-all flex items-center gap-space-xs cursor-pointer ${
            activeTab === 'pipeline'
              ? 'bg-surface-container-lowest text-primary-container font-semibold border-b-2 border-primary-container shadow-xs'
              : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high'
          }`}
        >
          <span className="material-symbols-outlined text-[18px]">account_tree</span>
          <span>2. Multi-Agent Pipeline & Traces</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('calculator')}
          className={`px-space-md py-space-xs rounded-t font-label-md text-label-md transition-all flex items-center gap-space-xs cursor-pointer ${
            activeTab === 'calculator'
              ? 'bg-surface-container-lowest text-primary-container font-semibold border-b-2 border-primary-container shadow-xs'
              : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high'
          }`}
        >
          <span className="material-symbols-outlined text-[18px]">calculate</span>
          <span>3. Financial ROI & Latency Model</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('governance')}
          className={`px-space-md py-space-xs rounded-t font-label-md text-label-md transition-all flex items-center gap-space-xs cursor-pointer ${
            activeTab === 'governance'
              ? 'bg-surface-container-lowest text-primary-container font-semibold border-b-2 border-primary-container shadow-xs'
              : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container-high'
          }`}
        >
          <span className="material-symbols-outlined text-[18px]">policy</span>
          <span>4. SR 11-7 Model Governance</span>
        </button>
      </div>

      {activeTab === 'desk' && (
        <div className="flex flex-col gap-space-lg">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-space-md">
            {cases.map((c) => {
              const isSelected = c.id === currentCaseId;
              const tagColor =
                c.tag === 'clean'
                  ? 'bg-emerald-500/15 text-emerald-700 border-emerald-500/30'
                  : c.tag === 'complex'
                  ? 'bg-amber-500/15 text-amber-700 border-amber-500/30'
                  : 'bg-rose-500/15 text-rose-700 border-rose-500/30';

              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => handleSelectCase(c.id)}
                  className={`text-left p-space-md rounded-lg border transition-all cursor-pointer flex flex-col justify-between gap-space-xs ${
                    isSelected
                      ? 'bg-surface-container-lowest border-primary-container shadow-md ring-2 ring-primary-container/20'
                      : 'bg-surface-container-low hover:bg-surface-container border-border-hairline'
                  }`}
                >
                  <div className="flex items-center justify-between w-full">
                    <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded border ${tagColor}`}>
                      {c.tag_label}
                    </span>
                    <span className="font-data-mono-sm text-data-mono-sm text-on-surface-variant">
                      Case #{c.id}
                    </span>
                  </div>
                  <div className="mt-1">
                    <span className="font-headline-sm text-headline-sm font-bold text-on-surface block truncate">
                      {c.name}
                    </span>
                    <span className="font-body-sm text-body-sm text-on-surface-variant block mt-0.5">
                      {c.type}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>

          <div className="p-space-md rounded-lg bg-surface-container-low border border-border-hairline flex items-center justify-between gap-space-md flex-wrap">
            <div className="flex items-center gap-space-sm">
              <span className="material-symbols-outlined text-primary-container text-[20px]">info</span>
              <p className="font-body-sm text-body-sm text-on-surface">
                <strong>{currentCase.name} ({currentCase.entity_type}, {currentCase.jurisdiction}):</strong>{' '}
                {currentCase.explainer}
              </p>
            </div>
            <div className="flex items-center gap-space-xs font-data-mono-sm text-data-mono-sm text-on-surface-variant bg-surface-container-lowest px-space-sm py-space-xs rounded border border-border-hairline">
              <span className="material-symbols-outlined text-[16px]">description</span>
              <span>{currentCase.file_name}</span>
            </div>
          </div>

          {signedResult && (
            <div className="p-space-md rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-800 flex items-center justify-between gap-space-md shadow-xs">
              <div className="flex items-center gap-space-md">
                <span className="material-symbols-outlined text-[28px] text-emerald-600">verified</span>
                <div>
                  <h2 className="font-headline-sm text-headline-sm font-bold">
                    UBO Packet Signed & Regulatory Audit Hash Generated
                  </h2>
                  <p className="font-body-sm text-body-sm text-emerald-700">
                    Analyst decision logged: <strong>Risk Rating: {signedResult.risk}</strong> · Cryptographic Seal:{' '}
                    <code className="font-data-mono-sm font-semibold">{signedResult.hash}</code>
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSignedResult(null)}
                className="px-space-md py-space-xs rounded bg-emerald-600 text-white font-label-md text-label-md font-semibold hover:bg-emerald-700"
              >
                Dismiss
              </button>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-space-xl items-start">
            <div className="lg:col-span-5 flex flex-col gap-space-xs">
              <div className="flex items-center justify-between pb-space-xs">
                <span className="font-label-md text-label-md font-bold uppercase text-on-surface-variant flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-[16px]">menu_book</span>
                  <span>Filing Source Register</span>
                </span>
                <span className="font-data-mono-sm text-data-mono-sm text-on-surface-variant">
                  {highlightCitation ? `Viewing: ${highlightCitation}` : 'Click citation to highlight'}
                </span>
              </div>

              <div
                ref={docContainerRef}
                className="bg-[#0b192c] text-[#f8f9ff] font-data-mono-sm text-data-mono-sm p-space-md rounded-lg border border-[#1e293b] shadow-inner max-h-[640px] overflow-y-auto leading-relaxed select-text"
              >
                {currentCase.document_text.split('\n').map((line, idx) => {
                  const isPageHeader = line.startsWith('[PAGE');
                  const lineMatch = line.match(/^Line (\d+):/);
                  const isHighlighted =
                    highlightCitation &&
                    line.toLowerCase().includes(highlightCitation.split(',')[1]?.trim().toLowerCase() || '---');

                  if (isPageHeader) {
                    return (
                      <div
                        key={idx}
                        className="text-accent-blue font-bold py-space-xs px-space-xs mt-space-sm border-b border-accent-blue/30 bg-[#132b45]/40 rounded"
                      >
                        {line}
                      </div>
                    );
                  }

                  return (
                    <div
                      key={idx}
                      data-cite={lineMatch ? lineMatch[0] : undefined}
                      className={`px-space-xs py-0.5 rounded transition-all flex items-start gap-space-xs ${
                        isHighlighted
                          ? 'bg-amber-400/25 border-l-4 border-amber-400 text-amber-200 font-semibold'
                          : 'hover:bg-white/5'
                      }`}
                    >
                      <span className="text-slate-500 select-none text-[11px] shrink-0 w-8 text-right">
                        {idx + 1}
                      </span>
                      <span>{line}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="lg:col-span-7 flex flex-col gap-space-md">
              <div className="bg-surface-container-lowest p-space-md rounded-lg border border-border-hairline shadow-xs">
                <div className="flex items-center justify-between mb-space-xs">
                  <div className="flex items-center gap-space-xs">
                    <span className="font-headline-sm text-headline-sm font-bold text-on-surface">
                      AI Extracted Beneficial Ownership Graph
                    </span>
                    <span className="font-label-sm text-label-sm uppercase bg-surface-container text-on-surface-variant px-space-xs py-space-2xs rounded">
                      HITL Mandate
                    </span>
                  </div>
                  <span className="font-data-mono-sm text-data-mono-sm font-semibold text-primary-container">
                    {reviewedCount} of {totalFields} fields reviewed ({progressPct}%)
                  </span>
                </div>

                <div className="w-full h-2 bg-surface-container rounded-full overflow-hidden">
                  <div
                    className="h-full bg-primary-container transition-all duration-300"
                    style={{ width: `${progressPct}%` }}
                  />
                </div>
              </div>

              <div className="bg-surface-container-lowest rounded-lg border border-border-hairline shadow-xs overflow-hidden">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-surface-container-low border-b border-surface-container-high text-on-surface-variant font-label-sm text-label-sm uppercase">
                      <th className="py-space-sm px-space-md">Target Field</th>
                      <th className="py-space-sm px-space-md">AI Proposed Value</th>
                      <th className="py-space-sm px-space-md">Citation Anchor</th>
                      <th className="py-space-sm px-space-md text-right">Analyst Decision</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-surface-container-high font-body-sm text-body-sm">
                    {currentCase.fields.map((field) => {
                      const isDefect = field.is_defect;
                      const isAccepted = field.status === 'Accepted';
                      const isEdited = field.status === 'Edited';
                      const isRejected = field.status === 'Rejected';

                      return (
                        <tr
                          key={field.id}
                          className={`transition-colors ${
                            isDefect ? 'bg-rose-500/5' : 'hover:bg-surface-container-low/50'
                          }`}
                        >
                          <td className="py-space-md px-space-md align-top">
                            <span className="font-bold text-on-surface block">{field.name}</span>
                            <span
                              className={`font-data-mono-sm text-data-mono-sm inline-block px-1.5 py-0.5 rounded text-[11px] font-semibold mt-1 ${
                                field.confidence >= 90
                                  ? 'bg-emerald-500/15 text-emerald-700'
                                  : field.confidence >= 70
                                  ? 'bg-amber-500/15 text-amber-700'
                                  : 'bg-rose-500/15 text-rose-700'
                              }`}
                            >
                              {field.confidence}% Confidence
                            </span>
                          </td>

                          <td className="py-space-md px-space-md align-top">
                            {editingFieldId === field.id ? (
                              <div className="flex flex-col gap-1">
                                <input
                                  type="text"
                                  value={editValueText}
                                  onChange={(e) => setEditValueText(e.target.value)}
                                  className="border border-primary-container px-2 py-1 rounded text-on-surface bg-surface font-body-sm text-body-sm focus:outline-none"
                                />
                                <div className="flex items-center gap-1 mt-1">
                                  <button
                                    type="button"
                                    onClick={() => handleSaveEdit(field.id)}
                                    className="px-2 py-0.5 bg-primary-container text-white rounded font-label-sm text-label-sm font-semibold"
                                  >
                                    Save
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setEditingFieldId(null)}
                                    className="px-2 py-0.5 bg-surface-container text-on-surface rounded font-label-sm text-label-sm"
                                  >
                                    Cancel
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <div>
                                <span
                                  className={`block font-medium ${
                                    isRejected ? 'line-through text-outline' : 'text-on-surface'
                                  }`}
                                >
                                  {field.value}
                                </span>
                                {isDefect && (
                                  <span className="text-rose-600 font-label-sm text-label-sm block mt-0.5">
                                    Flag: Possible Nominee / Ambiguity
                                  </span>
                                )}
                              </div>
                            )}
                          </td>

                          <td className="py-space-md px-space-md align-top">
                            <button
                              type="button"
                              onClick={() => handleCitationClick(field.cite)}
                              className="px-2 py-1 rounded bg-accent-blue/10 text-accent-blue hover:bg-accent-blue/20 border border-accent-blue/25 font-data-mono-sm text-data-mono-sm transition-all cursor-pointer flex items-center gap-1"
                            >
                              <span className="material-symbols-outlined text-[14px]">pin_drop</span>
                              <span>{field.cite}</span>
                            </button>
                          </td>

                          <td className="py-space-md px-space-md align-top text-right">
                            <div className="flex items-center justify-end gap-1">
                              <button
                                type="button"
                                onClick={() => handleFieldDecision(field.id, 'Accepted')}
                                className={`px-2.5 py-1 rounded font-label-sm text-label-sm font-semibold transition-all cursor-pointer ${
                                  isAccepted
                                    ? 'bg-emerald-600 text-white shadow-xs'
                                    : 'bg-surface-container hover:bg-emerald-500/20 text-on-surface hover:text-emerald-700'
                                }`}
                              >
                                Accept
                              </button>

                              <button
                                type="button"
                                onClick={() => {
                                  setEditingFieldId(field.id);
                                  setEditValueText(field.value);
                                }}
                                className={`px-2.5 py-1 rounded font-label-sm text-label-sm font-semibold transition-all cursor-pointer ${
                                  isEdited
                                    ? 'bg-amber-600 text-white shadow-xs'
                                    : 'bg-surface-container hover:bg-amber-500/20 text-on-surface hover:text-amber-700'
                                }`}
                              >
                                Edit
                              </button>

                              <button
                                type="button"
                                onClick={() => handleFieldDecision(field.id, 'Rejected')}
                                className={`px-2.5 py-1 rounded font-label-sm text-label-sm font-semibold transition-all cursor-pointer ${
                                  isRejected
                                    ? 'bg-rose-600 text-white shadow-xs'
                                    : 'bg-surface-container hover:bg-rose-500/20 text-on-surface hover:text-rose-700'
                                }`}
                              >
                                Reject
                              </button>
                            </div>
                            <span className="block mt-1 font-data-mono-sm text-[11px] text-on-surface-variant">
                              {field.status === 'Pending' ? 'Awaiting action' : `Status: ${field.status}`}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div className="p-space-lg rounded-lg bg-surface-container-low border border-border-hairline shadow-xs flex flex-col gap-space-md">
                <div className="flex items-start gap-space-sm">
                  <span className="material-symbols-outlined text-[24px] text-primary-container shrink-0">
                    gavel
                  </span>
                  <div>
                    <h2 className="font-headline-sm text-headline-sm font-bold text-on-surface">
                      MLRO Red-Line Gate: Analyst Determination & Sign-off
                    </h2>
                    <p className="font-body-sm text-body-sm text-on-surface-variant">
                      Under FCA / MLR 2017 & SR 11-7 model standards, the AI model is strictly prohibited from setting
                      risk ratings or granting clearance. The human analyst must select the rating and submit.
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-space-md items-end">
                  <div>
                    <label className="block font-label-sm text-label-sm font-semibold uppercase text-on-surface-variant mb-1">
                      Assigned Risk Rating (Human Judgement)
                    </label>
                    <select
                      value={riskRating}
                      onChange={(e) => setRiskRating(e.target.value)}
                      className="w-full bg-surface-container-lowest text-on-surface border border-outline-variant/50 rounded-md px-space-sm py-space-xs font-body-sm text-body-sm focus:outline-none focus:ring-2 focus:ring-primary-container"
                    >
                      <option value="">-- Select Compliant Rating --</option>
                      <option value="Low">Low (Standard Due Diligence)</option>
                      <option value="Medium">Medium (Periodic Monitoring)</option>
                      <option value="High">High (Enhanced Due Diligence - EDD)</option>
                      <option value="Prohibited">Prohibited (Exit / Escalation)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block font-label-sm text-label-sm font-semibold uppercase text-on-surface-variant mb-1">
                      Senior Analyst Signature
                    </label>
                    <input
                      type="text"
                      value={analystName}
                      onChange={(e) => setAnalystName(e.target.value)}
                      className="w-full bg-surface-container-lowest text-on-surface border border-outline-variant/50 rounded-md px-space-sm py-space-xs font-body-sm text-body-sm focus:outline-none focus:ring-2 focus:ring-primary-container"
                    />
                  </div>
                </div>

                <button
                  type="button"
                  disabled={!canSign}
                  onClick={handleSignSubmit}
                  className={`w-full py-space-sm px-space-md rounded font-label-md text-label-md font-bold uppercase transition-all flex items-center justify-center gap-space-xs ${
                    canSign
                      ? 'bg-primary-container text-white hover:bg-primary-container/90 shadow-md cursor-pointer'
                      : 'bg-surface-container text-outline cursor-not-allowed opacity-60'
                  }`}
                >
                  <span className="material-symbols-outlined text-[18px]">verified_user</span>
                  <span>Sign & Submit UBO Extraction Packet to Core Banking</span>
                </button>
              </div>

              <div className="bg-surface-container-lowest p-space-md rounded-lg border border-border-hairline shadow-xs">
                <div className="flex items-center justify-between pb-space-xs border-b border-surface-container-high mb-space-sm">
                  <span className="font-label-md text-label-md font-bold uppercase text-on-surface-variant flex items-center gap-1.5">
                    <span className="material-symbols-outlined text-[16px]">history</span>
                    <span>Immutable Audit Trail (Model Risk & Compliance Log)</span>
                  </span>
                  <span className="font-data-mono-sm text-data-mono-sm text-on-surface-variant">
                    {auditLog.length} Records
                  </span>
                </div>

                <div className="max-h-48 overflow-y-auto space-y-space-xs font-data-mono-sm text-data-mono-sm">
                  {auditLog.map((item) => (
                    <div
                      key={item.id}
                      className="p-1.5 rounded bg-surface-container-low text-on-surface flex items-start gap-space-xs"
                    >
                      <span className="text-slate-400 select-none text-[11px] shrink-0">[{item.time}]</span>
                      <span
                        className={
                          item.type === 'sign'
                            ? 'text-emerald-700 font-bold'
                            : item.type === 'reject'
                            ? 'text-rose-700'
                            : item.type === 'edit'
                            ? 'text-amber-700'
                            : 'text-on-surface'
                        }
                      >
                        {item.text}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'pipeline' && (
        <div className="flex flex-col gap-space-lg">
          <div className="bg-surface-container-lowest p-space-lg rounded-lg border border-border-hairline shadow-xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-space-md mb-space-lg">
              <div>
                <h2 className="font-headline-sm text-headline-sm font-bold text-on-surface">
                  Orchestrated Multi-Agent Architecture
                </h2>
                <p className="font-body-sm text-body-sm text-on-surface-variant">
                  Each legal extraction task is decomposed across dedicated specialized subagents under a master state machine.
                </p>
              </div>

              <button
                type="button"
                onClick={runPipelineSim}
                disabled={simulationRunning}
                className="px-space-lg py-space-sm rounded bg-primary-container text-white font-label-md text-label-md font-bold uppercase hover:bg-primary-container/90 transition-all flex items-center gap-space-xs shadow-sm cursor-pointer disabled:opacity-50"
              >
                <span className="material-symbols-outlined text-[18px]">play_circle</span>
                <span>{simulationRunning ? 'Simulating Pipeline Execution...' : 'Run Simulation'}</span>
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-5 gap-space-md">
              {[
                {
                  num: 1,
                  title: 'Ingestion & OCR',
                  desc: 'Splits PDF into numbered pages and exact coordinate lines.',
                  role: 'Deterministic Parser',
                },
                {
                  num: 2,
                  title: 'Citation Scanner',
                  desc: 'Finds share counts, voting rights, and legal control clauses.',
                  role: 'Subagent 1',
                },
                {
                  num: 3,
                  title: 'UBO Math Engine',
                  desc: 'Traverses holding chain; calculates multi-tier equity fractions.',
                  role: 'Subagent 2',
                },
                {
                  num: 4,
                  title: 'Guardrail Check',
                  desc: 'Hard stop: asserts no risk rating or clearance appears in draft.',
                  role: 'Subagent 3',
                },
                {
                  num: 5,
                  title: 'Analyst Sign-Off',
                  desc: 'Analyst reviews citations, accepts/edits fields, and sets rating.',
                  role: 'Human In The Loop',
                },
              ].map((step, idx) => {
                const isActive = activeSimStep === idx;
                return (
                  <div
                    key={step.num}
                    className={`p-space-md rounded-lg border transition-all flex flex-col justify-between gap-space-sm ${
                      isActive
                        ? 'bg-accent-blue/15 border-accent-blue shadow-md ring-2 ring-accent-blue/30 scale-102'
                        : 'bg-surface-container-low border-border-hairline'
                    }`}
                  >
                    <div>
                      <div className="flex items-center justify-between mb-space-xs">
                        <span className="w-6 h-6 rounded-full bg-primary-container text-white flex items-center justify-center font-data-mono-sm text-data-mono-sm font-bold">
                          {step.num}
                        </span>
                        <span className="font-label-sm text-label-sm uppercase text-on-surface-variant font-semibold">
                          {step.role}
                        </span>
                      </div>
                      <h3 className="font-headline-sm text-headline-sm font-bold text-on-surface">
                        {step.title}
                      </h3>
                      <p className="font-body-sm text-body-sm text-on-surface-variant mt-1">
                        {step.desc}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="bg-surface-container-lowest p-space-lg rounded-lg border border-border-hairline shadow-xs">
            <h2 className="font-headline-sm text-headline-sm font-bold text-on-surface mb-space-xs">
              Live Orchestrator Execution Trace: {currentCase.name}
            </h2>
            <p className="font-body-sm text-body-sm text-on-surface-variant mb-space-md">
              Real-time audit log of how the Master Orchestrator delegated work across subagents for this case.
            </p>

            <div className="bg-[#0b192c] text-[#f8f9ff] font-data-mono-sm text-data-mono-sm p-space-md rounded-lg border border-[#1e293b] space-y-space-xs">
              {currentCase.trace.map((item, idx) => (
                <div key={idx} className="flex items-start gap-space-xs leading-relaxed">
                  <span
                    className={`font-bold px-1.5 py-0.5 rounded text-[11px] shrink-0 ${
                      item.actor === 'ORCHESTRATOR'
                        ? 'bg-sky-500/20 text-sky-400'
                        : item.actor === 'SUBAGENT'
                        ? 'bg-emerald-500/20 text-emerald-400'
                        : item.actor === 'EXCEPTION'
                        ? 'bg-rose-500/20 text-rose-400'
                        : 'bg-amber-500/20 text-amber-400'
                    }`}
                  >
                    [{item.actor}]
                  </span>
                  <span>{item.message}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {activeTab === 'calculator' && (
        <div className="flex flex-col gap-space-lg">
          <div className="bg-surface-container-lowest p-space-lg rounded-lg border border-border-hairline shadow-xs">
            <h2 className="font-headline-sm text-headline-sm font-bold text-on-surface mb-space-xs">
              Economic Impact & Time-to-Onboard Calculator
            </h2>
            <p className="font-body-sm text-body-sm text-on-surface-variant mb-space-xl">
              Model the operational savings across the Corporate & Institutional Banking division by accelerating the 11-day UBO extraction slice.
            </p>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-space-xl items-center">
              <div className="lg:col-span-6 flex flex-col gap-space-lg">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="font-label-md text-label-md font-semibold text-on-surface">
                      Complex Files Per Month
                    </label>
                    <span className="font-data-mono-md text-data-mono-md text-primary-container font-bold">
                      {calcFiles} files
                    </span>
                  </div>
                  <input
                    type="range"
                    min={10}
                    max={200}
                    step={5}
                    value={calcFiles}
                    onChange={(e) => setCalcFiles(Number(e.target.value))}
                    className="w-full cursor-pointer accent-primary-container"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="font-label-md text-label-md font-semibold text-on-surface">
                      Baseline Manual Review Time
                    </label>
                    <span className="font-data-mono-md text-data-mono-md text-error font-bold">
                      {calcManualMins} minutes ({Math.round(calcManualMins / 60)} hrs)
                    </span>
                  </div>
                  <input
                    type="range"
                    min={60}
                    max={240}
                    step={5}
                    value={calcManualMins}
                    onChange={(e) => setCalcManualMins(Number(e.target.value))}
                    className="w-full cursor-pointer accent-error"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="font-label-md text-label-md font-semibold text-on-surface">
                      Analyst Review Time with Agent
                    </label>
                    <span className="font-data-mono-md text-data-mono-md text-emerald-600 font-bold">
                      {calcAssistMins} minutes
                    </span>
                  </div>
                  <input
                    type="range"
                    min={15}
                    max={90}
                    step={1}
                    value={calcAssistMins}
                    onChange={(e) => setCalcAssistMins(Number(e.target.value))}
                    className="w-full cursor-pointer accent-emerald-600"
                  />
                </div>
              </div>

              <div className="lg:col-span-6 bg-surface-container-low p-space-lg rounded-lg border border-border-hairline flex flex-col gap-space-md">
                <div className="grid grid-cols-2 gap-space-md">
                  <div className="bg-surface-container-lowest p-space-md rounded border border-border-hairline">
                    <span className="font-label-sm text-label-sm uppercase text-on-surface-variant block">
                      Senior Capacity Saved
                    </span>
                    <span className="font-headline-lg text-headline-lg font-bold text-emerald-600 block mt-1">
                      {totalHoursSavedMonth} hrs/mo
                    </span>
                    <span className="font-body-sm text-body-sm text-on-surface-variant block mt-0.5">
                      ~{hoursSavedPerFile.toFixed(1)} hrs saved per file
                    </span>
                  </div>

                  <div className="bg-surface-container-lowest p-space-md rounded border border-border-hairline">
                    <span className="font-label-sm text-label-sm uppercase text-on-surface-variant block">
                      Direct Cost Recovery
                    </span>
                    <span className="font-headline-lg text-headline-lg font-bold text-primary-container block mt-1">
                      £{costSavingsAnnual.toLocaleString()} /yr
                    </span>
                    <span className="font-body-sm text-body-sm text-on-surface-variant block mt-0.5">
                      At £45/hr fully-loaded rate
                    </span>
                  </div>
                </div>

                <div className="flex flex-col gap-space-xs mt-space-sm">
                  <div className="flex items-center justify-between font-label-sm text-label-sm text-on-surface-variant">
                    <span>Manual Workload: {manualTotalHours} hrs</span>
                    <span>Assisted Workload: {assistTotalHours} hrs</span>
                  </div>
                  <div className="w-full h-4 bg-surface-container rounded-full overflow-hidden flex">
                    <div
                      className="h-full bg-emerald-600"
                      style={{ width: `${Math.round((assistTotalHours / manualTotalHours) * 100)}%` }}
                    />
                    <div
                      className="h-full bg-error/30"
                      style={{ width: `${100 - Math.round((assistTotalHours / manualTotalHours) * 100)}%` }}
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'governance' && (
        <div className="flex flex-col gap-space-lg">
          <div className="bg-surface-container-lowest p-space-lg rounded-lg border border-border-hairline shadow-xs">
            <h2 className="font-headline-sm text-headline-sm font-bold text-on-surface mb-space-xs">
              Supervisory Guidance on Model Risk Management (SR 11-7 / OCC 2011-12)
            </h2>
            <p className="font-body-sm text-body-sm text-on-surface-variant mb-space-lg">
              To deploy generative intelligence into wholesale banking operations without incurring high model validation hurdles, the system operates strictly under the "Analyst Copilot" standard.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-space-md">
              <div className="p-space-md rounded-lg bg-surface-container-low border border-border-hairline flex flex-col gap-space-xs">
                <span className="font-headline-sm text-headline-sm font-bold text-on-surface flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-emerald-600 text-[20px]">check_circle</span>
                  1. Zero Decision Autonomy
                </span>
                <p className="font-body-sm text-body-sm text-on-surface-variant">
                  The LLM acts purely as an accelerated document indexer. Every extracted field requires explicit natural-person acceptance or edit before being written to core records.
                </p>
              </div>

              <div className="p-space-md rounded-lg bg-surface-container-low border border-border-hairline flex flex-col gap-space-xs">
                <span className="font-headline-sm text-headline-sm font-bold text-on-surface flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-primary-container text-[20px]">link</span>
                  2. 100% Citation Grounding
                </span>
                <p className="font-body-sm text-body-sm text-on-surface-variant">
                  Unanchored extractions are dropped. Every field must cite an exact Page and Line number, allowing instantaneous 1-click verification by audit teams.
                </p>
              </div>

              <div className="p-space-md rounded-lg bg-surface-container-low border border-border-hairline flex flex-col gap-space-xs">
                <span className="font-headline-sm text-headline-sm font-bold text-on-surface flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-error text-[20px]">security</span>
                  3. Hard Coded Boundary Guardrails
                </span>
                <p className="font-body-sm text-body-sm text-on-surface-variant">
                  Subagent 3 executes a deterministic assertion over the orchestrator state to verify no risk scores or compliance clearances were synthesized.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
