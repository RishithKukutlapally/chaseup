export type Scope = 'own' | 'all';

export interface Me {
  id: number;
  username: string;
  display_name: string;
  role: string;
  role_label: string;
  title: string;
  landing: string;
  permissions: Record<string, Scope>;
}

export interface Health {
  status: string;
  llm_mode: 'live' | 'simulated';
  llm_model: string;
  fallback_model: string;
}

export interface Doc {
  id: number;
  document_name: string;
  status: 'Missing' | 'Received' | 'Waived' | string;
  description: string;
  requested_at: string | null;
  received_at: string | null;
  waived_reason: string | null;
  status_changed_by: string | null;
  days_waiting: number;
  overdue: boolean;
}

export interface TimelineItem {
  id: number;
  action_type: string;
  timestamp: string | null;
  actor: string;
  details: string;
}

export interface KycCase {
  id: number;
  case_code: string;
  client_name: string;
  status: 'Missing_Docs' | 'Draft_Ready' | 'Completed' | string;
  last_contact_date: string | null;
  days_since_contact: number;
  sla_breached: boolean;
  contact_name: string;
  contact_role: string;
  contact_email: string;
  assigned_rm: string;
  target_deadline_label: string;
  current_draft_subject: string | null;
  current_draft_body: string | null;
  critic_checks: CheckLike[];
  documents: Doc[];
  missing_count: number;
  received_count: number;
  waived_count: number;
  oldest_missing_days: number;
  pending_draft_id: number | null;
  can_approve: boolean;
  can_create_draft: boolean;
  can_update_documents: boolean;
  actions?: TimelineItem[];
}

export interface CasesSummary {
  cases: KycCase[];
  scope: Scope;
  total_active_cases: number;
  sla_breached_count: number;
  pending_rm_action_count: number;
}

/** Validation items come in two shapes: recheck {detail} and stored draft checks {summary}. */
export interface CheckLike {
  key: string;
  title: string;
  passed: boolean;
  detail?: string;
  summary?: string;
}

export interface Draft {
  id: number;
  case_id: number;
  task_id: number | null;
  subject: string;
  body: string;
  engine: string;
  status: 'pending_approval' | 'approved_sent' | 'discarded' | 'superseded' | string;
  validation: CheckLike[];
  created_at: string | null;
  decided_at: string | null;
  decision_reason: string | null;
}

export interface ApproveResult {
  case: KycCase;
  tracking_id: string;
  message: string;
}

export interface TraceStep {
  n: number;
  step: string;
  label: string;
  status: string;
  data: Record<string, unknown>;
}

export interface TraceDetail {
  task: { id: number; data_source: string; engine: string; cost_usd: number; llm_calls: number };
  steps: TraceStep[];
}

export interface AgentSettings {
  agent: string;
  version: number;
  system_prompt: string;
  tone: string;
  primary_model: string;
  fallback_model: string;
  temperature: number;
  timeout_s: number;
  enabled: boolean;
  monthly_budget_usd: number;
  simulate_primary_outage: boolean;
}

export interface AgentsOverview {
  agents: { agent: string; description: string; settings: AgentSettings }[];
  ai_feature_flag: boolean;
  fixed_guardrails: string;
  models: string[];
  tones: string[];
  your_field_rights: string[];
  live_mode: boolean;
}

export interface AgentVersion {
  version: number;
  system_prompt: string;
  tone: string;
  primary_model: string;
  fallback_model: string;
  created_by: string;
  created_at: string | null;
  reason: string;
  restored_from_version: number | null;
}

export interface TestRunResult {
  subject: string | null;
  body: string | null;
  engine: string | null;
  critic_passed: boolean | null;
  checks: CheckLike[] | null;
}

export interface AccessMatrix {
  roles: Record<string, string>;
  permissions: Record<string, Record<string, Scope>>;
  agent_field_rights: Record<string, string[]>;
  red_lines: string[];
  mcp_tools: string[];
  you: Me;
}

export interface McpTokenRow {
  id: number;
  name: string;
  prefix: string;
  created_at: string | null;
  last_used_at: string | null;
  revoked: boolean;
}

export interface McpTokenCreated {
  id: number;
  name: string;
  prefix: string;
  token: string;
}

export interface ChainVerification {
  valid: boolean;
  events_checked: number;
  head_hash?: string;
  broken_at_id: number | null;
  reason: string;
}

// ---------------------------------------------------------------- insights (live dashboards)
export type Status = 'good' | 'warn' | 'bad' | null;
export type WidgetSource = 'live' | 'static' | 'planned';

interface WidgetBase {
  title: string;
  note?: string;
  wide?: boolean;
  source?: WidgetSource;
}
export type Widget =
  | (WidgetBase & { type: 'bars'; rows: [string, number][]; unit?: string; dec?: number })
  | (WidgetBase & { type: 'pairs'; legend: [string, string]; rows: [string, number, number][]; max: number; unit?: string })
  | (WidgetBase & { type: 'cols'; days: string[]; ok: number[]; fb: number[]; er: number[] })
  | (WidgetBase & { type: 'funnel'; rows: [string, number][] })
  | (WidgetBase & { type: 'flow'; steps: [string, string, number][] })
  | (WidgetBase & { type: 'list'; items: [string, string, string][] })
  | (WidgetBase & { type: 'table'; head: string[]; rows: (string | number)[][] })
  | (WidgetBase & { type: 'budget'; fx: number; can_edit: boolean; rows: BudgetRow[] });

export interface BudgetRow {
  agent: string;
  label: string;
  spent: number;
  forecast: number;
  cap: number;
}

export interface Kpi {
  label: string;
  value: string;
  sub?: string;
  status?: Status;
  statusText?: string;
}

export interface VerticalSummary {
  id: string;
  name: string;
  color: string;
  lead: string;
  question: string;
  proves: string;
  allowed: boolean;
  headline?: { label: string; value: string; status?: Status; statusText?: string } | null;
}

export interface InsightsOverview {
  outcome: { baseline: number; target: number; now: number; unit?: string; label?: string; note?: string };
  verticals: VerticalSummary[];
}

export interface VerticalDashboard {
  id: string;
  name: string;
  color: string;
  lead: string;
  question: string;
  proves: string;
  updated_at?: string;
  kpis: Kpi[];
  widgets: Widget[];
}
