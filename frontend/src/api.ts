import type {
  AccessMatrix,
  AgentSettings,
  AgentVersion,
  AgentsOverview,
  ApproveResult,
  CasesSummary,
  ChainVerification,
  CheckLike,
  Draft,
  Health,
  InsightsOverview,
  KycCase,
  McpTokenCreated,
  McpTokenRow,
  Me,
  TestRunResult,
  TraceDetail,
  VerticalDashboard,
} from './types';

export const CSRF_HEADER = 'X-ChaseUp-Request';

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

let onUnauthorized: (() => void) | null = null;
export function setUnauthorizedHandler(fn: (() => void) | null) {
  onUnauthorized = fn;
}

/** Turn a FastAPI error body into one plain sentence. */
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
  if (status === 403) return 'You do not have permission to do this.';
  return body || `Something went wrong (${status}).`;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const method = (init.method || 'GET').toUpperCase();
  const headers: Record<string, string> = { ...(init.headers as Record<string, string> | undefined) };
  if (method !== 'GET') {
    headers[CSRF_HEADER] = '1';
    if (init.body) headers['Content-Type'] = 'application/json';
  }
  const res = await fetch(`/api${path}`, { ...init, method, headers, credentials: 'same-origin' });
  if (!res.ok) {
    const text = await res.text();
    if (res.status === 401 && onUnauthorized && !path.startsWith('/auth/')) onUnauthorized();
    throw new ApiError(res.status, errorText(res.status, text));
  }
  return res.json() as Promise<T>;
}

const post = <T>(path: string, body?: unknown) =>
  request<T>(path, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) });
const patch = <T>(path: string, body: unknown) => request<T>(path, { method: 'PATCH', body: JSON.stringify(body) });

export const api = {
  health: () => request<Health>('/health'),
  login: (username: string, password: string) => post<Me>('/auth/login', { username, password }),
  logout: () => post<{ ok: boolean }>('/auth/logout'),
  me: () => request<Me>('/auth/me'),
  accessMatrix: () => request<AccessMatrix>('/auth/access-matrix'),
  listTokens: () => request<McpTokenRow[]>('/auth/mcp-tokens'),
  createToken: (name: string) => post<McpTokenCreated>('/auth/mcp-tokens', { name }),
  revokeToken: (id: number) => request<{ ok: boolean }>(`/auth/mcp-tokens/${id}`, { method: 'DELETE' }),

  cases: () => request<CasesSummary>('/cases'),
  getCase: (id: number) => request<KycCase>(`/cases/${id}`),
  setDocStatus: (caseId: number, docId: number, status: 'received' | 'waived' | 'missing', reason: string) =>
    post<KycCase>(`/cases/${caseId}/documents/${docId}/status`, { status, reason }),
  drafts: (caseId: number) => request<Draft[]>(`/cases/${caseId}/drafts`),
  recheck: (caseId: number, body: string) => post<CheckLike[]>(`/cases/${caseId}/draft/recheck`, { body }),
  streamUrl: (caseId: number, tone?: string) => {
    const p = new URLSearchParams();
    if (tone) p.set('tone', tone);
    return `/api/cases/${caseId}/workflow/stream?${p.toString()}`;
  },
  approve: (draftId: number, subject: string, body: string) =>
    post<ApproveResult>(`/drafts/${draftId}/approve`, { subject, body }),
  discard: (draftId: number, reason: string) => post<Draft>(`/drafts/${draftId}/discard`, { reason }),
  trace: (taskId: number) => request<TraceDetail>(`/tasks/${taskId}/trace`),

  agents: () => request<AgentsOverview>('/agents'),
  versions: (agent: string) => request<AgentVersion[]>(`/agents/${agent}/versions`),
  saveConfig: (agent: string, changes: Record<string, unknown>, reason: string) =>
    post<AgentVersion>(`/agents/${agent}/config`, { changes, reason }),
  restore: (agent: string, version: number, reason: string) =>
    post<AgentVersion>(`/agents/${agent}/restore`, { version, reason }),
  testRun: (agent: string, changes: Record<string, unknown>) => post<TestRunResult>(`/agents/${agent}/test`, { changes }),
  controls: (agent: string, changes: Partial<Pick<AgentSettings, 'enabled' | 'simulate_primary_outage'>>, reason: string) =>
    patch<AgentSettings>(`/agents/${agent}/controls`, { ...changes, reason }),

  insights: () => request<InsightsOverview>('/insights'),
  insight: (id: string) => request<VerticalDashboard>(`/insights/${id}`),
  verifyChain: () => post<ChainVerification>('/audit/verify'),
};
