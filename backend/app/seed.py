"""Seed SYNTHETIC data: staff logins, 8 KYC cases, document checklists, measurement history.

All people, companies, identifiers and e-mail addresses are fictional.
"""

from __future__ import annotations

import hashlib
import random
from datetime import datetime, timedelta, timezone

from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from app import audit
from app.agent_config import ensure_defaults
from app.models import DocRequestHistory, KycCase, MissingDocument, User
from app.rbac import AGENT_OWNER, ARCHITECT, BUSINESS, DATA, MLRO, OPS, PRODUCT, RM
from app.security import demo_password_for, hash_password, verify_password

STAFF = [
    ("sarah", "Sarah Jenkins", RM, "Relationship Manager — Energy & Commodities"),
    ("daniel", "Daniel Okafor", RM, "Relationship Manager — Structured Debt"),
    ("priya", "Priya Raman", OPS, "KYC Ops Coordinator"),
    ("aisha", "Aisha Karim", AGENT_OWNER, "AI Agent Owner — Engineering"),
    ("omar", "Omar Haddad", ARCHITECT, "Enterprise Architect — AI Gateway & Cloud"),
    ("mei", "Mei Tanaka", PRODUCT, "Product Owner — ChaseUp workflow & UX"),
    ("robert", "Robert Hale", BUSINESS, "COO — business sponsor (with the CFO office)"),
    ("grace", "Grace Whitfield", MLRO, "MLRO — Security & InfoSec"),
    ("lucas", "Lucas Brandt", DATA, "Data Lead — Checklist & email ingestion"),
]

# case_code, client, rm_username, days_since_contact, days_open, rounds, contact, role, email, deadline, desk, jurisdiction, docs
CASES = [
    ("NCZ-2024-8841", "Apex Global Commodities Ltd", "sarah", 4.2, 24, 2, "Alistair Finch", "General Counsel",
     "a.finch@apex-commodities.example", "1 December", "Energy & Commodities", "UK",
     [("Ultimate Beneficial Ownership (UBO) Register — Tier 2", "Missing", 9), ("Certified Trust Deed (2023 Addendum)", "Missing", 9),
      ("Certificate of Incorporation & Articles of Association", "Received", 20), ("Authorised Signatory List", "Received", 14)]),
    ("NCZ-2024-8854", "Meridian Capital Partners Fund IV", "sarah", 3.8, 19, 1, "Helena Vance", "Chief Compliance Officer",
     "h.vance@meridian-cap.example", "4 December", "FX & Rates", "Cayman / UK",
     [("Board Resolution 4B (authorised signatories)", "Missing", 6), ("W-8BEN-E Tax Form", "Missing", 6),
      ("Certificate of Good Standing", "Received", 12)]),
    ("NCZ-2024-8862", "Vanguard Logistics Nordics AS", "daniel", 3.1, 15, 1, "Henrik Solberg", "CFO",
     "h.solberg@vanguard-nordics.example", "5 December", "Structured Debt", "Norway",
     [("Certificate of Incumbency", "Missing", 5), ("Audited FY23 Financial Statements", "Received", 11)]),
    ("NCZ-2024-8849", "Aethelgard Global Holdings Ltd", "daniel", 5.0, 31, 3, "Marcus Vance", "Company Secretary",
     "m.vance@aethelgard.example", "28 November", "FX & Rates", "UK / Luxembourg",
     [("Register of Persons with Significant Control (PSC)", "Missing", 14), ("Proof of Operating Address — Luxembourg SPV", "Missing", 14),
      ("Group Structure Chart (signed)", "Missing", 8), ("Certificate of Incorporation & Memorandum", "Received", 25)]),
    ("NCZ-2024-8870", "Aura Renewable Tech Holdings", "sarah", 1.5, 9, 0, "Dr. Elena Rostova", "Head of Treasury",
     "e.rostova@aura-renew.example", "10 December", "Energy & Commodities", "UK / Germany",
     [("Commercial Register Extract (Handelsregister B)", "Missing", 3)]),
    ("NCZ-2024-8875", "Helios Shipping Syndicate Ltd", "daniel", 2.2, 12, 1, "Nikos Papadopoulos", "Managing Director",
     "n.papadopoulos@helios-ship.example", "8 December", "Structured Debt", "Greece / UK",
     [("Vessel Beneficial Ownership Attestation", "Missing", 4), ("Register of Members", "Received", 9)]),
    ("NCZ-2024-8833", "Sovereign Ridge Capital LLC", "sarah", 0.8, 7, 0, "Claire Sterling", "COO",
     "c.sterling@sovereign-ridge.example", "12 December", "FX & Rates", "Delaware",
     [("IRS Form W-9 & FATCA confirmation", "Missing", 2), ("Form ADV Part 1A & 2A", "Received", 5)]),
    ("NCZ-2024-8802", "Albion Trade Finance PLC", "sarah", 1.0, 40, 3, "David Thorne", "Head of Legal",
     "d.thorne@albion-tf.example", "Completed", "FX & Rates", "UK",
     [("Regulator Authorisation Letter", "Received", 30), ("Source of Funds Statement", "Received", 25)]),
]

