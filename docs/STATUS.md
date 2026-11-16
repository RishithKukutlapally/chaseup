# Status checklist (honest)

Legend: ✅ built and tested · ⚠️ built, with a limitation · ❌ not built

All results below come from running the code on 2026-11-16. Backend: `uv run pytest` (54 tests),
`ruff`, `mypy`. Frontend: `npm run build`, Vitest (23 tests), Playwright (12 tests).

## Red lines

| Control | Status | Evidence / limitation |
|---|---|---|
| Nothing sent without the **named RM** approving (server-enforced) | ✅ | `test_only_named_rm_can_approve_even_via_direct_api`: Ops, Analyst, MLRO, COO, Agent Owner, Finance and the *other* RM all get 403 on both approve routes. The outbox is unchanged and the denied attempt is audited. |
| No auto-send | ✅ | The only code that writes `outbound_messages` is `services.approve_and_send`, which requires `draft:approve_send` scoped to the user's own cases. |
| No MCP tool sends or approves | ✅ | `test_lists_tools_and_exposes_no_send_or_approve` |
| System never decides document genuineness | ✅ | There is no such field. "Received" records the person who logged it. The validator rejects drafts containing "genuine/authentic/forged". |
| No system risk rating | ✅ | There is no risk column in the schema, and no `risk_rating` in API output (`test_no_risk_rating_anywhere`). The prompt guardrails forbid risk language. |
| Synthetic data only | ✅ | Seeds use fictional names and `.example` / `.test` domains. Upload of real documents is not supported. |
| API keys never logged or returned | ✅ | `/api/health` reports only the mode (live or simulated). Provider error text is scrubbed (`_safe_err`). `.env` is gitignored. |

## 1. Authentication + RBAC

| Control | Status | Evidence / limitation |
|---|---|---|
| Personal logins with PBKDF2-SHA256 hashes | ✅ | `test_passwords_are_hashed_and_never_returned` |
| Passwords from `DEMO_PASSWORD_TEMPLATE`, never committed | ✅ | A placeholder `change-me` template is ignored and a random template is generated into `.env`. |
| Signed HttpOnly `SameSite=Strict` cookie, server-side revocation | ✅ | `test_login_throttling_and_logout`, `test_tampered_cookie_rejected` |
| Login throttling | ⚠️ | Locks after 5 failures per username + IP for 15 minutes. The counter is held **in memory** (per process; it resets on restart). |
| CSRF protection | ✅ | `SameSite=Strict`, plus a required `X-ChaseUp-Request` header on state changes (tested). |
| One permission matrix, checked on every API call | ✅ | `test_every_api_route_is_permission_gated` (default deny). A mutation test (gate disabled) made 8 tests fail. |
| Role × endpoint matrix | ✅ | `test_rbac_matrix_every_role_every_endpoint`: 8 personas × 32 endpoints. |
| Own vs all scope | ✅ | `test_rm_sees_only_own_cases`; also enforced for MCP (`test_tools_respect_rbac`). |
| Field-level rights on agent config | ✅ | The COO cannot edit the prompt; the Agent Owner cannot set the budget (tested). |
| Free-text `actor` removed | ✅ | Requests forbid extra fields; sending `actor` returns 422 (tested). |
| "Your access" dialog showing the matrix | ✅ | Built. Covered by the Playwright smoke test for each role. |

## 2. AI cost governance

| Control | Status | Evidence / limitation |
|---|---|---|
| Every LLM call recorded in `agent_runs` (tokens, latency, USD + INR, status, trace, user) | ✅ | `test_every_llm_call_is_recorded_with_cost`. Blocked, failed and simulated attempts are recorded too. |
| Price table per model in config | ⚠️ | The Gemini list prices were checked on 2026-11-16 and are **placeholders until Finance confirms the contracted rate**. The Claude fallback price is **unverified**. |
| INR conversion | ⚠️ | Uses a placeholder FX rate (`USD_TO_INR=88.0`). |
| Per-task and outcome cost (per approved / discarded draft) | ✅ | `test_per_task_and_outcome_costs` |
| Monthly budget cap per agent | ⚠️ | `test_budget_cap_blocks_calls`. By default the cap counts the notional cost of simulated calls (`BUDGET_COUNTS_SIMULATED`). The check happens before each call, so one call can overshoot the cap. |
| Per-user hourly rate limit | ✅ | `test_rate_limit_per_user` |
| Feature flag + per-agent kill switch | ✅ | `test_kill_switch_and_feature_flag` |
| Primary + fallback model, timeout | ✅ | The fallback is a second Gemini model, or Claude when `ANTHROPIC_API_KEY` is set. **The Anthropic path has not been exercised** (no key available). |
| Circuit breaker | ⚠️ | `test_circuit_breaker_opens_and_falls_back`. Its state is **in memory**, per process. |
| "Simulate primary outage" drill | ✅ | `test_outage_drill_fails_over_to_fallback` |
| Versioned, append-only config (who, when, why); changes apply on the next call | ✅ | `test_config_change_applies_on_next_call_and_restore`. DB triggers block UPDATE and DELETE. |
| One-click restore | ✅ | Same test. Restoring appends a new version. |
| Test a prompt on a synthetic case before saving | ✅ | `test_prompt_test_run_on_synthetic_case_saves_nothing` |
| Fixed guardrails that edits cannot remove | ✅ | Appended at call time and asserted in the prompt trace step. |
| Redact client/contact names before the call, restore after | ✅ | `test_redaction_roundtrip_and_leak_detection`, `test_prompt_sent_to_model_contains_no_client_names` |
| Output validation with template fallback | ✅ | Parametrised validator tests, plus `test_falls_back_to_template_when_llm_output_keeps_failing` |
| Step-by-step trace | ✅ | `test_trace_is_visible_and_scoped`. Shown in the UI's Traces screen. |
| AI Cost & Governance screen; Agent Workbench | ✅ | Built. Playwright covers the landing pages and a workbench prompt test. |
| Live Gemini calls | ✅ | Ran manually with the key in `.env`: drafter + critic on `gemini-3.1-flash-lite`, about 900 tokens and about $0.0006 per chase run. Unit tests always run in simulated mode. |

