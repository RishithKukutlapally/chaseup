export type ViewId =
  | 'chase-queue'
  | 'case-detail'
  | 'reminder-composer'
  | 'analyst-handoff'
  | 'stage-analytics'
  | 'measure'
  | 'ai-cost'
  | 'agent-workbench'
  | 'audit-log'
  | 'traces';

export type FilterTab = 'all' | 'breached' | 'draft_ready' | 'awaiting' | 'completed';
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

export interface AccessMatrix {
  roles: Record<string, string>;
  permissions: Record<string, Record<string, Scope>>;
  agent_field_rights: Record<string, string[]>;
  landing: Record<string, string>;
  you: Me;
  mcp_tools: string[];
  red_lines: string[];
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
  note: string;
}

export interface Health {
  status: string;
  llm_mode: 'live' | 'simulated';
  llm_configured: boolean;
  llm_provider: string;
  llm_model: string;
  fallback_model: string;
}

export interface DocumentItem {
  id: number;
  case_id: number;
  document_name: string;
  status: 'Missing' | 'Received' | 'Waived' | string;
  description: string;
  requirement_meta: string;
  assigned_to_or_verifier: string;
  doc_code: string;
  category: string;
  owner: string;
  chase_round: number;
  requested_at: string | null;
  received_at: string | null;
  waived_reason: string | null;
  status_changed_by: string | null;
  days_waiting: number;
  overdue: boolean;
}

export interface CheckItem {
  key: string;
  title: string;
  badge?: string;
  passed: boolean;
  summary?: string;
  detail?: string;
  meta_left?: string;
  meta_right?: string;
}

export interface TimelineItem {
  id: number;
  case_id: number;
  case_code?: string | null;
  client_name?: string | null;
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
  days_open: number;
  last_contact_date: string | null;
  days_since_contact: number;
  sla_breached: boolean;
  sla_delay_days: number;
  chase_round_count: number;
  lei: string;
  entity_type: string;
  jurisdiction: string;
  desk: string;
  region: string;
  contact_name: string;
  contact_role: string;
  contact_email: string;
  assigned_rm: string;
  assigned_rm_user_id: number | null;
  relationship_notes: string;
  target_deadline_label: string;
  stage: string;
  current_draft_subject?: string | null;
  current_draft_body?: string | null;
  critic_passed: boolean;
  critic_score: number;
  critic_feedback?: string | null;
  critic_checks: CheckItem[];
  workflow_iterations: number;
  audit_hash?: string | null;
  documents: DocumentItem[];
  missing_count: number;
  received_count: number;
  waived_count: number;
  oldest_missing_days: number;
  pending_draft_id: number | null;
  can_approve: boolean;
  can_create_draft: boolean;
  can_update_documents: boolean;
}

export interface KycCaseDetail extends KycCase {
  actions: TimelineItem[];
}

export interface CasesSummary {
  cases: KycCase[];
  scope: Scope;
  total_active_cases: number;
  sla_breached_count: number;
  pending_rm_action_count: number;
  completed_count: number;
  avg_chase_latency_days: number;
  sla_buffer_health_pct: number;
}

export interface Draft {
  id: number;
  case_id: number;
  task_id: number | null;
  subject: string;
  body: string;
  engine: string;
  status: 'pending_approval' | 'approved_sent' | 'discarded' | 'superseded' | string;
  validation: CheckItem[];
  created_at: string | null;
  decided_at: string | null;
  decision_reason: string | null;
  edited_by_rm: boolean;
}

export interface ApproveResult {
  case: KycCaseDetail;
  tracking_id: string;
  audit_hash: string;
  message: string;
  draft: Draft;
}

export interface TraceStep {
  n: number;
  step: string;
  label: string;
  status: 'ok' | 'warn' | 'fail' | 'info' | string;
  t_ms: number;
  at: string;
  data: Record<string, unknown>;
}

export interface AgentRunRow {
  id: number;
  task_id: number | null;
  trace_id: string;
  agent: string;
  purpose: string;
  provider: string;
  model: string;
  config_version: number | null;
  input_tokens: number;
  output_tokens: number;
  latency_ms: number;
  cost_usd: number;
  cost_inr: number;
  status: string;
  simulated: boolean;
  is_fallback: boolean;
  error: string | null;
  user_id: number | null;
  via: string;
  created_at: string | null;
}

export interface TaskRow {
  id: number;
  kind: string;
  trace_id: string;
  case_id: number | null;
  user_id: number | null;
  via: string;
  status: string;
  outcome: string;
  data_source: string;
  engine: string;
  created_at: string | null;
  llm_calls: number;
  cost_usd: number;
  cost_inr: number;
  simulated: boolean;
  agents: string[];
}