BASELINE_DOC_TYPES = ["UBO register", "Trust deed", "Board resolution", "Tax form", "Good standing", "Address proof",
                      "Financial statements", "Signatory list"]


async def sync_users(session: AsyncSession) -> dict[str, User]:
    users: dict[str, User] = {}
    for username, name, role, title in STAFF:
        u = (await session.execute(select(User).where(User.username == username))).scalar_one_or_none()
        pw = demo_password_for(name)
        if u is None:
            u = User(username=username, display_name=name, role=role, title=title, password_hash=hash_password(pw))
            session.add(u)
        else:
            u.role, u.title, u.display_name = role, title, name
            if not verify_password(pw, u.password_hash):
                u.password_hash = hash_password(pw)  # template changed in .env
        users[username] = u
    # Logins from earlier versions (e.g. analyst, finance) are switched off, not deleted.
    keep = {s[0] for s in STAFF}
    for old in (await session.execute(select(User))).scalars():
        if old.username not in keep:
            old.active = False
    await session.commit()
    return users


async def seed_database(session: AsyncSession) -> None:
    users = await sync_users(session)
    await ensure_defaults(session)
    if (await session.scalar(select(func.count(KycCase.id)))) or 0:
        return
    now = datetime.now(timezone.utc)
    for (code, client, rm, since, opened, rounds, contact, crole, email, deadline, desk, juris, docs) in CASES:
        rm_user = users[rm]
        c = KycCase(
            case_code=code, client_name=client, status="Completed" if deadline == "Completed" else "Missing_Docs",
            days_open=opened, last_contact_date=now - timedelta(days=since), chase_round_count=rounds,
            lei=f"SYN{int(hashlib.sha256(code.encode()).hexdigest(), 16) % 10**15:015d}X", entity_type="Corporate", jurisdiction=juris, desk=desk,
            region="EMEA", address="(synthetic address)", contact_name=contact, contact_role=crole,
            contact_email=email, assigned_rm=rm_user.display_name, assigned_rm_user_id=rm_user.id,
            target_deadline_label=deadline if deadline != "Completed" else "n/a",
            relationship_notes="Synthetic case for the ChaseUp demo.",
        )
        for i, (dname, status, age) in enumerate(docs):
            requested = now - timedelta(days=age)
            c.documents.append(MissingDocument(
                document_name=dname, status=status, description="As listed on the onboarding checklist",
                requirement_meta="Client document", doc_code=f"DOC-{i + 1:02d}", category="corporate",
                owner="client", chase_round=max(1, rounds), requested_at=requested,
                received_at=(requested + timedelta(days=max(1, age - 3))) if status == "Received" else None,
                assigned_to_or_verifier=("Receipt logged by KYC Ops" if status == "Received" else f"Owed by {contact}"),
            ))
        session.add(c)
    await session.commit()

    # Measurement history (synthetic). Baseline mirrors the case facts: ~3 rounds x 5-6 days ~= 17 days,
    # 41% of files going back more than once. Pilot: one consolidated request, fewer rounds.
    rng = random.Random(42)
    multi_round = set(rng.sample(range(160), 66))  # 66/160 = 41% of files go back more than once
    for i in range(160):
        rounds = rng.choice([2, 3, 3, 4]) if i in multi_round else 1
        days = sum(rng.uniform(4.5, 6.5) for _ in range(rounds)) + (rng.uniform(10, 14) if rounds == 1 else 0)
        req = now - timedelta(days=400 - i)
        session.add(DocRequestHistory(period="baseline", doc_type=rng.choice(BASELINE_DOC_TYPES), requested_at=req,
                                      received_at=req + timedelta(days=days), chase_rounds=rounds))
    for i in range(60):
        rounds = 1 if rng.random() < 0.8 else 2
        days = rng.uniform(4, 9) + (rng.uniform(3, 5) if rounds == 2 else 0)
        req = now - timedelta(days=90 - i)
        session.add(DocRequestHistory(period="pilot", doc_type=rng.choice(BASELINE_DOC_TYPES), requested_at=req,
                                      received_at=req + timedelta(days=days), chase_rounds=rounds))
    await session.commit()
    await audit.record(session, actor=None, action="system_seeded", entity_type="system", via="system",
                       details={"cases": len(CASES), "users": len(STAFF), "synthetic": True})
