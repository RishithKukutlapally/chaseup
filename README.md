# Northgate ChaseUp — RM-approved KYC document chasing

Case-tracking workspace for corporate KYC onboarding at the (fictional) Northgate Corporate Bank.
It shows which documents each case still needs, prepares **one consolidated reminder** listing every
missing document, and holds it until **the named Relationship Manager approves and sends it**.

**Synthetic data only.** Every person, company, identifier and e-mail address in this repo is fictional.

| Case fact | Value |
|---|---|
| Median onboarding | 62 days (target 30) |
| Document chasing | 17 days — 3 rounds × ~5–6 days, gaps found one at a time, 41% of files go back more than once |
| UBO extraction | 11 days (out of scope for this build) |

## Red lines (server-enforced, tested)

1. Nothing is sent to a client unless the **named RM** of that case approves it. Every other role,
   including another RM, gets `403` even when calling the API directly. No auto-send.
2. No MCP tool can send or approve.
3. The system never decides whether a document is genuine. "Received" means a person logged receipt.
4. No system assigns or changes a risk rating. There is no risk-rating field anywhere in the schema.
   The AI prepares; a person decides.
5. API keys are never logged or returned to the browser; error messages are scrubbed.

---

## Setup

Prerequisites: [uv](https://docs.astral.sh/uv/), Node 20+.

```powershell
Copy-Item .env.example .env      # then add GOOGLE_API_KEY (optional)
.\ChaseZero.bat                  # one click: uv sync, npm build, start on http://127.0.0.1:8000
```

Dev mode (hot reload): `.\start-dev.ps1` (uvicorn on 8000 + Vite on 5173).

### `.env` keys

| Key | Purpose |
|---|---|
| `GOOGLE_API_KEY` | Gemini key. `GEMINI_API_KEY` is accepted as an alias. **Empty = SIMULATED mode** (deterministic local output, estimated tokens, labelled "simulated" everywhere). |
| `ANTHROPIC_API_KEY` | Optional. If set, the fallback model uses a different provider. |
| `DEMO_PASSWORD_TEMPLATE` | Demo password pattern, e.g. `{Name}@<your-suffix>`. If missing or still `change-me`, a random suffix is generated on first start and written to `.env`. |
| `GEMINI_MODEL`, `GEMINI_FALLBACK_MODEL`, `USD_TO_INR`, `DEFAULT_MONTHLY_BUDGET_USD`, `USER_HOURLY_LLM_CALL_LIMIT`, `LLM_TIMEOUT_S`, `SESSION_SECRET`, `COOKIE_SECURE` | Optional overrides. |

### Models (one place: `backend/app/config.py`)

| Role | Model ID | List price per 1M tokens (in / out) |
|---|---|---|
| Primary | `gemini-3.1-flash-lite` | $0.25 / $1.50 |
| Fallback (same provider) | `gemini-3.5-flash-lite` | $0.30 / $2.50 |
| Fallback (if `ANTHROPIC_API_KEY`) | `claude-haiku-5-5` | placeholder, **unverified** |

Gemini IDs were checked against the live `models.list` endpoint and prices against
ai.google.dev pricing on 2026-11-16. `gemini-2.5-flash-lite` is no longer available to new users.
**All prices are placeholders until Finance confirms the contracted rate.** The INR figures use a
placeholder FX rate (`USD_TO_INR=88.0`).

## Sign in

Username = first name in lowercase. Password = `DEMO_PASSWORD_TEMPLATE` from `.env`:
- with `{Name}` in it (e.g. `{Name}@abc123`), each person gets their own password (`Sarah@abc123`);
- without `{Name}` (e.g. a fixed value), **every user shares that one password** — simplest for demos,
  but then anyone who knows it can sign in as any role.

Passwords are stored as PBKDF2-SHA256 hashes and never committed. Changing the template takes effect
on the next start (stored hashes are refreshed automatically).

| Username | Person (fictional) | Role | Lands on |
|---|---|---|---|
| `sarah` | Sarah Jenkins | Relationship Manager (5 cases) | Chase queue (own cases) |
| `daniel` | Daniel Okafor | Relationship Manager (3 cases) | Chase queue (own cases) |
| `priya` | Priya Raman | KYC Ops coordinator | Chase queue (all cases) |
| `tomas` | Tomas Lindqvist | KYC analyst | Chase queue (read-only) |
| `grace` | Grace Whitfield | MLRO | Audit log |
| `robert` | Robert Hale | COO | Stage analytics |
| `aisha` | Aisha Karim | AI Agent Owner | Agent Workbench |
| `elena` | Elena Brooks | Finance / CFO | AI Cost & Governance |

Sessions use a signed, HttpOnly, `SameSite=Strict` cookie that is revocable server-side and lasts
10 hours. After 5 failed sign-ins, that username and IP are locked out for 15 minutes. State-changing
calls must carry the header `X-ChaseUp-Request: 1`.

## Roles and permissions

The single source is `backend/app/rbac.py`. Every `/api` route carries a permission gate (a test
fails if one is missing), and the service layer re-checks the scope (own or all cases). The same
matrix appears in the UI under **Your access**.

| Permission | RM | Ops | Analyst | MLRO | COO | Agent Owner | Finance |
|---|---|---|---|---|---|---|---|
| Read cases | own | all | all | all | – | – | – |
| Mark received / waive (reason required) | – | all | – | – | – | – | – |
| Create a draft (run the chaser) | own | all | – | – | – | – | – |
| **Approve & send** | **own** | – | – | – | – | – | – |
| Discard a draft | own | all | – | – | – | – | – |
| Request a document from the RM | – | – | all | – | – | – | – |
| Audit log + verify chain | – | – | – | all | – | – | – |
| Agent traces | own | all | all | all | – | all | – |
| Stage analytics / Measure | – | all | – | all | all | – | – |
| AI cost | – | – | – | all | all | all | all |
| Read agent config | – | – | – | all | all | all | – |
| Edit prompt/tone/models, test, restore | – | – | – | – | – | all | – |

Some agent-config fields have their own rights. Only the **Agent Owner** may change the prompt,
tone, primary/fallback models, temperature, timeout and the outage drill. The **COO** sets the
monthly budget cap. The Agent Owner and the COO can both use the kill switch and the global AI
feature flag. Every change requires a reason and is audited.

## AI cost governance

- **Every LLM call attempt is a row in `agent_runs`** (append-only), including simulated, blocked
  and failed attempts. Each row records the agent, provider, model, config version, input/output
  tokens, latency, cost in USD and INR, status, trace ID, user and channel (UI or MCP).
- **Per-task cost:** one chase run is the drafter + critic + any revision. **Outcome-based cost:**
  cost per draft approved by the RM, cost per discarded draft, and fully-loaded cost per approved draft.
- **Controls, checked in this order:** global feature flag → per-agent kill switch → monthly budget
  cap (blocks calls once reached) → per-user hourly call limit → primary model (timeout, circuit
  breaker opens after 3 failures for 60 s, "simulate primary outage" drill) → fallback model →
  approved template.
- **Agent config** lives in the DB as append-only versions recording who, when and why. It is
  re-read on every call, so a change applies to the very next call with no restart. Any old version
  can be restored in one click. A "test this prompt on a synthetic case" option runs a candidate
  config without saving it.
- **Guardrails:** a fixed guardrail block is appended to every prompt at call time, so edits cannot
  remove it. Client and contact names, email and LEI are replaced with `[[PLACEHOLDERS]]` before the
  model call and restored afterwards. The output is validated: every missing document, the deadline
  and the RM's name must be present. It must contain no promises, waivers, amounts, phone numbers,
  links other than the secure portal, risk, credit or genuineness language, or coercive tone. If the
  critic rejects twice, the approved template is used instead.
- **Trace:** each run records a step-by-step trace — plan, data source (MCP or direct), controls,
  redaction, the exact prompt sent, each model call with tokens/latency/cost, validation, critic
  verdict and hand-off.

Measured in this build: one live chase run (drafter + critic, `gemini-3.1-flash-lite`) used about
900 tokens and cost about **$0.0006**.

## MCP server

`backend/app/mcp_server.py` uses the official `mcp` Python SDK v2. In v2, FastMCP was renamed
`MCPServer`. The server exposes six tools: `list_cases`, `get_case`, `list_missing_documents`,
`draft_chase_email` (creates a pending draft only), `get_agent_costs` and `get_audit_log`.
**There is no send or approve tool**, and every tool description says so. Each tool runs as the
owner of the MCP token, through the same service layer, RBAC and audit log as the REST API. LLM
calls made through MCP are tagged `via=mcp` in `agent_runs`.

The LangGraph chaser fetches case data through these MCP tools (an in-process MCP client). If MCP
is unavailable it falls back to direct DB access, and the trace shows which was used.

**1. Create a token:** sign in → **Your access** → *MCP tokens* → Create. The token is shown once
and stored only as a SHA-256 hash.

**2a. Streamable HTTP** (the app must be running): `http://127.0.0.1:8000/mcp`, with the header
`Authorization: Bearer ngmcp_…`

```bash
# Claude Code
claude mcp add --transport http chaseup http://127.0.0.1:8000/mcp --header "Authorization: Bearer ngmcp_YOUR_TOKEN"

# MCP Inspector: choose "Streamable HTTP", URL above, add the Authorization header
npx @modelcontextprotocol/inspector
```

**2b. stdio** (no web server needed):

```bash
cd backend
CHASEZERO_MCP_TOKEN=ngmcp_YOUR_TOKEN uv run python -m app.mcp_server
```

Claude Desktop (`claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "chaseup": {
      "command": "uv",
      "args": ["--directory", "C:/path/to/ChaseUp/backend", "run", "python", "-m", "app.mcp_server"],
      "env": { "CHASEZERO_MCP_TOKEN": "ngmcp_YOUR_TOKEN" }
    }
  }
}
```

The tests in `backend/tests/test_mcp.py` list the tools and call them in-process, over HTTP and
over stdio (a real subprocess).

## Audit and data integrity

`audit_events` is append-only. Each row's hash is `sha256(prev_hash ‖ canonical_json(event))`.
SQLite triggers abort any `UPDATE` or `DELETE` on `audit_events`, `agent_runs` and
`agent_config_versions`. The MLRO's **Verify chain** button recomputes the whole chain. A test
drops the trigger, tampers with a row, and confirms the verify step catches it.

## Tests

```powershell
cd backend
uv run ruff check app tests ; uv run mypy app ; uv run pytest -q
cd ..\frontend
npm run build ; npm test ; npm run test:e2e   # Playwright uses installed Edge by default (PW_CHANNEL=chromium to change)
```

## Demo script (about 10 minutes)

1. **(1 min) The problem.** Sign in as `robert` (COO). Open **Measure**: days from request to receipt
   are 17 days at the median before, against the pilot, with the 41% multi-round rate. Stage
   analytics show aggregates only, with no document content.
2. **(2 min) Ops prepares one consolidated chase.** Sign out and sign in as `priya`. The queue is
   sorted by the oldest waiting item. Open *Apex Global Commodities*, mark a document Received, and
   try to waive another — a reason is required. Run the chaser and watch the draft stream. **View
   the trace**: data came via MCP, names were redacted, and the exact prompt, tokens and cost are
   shown. Ops has no Approve button; a direct API call returns 403.
3. **(1 min) Critic drill.** Run with "simulate critic rejection". The critic rejects v1 (a promise
   and a waiver), the drafter revises, and v2 passes.
4. **(2 min) The RM approves.** Sign in as `daniel` — he cannot even open Sarah's case (403). Sign
   in as `sarah`, edit the draft, add "we guarantee approval", and the send is refused by
   validation. Remove it, then approve and send. The message goes to the simulated mail gateway and
   the timeline records it.
5. **(2 min) Agent Owner.** Sign in as `aisha`. In the Agent Workbench, change the tone with a
   reason, test it on the synthetic case, and see that the change applies on the next run. Restore
   v1. Turn on the outage drill and run again: the trace shows the primary failing and the fallback
   model answering. Note that the budget field is disabled for this role.
6. **(1 min) Cost.** Sign in as `elena`. AI Cost shows all-time and this-month totals, by agent and
   model, real against simulated, the cost per approved draft, and the per-task ledger. As `robert`,
   set the budget to $0, run the chaser as `priya`, and the call is blocked and the template used.
7. **(1 min) Oversight.** Sign in as `grace` (MLRO). Open the audit log (UI and MCP events) and
   click **Verify chain**. There is no risk rating anywhere.
8. **(30 s) MCP.** Create a token and run `claude mcp add …`. Ask Claude Code to "list my cases and
   draft a chase for the oldest one". The draft appears as pending, and there is no tool to send it.

## Assumptions

- The overdue threshold is 3 days since last contact (to be confirmed with Ops, per the architecture doc).
- The mail gateway is **simulated**: approved messages are written to `outbound_messages`, and no
  email is sent.
- Measure baseline and pilot rows are **seeded synthetic data** shaped to the case facts. Replace
  them with the ingested chase-email history before drawing conclusions.
- Budget spend includes the notional cost of simulated calls, so the cap can be drilled offline. Set
  `BUDGET_COUNTS_SIMULATED=0` to count real spend only.
- The circuit-breaker state and login throttling are in memory, per process, which is fine for a
  single-instance demo.
- The COO owns the budget field; the Agent Owner owns prompts and models; both can use the kill switch.
- Analyst Assist (Assignment 2 UBO extraction) is **out of scope** for this build at the product
  owner's request. The existing static mock at `/analystassist` is unchanged.

See [docs/STATUS.md](docs/STATUS.md) for the honest control-by-control status.