export interface TraceDetail {
  task: TaskRow;
  steps: TraceStep[];
  runs: AgentRunRow[];
}

export interface WorkflowRunResult {
  task_id: number;
  trace_id: string;
  draft_id: number | null;
  subject: string | null;
  body: string | null;
  engine: string | null;
  critic_passed: boolean | null;
  checks: CheckItem[] | null;
  attempts: number | null;
  data_source: string;
  trace: TraceStep[];
}

export interface CostAgg {
  calls: number;
  usd: number;
  inr: number;
  input_tokens: number;
  output_tokens: number;
}

export interface OutcomeCost {
  drafts: number;
  total_usd: number;
  per_draft_usd: number;
  per_draft_inr: number;
}

export interface CostSummary {
  currency_note: string;
  fx_usd_inr: number;
  all_time: CostAgg;
  this_month: CostAgg;
  by_agent: Record<string, CostAgg>;
  by_model: Record<string, CostAgg>;
  by_status: Record<string, CostAgg>;
  real_vs_simulated: { real: CostAgg; simulated: CostAgg };
  per_task_avg: Record<string, { tasks: number; avg_usd: number; avg_calls: number }>;
  outcomes: {
    approved: OutcomeCost;
    discarded: OutcomeCost;
    pending: OutcomeCost;
    fully_loaded_cost_per_approved_draft_usd: number;
  };
  budgets: Record<string, { cap_usd: number | null; spent_usd: number; enabled: boolean; simulate_primary_outage: boolean }>;
  circuit_breakers: Record<string, { failures: number; state: string }>;
  price_table: Record<
    string,
    { provider: string; input_per_m_usd: number; output_per_m_usd: number; source: string; verified: boolean }
  >;
  price_note: string;
  ledger: TaskRow[];
  live_mode: boolean;
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
  editable_fields: string[];
  circuit_breakers: Record<string, { failures: number; state: string }>;
  live_mode: boolean;
  your_field_rights: string[];
}

export interface AgentVersion {
  id: number;
  agent: string;
  version: number;
  system_prompt: string;
  tone: string;
  primary_model: string;
  fallback_model: string;
  temperature: number;
  timeout_s: number;
  created_by: string;
  created_at: string | null;
  reason: string;
  restored_from_version: number | null;
}

export interface AuditEvent {
  id: number;
  ts: string;
  actor: string;
  actor_role: string;
  action: string;
  entity_type: string;
  entity_id: string;
  case_id: number | null;
  reason: string;
  details: Record<string, unknown>;
  via: string;
  prev_hash: string;
  hash: string;
}

export interface ChainVerification {
  valid: boolean;
  events_checked: number;
  head_hash?: string;
  broken_at_id: number | null;
  reason: string;
}

export interface MeasureStats {
  n: number;
  median_days?: number;
  mean_days?: number;
  p90_days?: number;
  avg_rounds?: number | null;
  pct_more_than_one_round?: number | null;
  label: string;
}

export interface MeasureSummary {
  metric: string;
  baseline: MeasureStats;
  pilot: MeasureStats;
  live: MeasureStats;
  by_doc_type: Record<string, { baseline: number | null; pilot: number | null }>;
  case_facts: Record<string, number | string>;
  caveat: string;
}

export interface DashboardMetrics {
  days_per_chase_round: number;
  baseline_days_per_round: number;
  target_days_per_round: number;
  velocity_delta_pct: number;
  pilot_clients_count: number;
  rm_adoption_rate_pct: number;
  total_drafts_generated: number;
  total_rm_approved: number;
  baseline_onboarding_days: number;
  pilot_onboarding_days: number;
  baseline_chasing_days: number;
  pilot_chasing_days: number;
  baseline_unresponsive_pct: number;
  pilot_unresponsive_pct: number;
  extra: {
    live_breached_cases?: number;
    total_db_cases?: number;
    stage_median_days?: Record<string, number>;
    drafts_by_status?: Record<string, number>;
    cases_by_stage_status?: Record<string, number>;
  };
  data_note?: string;
}

export type ActiveNode = 'idle' | 'orchestrator' | 'drafter' | 'critic' | 'complete' | 'error';

export interface WorkflowStreamState {
  isRunning: boolean;
  activeNode: ActiveNode;
  streamedText: string;
  streamedSubject: string;
  attempt: number;
  statusLabel: string;
  checks: CheckItem[];
  criticPassed: boolean | null;
  steps: TraceStep[];
  taskId: number | null;
  traceId: string | null;
  draftId: number | null;
  engine: string | null;
  dataSource: string | null;
  error: string | null;
}
