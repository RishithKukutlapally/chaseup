import os
from pathlib import Path

from dotenv import load_dotenv


ROOT_DIR = Path(__file__).resolve().parent
load_dotenv(ROOT_DIR / ".env", override=False)

DATABASE_PATH = Path(os.environ.get("NORTHGATE_DB_PATH", ROOT_DIR / "northgate_chase.sqlite3"))

# Ops assumptions to confirm: an item is due on its due date and becomes
# overdue only after it has been more than two full days past due.
OVERDUE_AFTER_DAYS = 2

STAGE_DURATIONS = (
    ("Document intake and checks", 9),
    ("Chasing missing documents", 17),
    ("UBO extraction", 11),
    ("Sanctions and PEP alerts", 6),
    ("Risk & Committee Review", 12),
    ("Core-banking account opening", 7),
)

GEMINI_ENABLED = os.environ.get("GEMINI_ENABLED", "false").strip().lower() in {
    "1",
    "true",
    "yes",
}
GEMINI_MODEL = "gemini-3.5-flash-lite"
