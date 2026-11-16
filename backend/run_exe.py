"""Single-executable launcher for Northgate ChaseZero (FastAPI + LangGraph + React UI)."""

from __future__ import annotations

import argparse
import multiprocessing
import os
import socket
import threading
import time
import webbrowser

import uvicorn

from app import config
from app.main import app
from app.paths import APP_DIR, DB_PATH, FRONTEND_DIST_DIR, is_frozen

DEFAULT_ENV_TEMPLATE = """# Northgate ChaseZero - LLM & Runtime Environment Configuration
# Add at least ONE API key below and restart or click "Reload .env" in the UI.

GOOGLE_API_KEY=
# Optional second provider for fallback:
ANTHROPIC_API_KEY=
DEMO_PASSWORD_TEMPLATE={Name}@change-me

CHASEZERO_HOST=127.0.0.1
CHASEZERO_PORT=8000
"""


def _find_available_port(host: str, preferred: int) -> int:
    for candidate in [preferred, *range(preferred + 1, preferred + 20)]:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            if s.connect_ex((host, candidate)) != 0:
                return candidate
    return preferred


def main() -> None:
    multiprocessing.freeze_support()

    parser = argparse.ArgumentParser(description="Northgate ChaseZero Executable")
    parser.add_argument("--no-browser", action="store_true", help="Do not auto-open browser")
    parser.add_argument("--port", type=int, default=0, help="Override HTTP port")
    args = parser.parse_args()

    # Ensure a user-editable .env exists next to ChaseZero.exe when running frozen
    local_env = APP_DIR / ".env"
    if is_frozen() and not local_env.exists():
        try:
            local_env.write_text(DEFAULT_ENV_TEMPLATE, encoding="utf-8")
        except OSError:
            pass

    live = bool(config.google_api_key())
    host = os.getenv("CHASEZERO_HOST", "127.0.0.1").strip() or "127.0.0.1"
    preferred_port = args.port or int(os.getenv("CHASEZERO_PORT", "8000"))
    port = _find_available_port(host, preferred_port)
    url = f"http://{host}:{port}"

    print("=" * 68)
    print("  NORTHGATE CHASEUP - RM-approved KYC document chasing")
    print("=" * 68)
    print(f"  App URL      : {url}")
    print(f"  .env Config  : {config.ACTIVE_ENV_FILE}")
    print(f"  LLM Mode     : {'LIVE (google / ' + config.GEMINI_PRIMARY_MODEL + ', fallback ' + config.fallback_model_for_primary() + ')' if live else 'SIMULATED (add GOOGLE_API_KEY to .env)'}")
    print(f"  SQLite DB    : {DB_PATH}")
    print(f"  Frontend UI  : {FRONTEND_DIST_DIR} (exists={FRONTEND_DIST_DIR.exists()})")
    print("=" * 68)
    print("  Press CTRL+C to shut down cleanly.\n")

    if not args.no_browser:
        def _open_browser() -> None:
            time.sleep(1.2)
            webbrowser.open(url)

        threading.Thread(target=_open_browser, daemon=True).start()

    uvicorn.run(app, host=host, port=port, log_level="info")


if __name__ == "__main__":
    main()
