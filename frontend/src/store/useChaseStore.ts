import { create } from 'zustand';

import { apiClient, setUnauthorizedHandler } from '../api/client';
import type {
  ApproveResult,
  CasesSummary,
  CheckItem,
  FilterTab,
  Health,
  KycCaseDetail,
  Me,
  TraceStep,
  ViewId,
  WorkflowStreamState,
} from '../types/chasezero';
import { canView, resolveLanding } from '../utils/access';
import { telemetryAudio } from '../utils/audio';

interface ChaseStoreState {
  me: Me | null;
  authChecked: boolean;
  health: Health | null;
  activeView: ViewId;
  summary: CasesSummary | null;
  selectedCaseId: number | null;
  selectedCase: KycCaseDetail | null;
  selectedTaskId: number | null;
  searchQuery: string;
  filterTab: FilterTab;
  audioEnabled: boolean;
  error: string | null;
  notice: string | null;
  workflow: WorkflowStreamState;
  lastDispatch: ApproveResult | null;
  accessOpen: boolean;

  boot: () => Promise<void>;
  login: (username: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  setActiveView: (view: ViewId) => void;
  setSearchQuery: (q: string) => void;
  setFilterTab: (t: FilterTab) => void;
  toggleAudio: () => void;
  setError: (msg: string | null) => void;
  setNotice: (msg: string | null) => void;
  setAccessOpen: (open: boolean) => void;
  openTrace: (taskId: number) => void;

  fetchCases: () => Promise<void>;
  selectCase: (caseId: number, navigateTo?: ViewId) => Promise<void>;
  refreshSelectedCase: () => Promise<void>;
  setDocumentStatus: (docId: number, status: 'received' | 'waived' | 'missing', reason: string) => Promise<void>;
  updateNote: (note: string) => Promise<void>;
  analystRequest: (document: string, note: string) => Promise<void>;
  resetCase: () => Promise<void>;
  startWorkflow: (caseId: number, opts?: { tone?: string; simulateRejection?: boolean; navigate?: boolean }) => void;
  approveDraft: (subject: string, body: string) => Promise<ApproveResult>;
  discardDraft: (reason: string) => Promise<void>;
  clearLastDispatch: () => void;
}

export const initialWorkflow: WorkflowStreamState = {
  isRunning: false,
  activeNode: 'idle',
  streamedText: '',
  streamedSubject: '',
  attempt: 0,
  statusLabel: 'Not started',
  checks: [],
  criticPassed: null,
  steps: [],
  taskId: null,
  traceId: null,
  draftId: null,
  engine: null,
  dataSource: null,
  error: null,
};

let activeEventSource: EventSource | null = null;

function msg(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback;
}

export const useChaseStore = create<ChaseStoreState>((set, get) => ({
  me: null,
  authChecked: false,
  health: null,
  activeView: 'chase-queue',
  summary: null,
  selectedCaseId: null,
  selectedCase: null,
  selectedTaskId: null,
  searchQuery: '',
  filterTab: 'all',
  audioEnabled: false,
  error: null,
  notice: null,
  workflow: initialWorkflow,
  lastDispatch: null,
  accessOpen: false,

  boot: async () => {
    setUnauthorizedHandler(() => set({ me: null }));
    apiClient.health().then((health) => set({ health })).catch(() => undefined);
    try {
      const me = await apiClient.me();
      set({ me, authChecked: true, activeView: resolveLanding(me) ?? 'chase-queue' });
      if (canView(me, 'chase-queue')) void get().fetchCases();
    } catch {
      set({ me: null, authChecked: true });
    }
  },

  login: async (username, password) => {
    const me = await apiClient.login(username, password);
    set({
      me,
      error: null,
      notice: null,
      summary: null,
      selectedCase: null,
      selectedCaseId: null,
      workflow: initialWorkflow,
      activeView: resolveLanding(me) ?? 'chase-queue',
    });
    apiClient.health().then((health) => set({ health })).catch(() => undefined);
    if (canView(me, 'chase-queue')) void get().fetchCases();
  },

  logout: async () => {
    activeEventSource?.close();
    activeEventSource = null;
    try {
      await apiClient.logout();
    } finally {
      set({ me: null, summary: null, selectedCase: null, selectedCaseId: null, workflow: initialWorkflow, accessOpen: false });
    }
  },

  setActiveView: (view) => {
    telemetryAudio.playNodePing(get().audioEnabled);
    set({ activeView: view, error: null });
  },
  setSearchQuery: (q) => {
    set({ searchQuery: q });
    void get().fetchCases();
  },
  setFilterTab: (t) => {
    set({ filterTab: t });
    void get().fetchCases();
  },
  toggleAudio: () => set({ audioEnabled: !get().audioEnabled }),
  setError: (error) => set({ error }),
  setNotice: (notice) => set({ notice }),
  setAccessOpen: (accessOpen) => set({ accessOpen }),
  openTrace: (taskId) => set({ selectedTaskId: taskId, activeView: 'traces' }),

  fetchCases: async () => {
    try {
      const { searchQuery, filterTab } = get();
      const summary = await apiClient.getCases(searchQuery, filterTab);
      set({ summary });
      if (!get().selectedCaseId && summary.cases[0]) await get().selectCase(summary.cases[0].id);
    } catch (err) {
      set({ error: msg(err, 'Failed to load cases') });
    }
  },

  selectCase: async (caseId, navigateTo) => {
    const changed = caseId !== get().selectedCaseId;
    set({ selectedCaseId: caseId, ...(navigateTo ? { activeView: navigateTo } : {}) });
    if (changed && !get().workflow.isRunning) set({ workflow: initialWorkflow });
    try {
      set({ selectedCase: await apiClient.getCase(caseId) });
    } catch (err) {
      set({ error: msg(err, 'Failed to load case') });
    }
  },

  refreshSelectedCase: async () => {
    const id = get().selectedCaseId;
    if (id) await get().selectCase(id);
  },

  setDocumentStatus: async (docId, status, reason) => {
    const c = get().selectedCase;
    if (!c) return;
    try {
      set({ selectedCase: await apiClient.setDocumentStatus(c.id, docId, status, reason), error: null });
      void get().fetchCases();
    } catch (err) {
      set({ error: msg(err, 'Failed to update document') });
    }
  },

  updateNote: async (note) => {
    const c = get().selectedCase;
    if (!c) return;
    try {
      set({ selectedCase: await apiClient.updateNote(c.id, note), notice: 'Note saved' });
    } catch (err) {
      set({ error: msg(err, 'Failed to save note') });
    }
  },

  analystRequest: async (document, note) => {
    const c = get().selectedCase;
    if (!c) return;
    try {
      set({
        selectedCase: await apiClient.analystRequest(c.id, document, note),
        notice: `Request sent to ${c.assigned_rm} (logged on the case timeline)`,
      });
    } catch (err) {
      set({ error: msg(err, 'Failed to send request') });
    }
  },

  resetCase: async () => {
    const c = get().selectedCase;
    if (!c) return;
    try {
      set({ selectedCase: await apiClient.resetCase(c.id), workflow: initialWorkflow, lastDispatch: null });
      void get().fetchCases();
    } catch (err) {
      set({ error: msg(err, 'Failed to reset case') });
    }
  },

  startWorkflow: (caseId, opts = {}) => {
    activeEventSource?.close();
    if (opts.navigate !== false) set({ activeView: 'reminder-composer' });
    set({
      selectedCaseId: caseId,
      error: null,
      lastDispatch: null,
      workflow: { ...initialWorkflow, isRunning: true, activeNode: 'orchestrator', statusLabel: 'Starting…' },
    });
    const es = apiClient.openWorkflowStream(caseId, opts.tone, Boolean(opts.simulateRejection));
    activeEventSource = es;
    const upd = (patch: Partial<WorkflowStreamState>) => set((s) => ({ workflow: { ...s.workflow, ...patch } }));

    es.onmessage = (m) => {
      let data: Record<string, unknown>;
      try {
        data = JSON.parse(m.data) as Record<string, unknown>;
      } catch {
        return;
      }
      const type = String(data.type ?? '');
      const audio = get().audioEnabled;
      if (type === 'trace_step') {
        const step = data.step as TraceStep;
        set((s) => ({ workflow: { ...s.workflow, steps: [...s.workflow.steps, step], traceId: String(data.trace_id ?? '') } }));
      } else if (type === 'node_start') {
        telemetryAudio.playNodePing(audio);
        const node = String(data.node ?? 'orchestrator') as WorkflowStreamState['activeNode'];
        upd({
          activeNode: node,
          statusLabel: String(data.label ?? ''),
          attempt: Number(data.attempt ?? get().workflow.attempt),
          ...(node === 'drafter' ? { streamedText: '' } : {}),
        });
      } else if (type === 'orchestrator_result') {
        upd({ dataSource: String(data.data_source ?? '') });
      } else if (type === 'draft_token') {
        set((s) => ({ workflow: { ...s.workflow, streamedText: s.workflow.streamedText + String(data.chunk ?? '') } }));
      } else if (type === 'draft_complete') {
        upd({ streamedSubject: String(data.subject ?? ''), streamedText: String(data.body ?? ''), engine: String(data.engine ?? '') });
      } else if (type === 'critic_result') {
        const passed = Boolean(data.passed);
        if (passed) telemetryAudio.playCriticPass(audio);
        else telemetryAudio.playCriticReject(audio);
        upd({ criticPassed: passed, checks: (data.checks as CheckItem[]) ?? [] });
      } else if (type === 'workflow_complete') {
        es.close();
        activeEventSource = null;
        const c = data.case as KycCaseDetail | undefined;
        set((s) => ({
          selectedCase: c && c.id === s.selectedCaseId ? c : s.selectedCase,
          workflow: {
            ...s.workflow,
            isRunning: false,
            activeNode: 'complete',
            statusLabel: 'Draft ready — waiting for the named RM. Nothing has been sent.',
            taskId: Number(data.task_id) || null,
            traceId: String(data.trace_id ?? s.workflow.traceId ?? ''),
            draftId: (data.draft_id as number | null) ?? null,
            engine: String(data.engine ?? s.workflow.engine ?? ''),
            dataSource: String(data.data_source ?? s.workflow.dataSource ?? ''),
            criticPassed: (data.critic_passed as boolean | null) ?? s.workflow.criticPassed,
          },
        }));
        void get().fetchCases();
      } else if (type === 'error') {
        es.close();
        activeEventSource = null;
        upd({ isRunning: false, activeNode: 'error', statusLabel: 'Workflow error', error: String(data.message ?? '') });
        set({ error: String(data.message ?? 'Workflow error') });
      }
    };
    es.onerror = () => {
      es.close();
      activeEventSource = null;
      if (get().workflow.isRunning) {
        upd({ isRunning: false, activeNode: 'error', statusLabel: 'Stream disconnected', error: 'Stream disconnected' });
        void get().refreshSelectedCase();
      }
    };
  },

  approveDraft: async (subject, body) => {
    const c = get().selectedCase;
    if (!c || !c.pending_draft_id) throw new Error('No draft is pending approval');
    const res = await apiClient.approveDraft(c.pending_draft_id, subject, body);
    telemetryAudio.playDispatchSuccess(get().audioEnabled);
    set({ selectedCase: res.case, lastDispatch: res, workflow: initialWorkflow });
    void get().fetchCases();
    return res;
  },

  discardDraft: async (reason) => {
    const c = get().selectedCase;
    if (!c || !c.pending_draft_id) return;
    try {
      await apiClient.discardDraft(c.pending_draft_id, reason);
      set({ notice: `Draft #${c.pending_draft_id} discarded`, workflow: initialWorkflow });
      await get().refreshSelectedCase();
      void get().fetchCases();
    } catch (err) {
      set({ error: msg(err, 'Failed to discard draft') });
    }
  },

  clearLastDispatch: () => set({ lastDispatch: null }),
}));
