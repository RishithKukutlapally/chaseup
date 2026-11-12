# Northgate Chase prototype

Northgate Chase is a synthetic-data prototype for tracking missing corporate KYC onboarding documents. It uses FastAPI, SQLite, server-rendered Stitch HTML, and small vanilla JavaScript bindings.

## Requirements

- Python 3.11 or newer

## Setup

From the project directory:

```powershell
python -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
```

The app loads `.env` from the project directory. Copy `.env.example` to `.env` if needed. The prototype works without `GEMINI_API_KEY`; template drafts remain available. **Gemini drafting and subject classification are not implemented yet**, so adding a key does not enable AI behavior.

## Seed synthetic data

```powershell
python -m seed
```

The seed operation is safe to rerun and creates 12 fictitious cases and synthetic document/event history in `northgate_chase.sqlite3`.

## Run

```powershell
python -m uvicorn app:app --host 127.0.0.1 --port 8000
```

Open `http://127.0.0.1:8000/`. The five screens are served at:

- `/screens/chase-queue`
- `/screens/case-detail`
- `/screens/reminder-composer`
- `/screens/stage-analytics`
- `/screens/analyst-handoff`

## Tests

```powershell
python -m pytest -q
```

## Prototype and deployment limits

- Draft approval is enforced by the API. A draft cannot be sent through the API without explicit approval.
- “Send” and scheduled send currently record a send event in SQLite; no email gateway is configured, so no message is delivered.
- Gemini is not wired into draft rewriting or an ingestion script. The presence of an API key alone has no effect; AI must remain off.
- This prototype has no authentication or role-based access control and is not production-ready for real bank/client data. Keep it limited to synthetic data until security, access controls, operational deployment, and delivery integrations are implemented and reviewed.
- The due-date rule (due on the due date and overdue after two full days past due) is an assumption for Ops to confirm.
