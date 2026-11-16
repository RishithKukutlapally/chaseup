"""Step-by-step trace recorder for agent runs (shown verbatim in the UI)."""

from __future__ import annotations

import json
import time
import uuid
from collections.abc import Awaitable, Callable
from datetime import datetime, timezone
from typing import Any


class Trace:
    def __init__(self, kind: str, emit: Callable[[dict[str, Any]], Awaitable[None]] | None = None) -> None:
        self.trace_id = f"tr_{uuid.uuid4().hex[:20]}"
        self.kind = kind
        self.steps: list[dict[str, Any]] = []
        self._t0 = time.perf_counter()
        self._emit = emit

    async def step(self, name: str, label: str, status: str = "ok", **data: Any) -> dict[str, Any]:
        entry = {
            "n": len(self.steps) + 1,
            "step": name,
            "label": label,
            "status": status,  # ok | warn | fail | info
            "t_ms": int((time.perf_counter() - self._t0) * 1000),
            "at": datetime.now(timezone.utc).isoformat(timespec="milliseconds"),
            "data": data,
        }
        self.steps.append(entry)
        if self._emit:
            await self._emit({"type": "trace_step", "trace_id": self.trace_id, "step": entry})
        return entry

    def to_json(self) -> str:
        return json.dumps(self.steps, default=str)