## 3. MCP

| Control | Status | Evidence / limitation |
|---|---|---|
| MCP server with the 6 tools | ✅ | `mcp` SDK v2 `MCPServer` (FastMCP was renamed in v2). |
| Same RBAC + audit as REST | ✅ | `test_tools_respect_rbac`, `test_draft_tool_creates_draft_only_and_is_audited` |
| Per-user token, stored hashed | ✅ | `make_token` asserts that only the SHA-256 hash is stored. Revoked or bad tokens are rejected (tested). |
| stdio transport | ✅ | `test_stdio_transport` spawns a real subprocess. |
| Streamable HTTP at `/mcp` (bearer required) | ✅ | `test_streamable_http_endpoint`. Also checked manually against a running uvicorn with the SDK HTTP client and a live LLM draft. |
| Orchestrator gets case data via MCP, with direct-DB fallback shown in the trace | ✅ | Trace `data_source` = `mcp` (tested). The fallback path exists but **has no dedicated test**. |
| MCP LLM calls in `agent_runs` | ✅ | Recorded with `via=mcp` (tested). |
| Client connection docs (Claude Desktop / Claude Code / Inspector) | ⚠️ | Snippets are in the README. **Not tried with those clients**; only the SDK client was used. |

## 4. Analyst Assist (Assignment 2)

| Control | Status | Evidence / limitation |
|---|---|---|
| UBO extraction, analyst confirm, roll-up | ❌ | **Descoped at the product owner's request.** The original static mock at `/analystassist` is unchanged. `frontend/src/views/AnalystAssistDesk.tsx` (pre-existing and uncommitted) does not compile and is excluded from the build. |

## 5. Audit + data integrity

| Control | Status | Evidence / limitation |
|---|---|---|
| Append-only event log for every state change (actor, time, reason) | ✅ | Login, logout, document status, drafts, approvals, denials, config and controls, MCP calls and token changes are all logged. |
| SHA-256 hash chain + "verify chain" | ✅ | `test_audit_chain_verifies_and_is_append_only`, `test_audit_detects_tampering` |
| DB triggers block UPDATE/DELETE | ⚠️ | SQLite triggers. Someone with direct file access can still drop a trigger, though verify then detects the tampering (tested). There is no external anchoring of the head hash. |

## 6. Fixes

| Item | Status |
|---|---|
| README: no local path, no "Autonomous", correct model IDs in one config place | ✅ |
| Gemini via `GOOGLE_API_KEY` (`GEMINI_API_KEY` alias), labelled simulated mode without a key | ✅ |
| Measure: days requested → received, before vs after | ⚠️ The baseline and pilot are **seeded synthetic data** (the median is about 17 days and 41% of files go back more than once, matching the case facts). The live tracker receipts are real. |

## 7. Tests

| Suite | Result |
|---|---|
| Backend pytest | ✅ 54 passed |
| ruff / mypy | ✅ clean |
| Frontend `tsc` + Vite build | ✅ |
| Vitest | ✅ 23 passed |
| Playwright smoke (wrong password; each of 7 roles signs in, lands on its screen, sees only its nav; Ops runs chaser, sees MCP-sourced trace, cannot approve; named RM approves & sends; MLRO verifies chain; Agent Owner prompt test) | ✅ 12 passed (Edge via `channel: msedge`; set `PW_CHANNEL=chromium` after `npx playwright install chromium`) |

## Known gaps

- The mail gateway is simulated; no email is sent.
- Waive and discard reasons are captured with the browser's `window.prompt`, which is basic UX.
- SQLite with a single process; not load-tested.
