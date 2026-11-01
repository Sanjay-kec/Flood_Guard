"""
FloodGuard – MySQL Database Health & Status Verification Utility
================================================================
Inspects MySQL Server (127.0.0.1:3306/floodguard) tables, row counts,
ID ranges, and AUTO_INCREMENT status.
"""

import sys
from pathlib import Path
_ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(_ROOT))

import backend.database as db
from sqlalchemy import text

REQUIRED_TABLES = [
    "sensor_readings",
    "predictions",
    "sms_dispatch_logs",
    "community_recipients",
]


def inspect():
    print("=" * 65)
    print("  FLOODGUARD MYSQL DATABASE INSPECTION & HEALTH CHECK")
    print("=" * 65)
    print(f"Target Database : {db.MYSQL_DATABASE}")
    print(f"Host / Port     : {db.MYSQL_HOST}:{db.MYSQL_PORT}")
    print(f"User            : {db.MYSQL_USER}")
    print("-" * 65)

    engine = db.get_mysql_engine()
    healthy = True

    with engine.connect() as conn:
        m_tables = conn.execute(text("SHOW TABLES;")).fetchall()
        m_table_names = [r[0] for r in m_tables]
        print(f"Detected Tables ({len(m_table_names)}): {m_table_names}\n")

        print(f"{'Table Name':<25} | {'Count':<8} | {'ID Range':<15} | {'Next ID':<8} | {'Status'}")
        print("-" * 65)

        for t in REQUIRED_TABLES:
            if t in m_table_names:
                cnt = conn.execute(text(f"SELECT COUNT(*) FROM `{t}`;")).scalar()
                min_id = conn.execute(text(f"SELECT MIN(id) FROM `{t}`;")).scalar()
                max_id = conn.execute(text(f"SELECT MAX(id) FROM `{t}`;")).scalar()
                auto_inc = conn.execute(text(
                    "SELECT AUTO_INCREMENT FROM information_schema.tables "
                    f"WHERE table_schema='{db.MYSQL_DATABASE}' AND table_name='{t}';"
                )).scalar()
                id_range = f"{min_id}..{max_id}" if min_id is not None else "None"
                print(f"{t:<25} | {cnt:<8} | {id_range:<15} | {str(auto_inc):<8} | [OK]")
            else:
                print(f"{t:<25} | {'MISSING':<8} | {'-':<15} | {'-':<8} | [FAIL]")
                healthy = False

    print("=" * 65)
    if healthy:
        print("[SUCCESS] All required MySQL tables are present and healthy.")
    else:
        print("[ERROR] Missing required MySQL tables.")
    print("=" * 65)
    return healthy


if __name__ == "__main__":
    inspect()
