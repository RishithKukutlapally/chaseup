import type {
  AccessMatrix,
  AgentSettings,
  AgentVersion,
  AgentsOverview,
  ApproveResult,
  AuditEvent,
  CasesSummary,
  ChainVerification,
  CheckItem,
  CostSummary,
  DashboardMetrics,
  Draft,
  Health,
  KycCaseDetail,
  McpTokenCreated,
  McpTokenRow,
  MeasureSummary,
  Me,
  TaskRow,
  TraceDetail,
  WorkflowRunResult,
} from '../types/chasezero';

const API_BASE = '/api';
export const CSRF_HEADER = 'X-ChaseUp-Request';

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

type UnauthorizedHandler = () => void;
let onUnauthorized: UnauthorizedHandler | null = null;
export function setUnauthorizedHandler(fn: UnauthorizedHandler | null) {
  onUnauthorized = fn;
}

export function errorText(status: number, body: string): string {
  try {
    const parsed = JSON.parse(body) as { detail?: unknown };
    if (typeof parsed.detail === 'string') return parsed.detail;
    if (Array.isArray(parsed.detail)) {
      return parsed.detail
        .map((d) => (typeof d === 'object' && d && 'msg' in d ? String((d as { msg: unknown }).msg) : String(d)))
        .join('; ');
    }
  } catch {
    // not JSON
  }
  if (status === 403) return 'You do not have permission for this action.';
  return body || `Request failed (${status})`;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const method = (init.method || 'GET').toUpperCase();
  const headers: Record<string, string> = { ...(init.headers as Record<string, string> | undefined) };
  if (method !== 'GET') {
    headers[CSRF_HEADER] = '1';
    if (init.body) headers['Content-Type'] = 'application/json';
  }
  const res = await fetch(`${API_BASE}${path}`, { ...init, method, headers, credentials: 'same-origin' });
  if (!res.ok) {
    const text = await res.text();
    if (res.status === 401 && onUnauthorized && !path.startsWith('/auth/login')) onUnauthorized();
    throw new ApiError(res.status, errorText(res.status, text));
  }
  return res.json() as Promise<T>;
}

const post = <T>(path: string, body?: unknown) =>
  request<T>(path, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) });
const patch = <T>(path: string, body: unknown) => request<T>(path, { method: 'PATCH', body: JSON.stringify(body) });

export const apiClient = {
  health: () => request<Health>('/health'),
  login: (username: string, password: string) => post<Me>('/auth/login', { username, password }),
  logout: () => post<{ ok: boolean }>('/auth/logout'),
  me: () => request<Me>('/auth/me'),
  accessMatrix: () => request<AccessMatrix>('/auth/access-matrix'),
  listMcpTokens: () => request<McpTokenRow[]>('/auth/mcp-tokens'),
  createMcpToken: (name: string) => post<McpTokenCreated>('/auth/mcp-tokens', { name }),
  revokeMcpToken: (id: number) => request<{ ok: boolean }>(`/auth/mcp-tokens/${id}`, { method: 'DELETE' }),

  getCases: (search = '', filterTab = 'all') => {
    const p = new URLSearchParams();
    if (search.trim()) p.set('search', search.trim());
    p.set('filter_tab', filterTab);
    return request<CasesSummary>(`/cases?${p.toString()}`);
  },
  getCase: (id: number) => request<KycCaseDetail>(`/cases/${id}`),
  setDocumentStatus: (caseId: number, docId: number, status: 'received' | 'waived' | 'missing', reason: string) =>
    post<KycCaseDetail>(`/cases/${caseId}/documents/${docId}/status`, { status, reason }),
  updateNote: (caseId: number, note: string) =>
    patch<KycCaseDetail>(`/cases/${caseId}/note`, { relationship_notes: note }),
  analystRequest: (caseId: number, document: string, note: string) =>
    post<KycCaseDetail>(`/cases/${caseId}/analyst-request`, { document, note }),
  resetCase: (caseId: number) => post<KycCaseDetail>(`/cases/${caseId}/reset`),
  listDrafts: (caseId: number) => request<Draft[]>(`/cases/${caseId}/drafts`),
  recheckDraft: (caseId: number, body: string) => post<CheckItem[]>(`/cases/${caseId}/draft/recheck`, { body }),
  runWorkflow: (caseId: number, tone?: string, simulateCriticRejection = false) =>
    post<WorkflowRunResult & { case: KycCaseDetail }>(`/cases/${caseId}/workflow/run`, {
      tone: tone || null,
      simulate_critic_rejection: simulateCriticRejection,
    }),
  openWorkflowStream: (caseId: number, tone?: string, simulateCriticRejection = false) => {
    const p = new URLSearchParams({ simulate_critic_rejection: String(simulateCriticRejection) });
    if (tone) p.set('tone', tone);
    return new EventSource(`${API_BASE}/cases/${caseId}/workflow/stream?${p.toString()}`, { withCredentials: true });
  },
  approveDraft: (draftId: number, subject: string, body: string) =>
    post<ApproveResult>(`/drafts/${draftId}/approve`, { subject, body }),
  discardDraft: (draftId: number, reason: string) => post<Draft>(`/drafts/${draftId}/discard`, { reason }),

  listTasks: (caseId?: number) => request<TaskRow[]>(`/tasks${caseId ? `?case_id=${caseId}` : ''}`),
  getTrace: (taskId: number) => request<TraceDetail>(`/tasks/${taskId}/trace`),
  costSummary: () => request<CostSummary>('/costs/summary'),

  agents: () => request<AgentsOverview>('/agents'),
  agentVersions: (agent: string) => request<AgentVersion[]>(`/agents/${agent}/versions`),
  changeAgentConfig: (agent: string, changes: Record<string, unknown>, reason: string) =>
    post<AgentVersion>(`/agents/${agent}/config`, { changes, reason }),
  restoreAgentVersion: (agent: string, version: number, reason: string) =>
    post<AgentVersion>(`/agents/${agent}/restore`, { version, reason }),
  testAgent: (agent: string, changes: Record<string, unknown>, tone?: string, simulateCriticRejection = false) =>
    post<WorkflowRunResult>(`/agents/${agent}/test`, {
      changes,
      tone: tone || null,
      simulate_critic_rejection: simulateCriticRejection,
    }),
  setAgentControls: (
    agent: string,
    changes: { enabled?: boolean; monthly_budget_usd?: number; simulate_primary_outage?: boolean },
    reason: string
  ) => patch<AgentSettings>(`/agents/${agent}/controls`, { ...changes, reason }),
  setAiFlag: (enabled: boolean, reason: string) =>
    patch<{ name: string; enabled: boolean }>('/feature-flags/ai_drafting', { enabled, reason }),

  auditLog: (limit = 200, caseId?: number) =>
    request<AuditEvent[]>(`/audit?limit=${limit}${caseId ? `&case_id=${caseId}` : ''}`),
  verifyAudit: () => post<ChainVerification>('/audit/verify'),
  dashboard: () => request<DashboardMetrics>('/dashboard/metrics'),
  measure: () => request<MeasureSummary>('/measure'),
};
