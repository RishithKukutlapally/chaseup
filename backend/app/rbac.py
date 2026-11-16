"""THE permission matrix. Every API route and every MCP tool checks against this table.

Scope "all" = every case; "own" = only cases where the user is the named RM.
"""

from __future__ import annotations

from dataclasses import dataclass

from app.models import KycCase, User

RM = "rm"
OPS = "ops"
ANALYST = "analyst"
MLRO = "mlro"
COO = "coo"
AGENT_OWNER = "agent_owner"
FINANCE = "finance"

ROLES: dict[str, str] = {
    RM: "Relationship Manager",
    OPS: "KYC Ops Coordinator",
    ANALYST: "KYC Analyst",
    MLRO: "MLRO (Oversight)",
    COO: "COO",
    AGENT_OWNER: "AI Agent Owner",
    FINANCE: "Finance / CFO",
}

ALL = "all"
OWN = "own"

# permission -> {role: scope}
MATRIX: dict[str, dict[str, str]] = {
    # case data
    "case:read": {RM: OWN, OPS: ALL, ANALYST: ALL, MLRO: ALL},
    "case:note_edit": {RM: OWN},
    "document:update_status": {OPS: ALL},  # mark received / waive (reason required)
    "draft:create": {OPS: ALL, RM: OWN},
    "draft:read": {RM: OWN, OPS: ALL, MLRO: ALL},
    "draft:approve_send": {RM: OWN},  # the red line: named RM only
    "draft:discard": {RM: OWN, OPS: ALL},
    "case:demo_reset": {OPS: ALL},
    "analyst:request_from_rm": {ANALYST: ALL},
    # oversight
    "audit:read": {MLRO: ALL},
    "audit:verify": {MLRO: ALL},
    "trace:read": {RM: OWN, OPS: ALL, ANALYST: ALL, MLRO: ALL, AGENT_OWNER: ALL},
    "analytics:read": {COO: ALL, OPS: ALL, MLRO: ALL},
    "measure:read": {COO: ALL, OPS: ALL, MLRO: ALL},
    # AI cost & governance
    "cost:read": {FINANCE: ALL, COO: ALL, AGENT_OWNER: ALL, MLRO: ALL},
    "agent:read_config": {AGENT_OWNER: ALL, MLRO: ALL, COO: ALL},
    "agent:edit_config": {AGENT_OWNER: ALL},
    "agent:restore_version": {AGENT_OWNER: ALL},
    "agent:test_run": {AGENT_OWNER: ALL},
    "agent:control": {AGENT_OWNER: ALL, COO: ALL},  # field-level rights below decide which switch
    "system:reload_env": {AGENT_OWNER: ALL},
    # self-service
    "mcp:manage_own_tokens": {r: ALL for r in ROLES},
    "self:read": {r: ALL for r in ROLES},
}

# Field-level rights on agent configuration / controls.
AGENT_FIELD_RIGHTS: dict[str, set[str]] = {
    "system_prompt": {AGENT_OWNER},
    "tone": {AGENT_OWNER},
    "primary_model": {AGENT_OWNER},
    "fallback_model": {AGENT_OWNER},
    "temperature": {AGENT_OWNER},
    "timeout_s": {AGENT_OWNER},
    "enabled": {AGENT_OWNER, COO},  # kill switch
    "simulate_primary_outage": {AGENT_OWNER},  # outage drill
    "monthly_budget_usd": {COO},  # spend owner sets the cap
    "ai_feature_flag": {AGENT_OWNER, COO},
}

# Landing screen per role (used by the UI after sign-in).
LANDING: dict[str, str] = {
    RM: "chase-queue",
    OPS: "chase-queue",
    ANALYST: "chase-queue",
    MLRO: "audit-log",
    COO: "stage-analytics",
    AGENT_OWNER: "agent-workbench",
    FINANCE: "ai-cost",
}


class PermissionDenied(Exception):
    def __init__(self, message: str) -> None:
        super().__init__(message)
        self.message = message


class NotFound(Exception):
    def __init__(self, message: str) -> None:
        super().__init__(message)
        self.message = message


@dataclass
class Grant:
    permission: str
    scope: str


def scope_for(user: User, permission: str) -> str | None:
    return MATRIX.get(permission, {}).get(user.role)


def can(user: User, permission: str, case: KycCase | None = None) -> bool:
    scope = scope_for(user, permission)
    if scope is None:
        return False
    if scope == OWN and case is not None:
        return case.assigned_rm_user_id == user.id
    return True


def authorize(user: User, permission: str, case: KycCase | None = None) -> Grant:
    if permission not in MATRIX:
        raise PermissionDenied(f"Unknown permission '{permission}' (default deny)")
    scope = scope_for(user, permission)
    if scope is None:
        raise PermissionDenied(f"Role '{ROLES.get(user.role, user.role)}' lacks '{permission}'")
    if scope == OWN and case is not None and case.assigned_rm_user_id != user.id:
        raise PermissionDenied(
            f"'{permission}' is limited to your own cases; {case.case_code} belongs to {case.assigned_rm}"
        )
    return Grant(permission, scope)


def authorize_fields(user: User, fields: list[str]) -> None:
    denied = [f for f in fields if user.role not in AGENT_FIELD_RIGHTS.get(f, set())]
    if denied:
        raise PermissionDenied(f"Role '{ROLES.get(user.role, user.role)}' may not change: {', '.join(denied)}")


def matrix_for_ui() -> dict:
    return {
        "roles": ROLES,
        "permissions": MATRIX,
        "agent_field_rights": {k: sorted(v) for k, v in AGENT_FIELD_RIGHTS.items()},
        "landing": LANDING,
    }
