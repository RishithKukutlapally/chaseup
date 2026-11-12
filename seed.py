from datetime import date, timedelta

from database import connect, initialize_database
from domain import add_seed_event


CASES = (
    ("NG-2026-8812", "Helios Marine Logistics Ltd", "Private limited company", "Alistair Vance", "Chasing missing documents", 35),
    ("NG-2026-1002", "Copperfield Renewables Group", "Holding company", "Sarah Jenkins", "Document intake and checks", 29),
    ("NG-2026-1003", "Bluehaven Medical Systems Inc", "Corporation", "Marcus Chen", "Chasing missing documents", 25),
    ("NG-2026-1004", "Westmere Agricultural Partners", "Partnership", "Elena Rostova", "UBO extraction", 22),
    ("NG-2026-1005", "Silverpine Data Services GmbH", "Limited company", "Alistair Vance", "Chasing missing documents", 19),
    ("NG-2026-1006", "Redfern Transit Holdings Oy", "Holding company", "Sarah Jenkins", "Document intake and checks", 17),
    ("NG-2026-1007", "Marlowe Industrial Components BV", "Private company", "Marcus Chen", "Chasing missing documents", 14),
    ("NG-2026-1008", "Sunward Orchard Technologies Pty Ltd", "Private company", "Elena Rostova", "Sanctions and PEP alerts", 11),
    ("NG-2026-1009", "Northwind Glassworks SA", "Corporation", "Alistair Vance", "Chasing missing documents", 9),
    ("NG-2026-1010", "Oakbridge Marine Research LLC", "Limited liability company", "Sarah Jenkins", "Document intake and checks", 7),
    ("NG-2026-1011", "Pinecrest Energy Storage PLC", "Public company", "Marcus Chen", "Chasing missing documents", 4),
    ("NG-2026-1012", "Clearwater Fabrication SARL", "Limited company", "Elena Rostova", "UBO extraction", 2),
)

DOCUMENTS = (
    ("ownership-chart", "Certified group ownership chart"),
    ("registry-extract", "Current corporate registry extract"),
    ("proof-of-address", "Proof of address for authorized representative"),
)


def seed_data(path=None) -> None:
    initialize_database(path)
    today = date.today()
    with connect(path) as connection:
        for index, (case_id, client, entity, rm, stage, age) in enumerate(CASES):
            opened_at = (today - timedelta(days=age)).isoformat()
            next_follow_up = (today + timedelta(days=index % 4)).isoformat()
            connection.execute(
                """
                INSERT OR IGNORE INTO cases
                    (id, client_name, entity_type, rm_name, stage, opened_at,
                     stage_started_at, next_follow_up, blocked)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                """,
                (
                    case_id,
                    client,
                    entity,
                    rm,
                    stage,
                    opened_at,
                    opened_at,
                    next_follow_up,
                    1 if index in {0, 3, 6} else 0,
                ),
            )
            for doc_index, (suffix, category) in enumerate(DOCUMENTS):
                document_id = f"{case_id}-{suffix}"
                due_days_ago = (index * 2 + doc_index + 3) % 12
                due_at = (today - timedelta(days=due_days_ago)).isoformat()
                requested_at = (today - timedelta(days=min(age, index + doc_index + 4))).isoformat()
                connection.execute(
                    """
                    INSERT OR IGNORE INTO documents
                        (id, case_id, category, owner, requested_at, due_at, chase_round)
                    VALUES (?, ?, ?, 'client', ?, ?, ?)
                    """,
                    (
                        document_id,
                        case_id,
                        category,
                        requested_at,
                        due_at,
                        min(3, 1 + (index + doc_index) % 3),
                    ),
                )
                add_seed_event(
                    connection,
                    case_id,
                    document_id,
                    "request",
                    rm,
                    f"seed-{document_id}-request",
                    "Initial synthetic document request",
                )
            if index % 4 == 1:
                document_id = f"{case_id}-proof-of-address"
                connection.execute(
                    "UPDATE documents SET state = 'received' WHERE id = ?",
                    (document_id,),
                )
                add_seed_event(
                    connection,
                    case_id,
                    document_id,
                    "received",
                    "Clara Gomez",
                    f"seed-{document_id}-received",
                    "Synthetic receipt confirmation",
                )
        connection.commit()


def main() -> None:
    seed_data()
    print("Synthetic Northgate Chase seed data is ready.")


if __name__ == "__main__":
    main()
