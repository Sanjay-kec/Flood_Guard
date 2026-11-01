"""
FloodGuard – SQLite to MySQL Migration Script
=============================================
Safely migrates all tables and records from SQLite (`backend/floodguard.db`)
to MySQL Server (`floodguard` database).

PRESERVATION GUARANTEES:
1. SQLite database is strictly read-only; never modified, deleted, or overwritten.
2. Original primary key IDs and timestamps are strictly preserved.
3. Auto-increment values in MySQL are adjusted to MAX(id) + 1.
4. Passwords and credentials are read from .env and NEVER printed in console/logs.
"""

import os
import sys
import sqlite3
from pathlib import Path
from dotenv import load_dotenv
import sqlalchemy as sa
from sqlalchemy import text

# Load environment
_PROJECT_ROOT = Path(__file__).resolve().parent.parent
load_dotenv(_PROJECT_ROOT / ".env")

SQLITE_PATH = _PROJECT_ROOT / "backend" / "floodguard.db"

MYSQL_HOST = os.getenv("MYSQL_HOST", "127.0.0.1")
MYSQL_PORT = int(os.getenv("MYSQL_PORT", 3306))
MYSQL_USER = os.getenv("MYSQL_USER", "root")
MYSQL_PASSWORD = os.getenv("MYSQL_PASSWORD", "")
MYSQL_DATABASE = os.getenv("MYSQL_DATABASE", "floodguard")


def get_mysql_engine(include_db: bool = True) -> sa.engine.Engine:
    """Builds an engine connecting to MySQL Server."""
    from urllib.parse import quote_plus
    encoded_pwd = quote_plus(MYSQL_PASSWORD) if MYSQL_PASSWORD else ""
    db_part = f"/{MYSQL_DATABASE}" if include_db else ""
    conn_url = f"mysql+pymysql://{MYSQL_USER}:{encoded_pwd}@{MYSQL_HOST}:{MYSQL_PORT}{db_part}?charset=utf8mb4"
    return sa.create_engine(conn_url, pool_pre_ping=True)


def test_mysql_connection() -> tuple[bool, str]:
    """Tests connection to MySQL Server without logging password."""
    if not MYSQL_PASSWORD:
        return False, "MYSQL_PASSWORD is empty in .env. Please provide the MySQL root password."
    try:
        engine = get_mysql_engine(include_db=False)
        with engine.connect() as conn:
            conn.execute(text("SELECT 1;"))
        return True, "Successfully connected to MySQL Server."
    except Exception as exc:
        err = str(exc)
        if "Access denied" in err:
            return False, "Access denied: Invalid MySQL username or password."
        if "Can't connect to MySQL server" in err:
            return False, f"Could not reach MySQL server at {MYSQL_HOST}:{MYSQL_PORT}. Verify MySQL80 service is running."
        return False, f"MySQL connection error: {err}"


def create_mysql_database_if_not_exists(engine: sa.engine.Engine):
    """Ensures the target database exists."""
    with engine.connect() as conn:
        conn.execute(text(f"CREATE DATABASE IF NOT EXISTS `{MYSQL_DATABASE}` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"))
        conn.commit()
    print(f"[MySQL] Confirmed database `{MYSQL_DATABASE}` is ready.")


def create_tables(engine: sa.engine.Engine):
    """Creates the 4 FloodGuard tables in MySQL with exact types and indexes."""
    table_ddl = [
        # Table 1: sensor_readings
        """
        CREATE TABLE IF NOT EXISTS `sensor_readings` (
            `id` INT NOT NULL AUTO_INCREMENT,
            `timestamp` VARCHAR(64) NOT NULL,
            `temperature` FLOAT NOT NULL,
            `humidity` FLOAT NOT NULL,
            `rainfall` FLOAT NOT NULL,
            `water_level` FLOAT NOT NULL,
            PRIMARY KEY (`id`),
            INDEX `idx_sensor_timestamp` (`timestamp`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        """,
        # Table 2: predictions
        """
        CREATE TABLE IF NOT EXISTS `predictions` (
            `id` INT NOT NULL AUTO_INCREMENT,
            `timestamp` VARCHAR(64) NOT NULL,
            `latitude` DOUBLE NOT NULL,
            `longitude` DOUBLE NOT NULL,
            `elevation` FLOAT NOT NULL,
            `temperature` FLOAT NOT NULL,
            `humidity` FLOAT NOT NULL,
            `rainfall` FLOAT NOT NULL,
            `water_level` FLOAT NOT NULL,
            `prediction` INT NOT NULL,
            `result` VARCHAR(64) NOT NULL,
            `model_version` VARCHAR(32) DEFAULT 'v1',
            PRIMARY KEY (`id`),
            INDEX `idx_predictions_timestamp` (`timestamp`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        """,
        # Table 3: sms_dispatch_logs
        """
        CREATE TABLE IF NOT EXISTS `sms_dispatch_logs` (
            `id` INT NOT NULL AUTO_INCREMENT,
            `timestamp` VARCHAR(64) NOT NULL,
            `phone_number` VARCHAR(32) NOT NULL,
            `message_text` TEXT NOT NULL,
            `provider_name` VARCHAR(32) NOT NULL,
            `provider_message_id` VARCHAR(128) NULL,
            `delivery_status` VARCHAR(32) NOT NULL,
            `error_details` TEXT NULL,
            `is_test` TINYINT(1) DEFAULT 1,
            PRIMARY KEY (`id`),
            INDEX `idx_sms_dispatch_timestamp` (`timestamp`),
            INDEX `idx_sms_dispatch_status` (`delivery_status`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        """,
        # Table 4: community_recipients
        """
        CREATE TABLE IF NOT EXISTS `community_recipients` (
            `id` INT NOT NULL AUTO_INCREMENT,
            `full_name` VARCHAR(128) NOT NULL,
            `phone_number` VARCHAR(32) NOT NULL,
            `zone_id` VARCHAR(32) NOT NULL DEFAULT 'ZONE_1',
            `is_active` TINYINT(1) DEFAULT 1,
            `consent_given` TINYINT(1) NOT NULL DEFAULT 1,
            `created_at` VARCHAR(64) NOT NULL,
            PRIMARY KEY (`id`),
            UNIQUE KEY `uniq_phone_number` (`phone_number`)
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
        """
    ]

    with engine.connect() as conn:
        for ddl in table_ddl:
            conn.execute(text(ddl))
        conn.commit()
    print("[MySQL] All 4 tables verified / created with proper keys and indexes.")


def migrate_data(sqlite_conn: sqlite3.Connection, mysql_engine: sa.engine.Engine):
    """
    Migrates all rows from SQLite to MySQL in batches, preserving original IDs.
    """
    tables = [
        ("sensor_readings", ["id", "timestamp", "temperature", "humidity", "rainfall", "water_level"]),
        ("predictions", ["id", "timestamp", "latitude", "longitude", "elevation", "temperature", "humidity", "rainfall", "water_level", "prediction", "result", "model_version"]),
        ("sms_dispatch_logs", ["id", "timestamp", "phone_number", "message_text", "provider_name", "provider_message_id", "delivery_status", "error_details", "is_test"]),
        ("community_recipients", ["id", "full_name", "phone_number", "zone_id", "is_active", "consent_given", "created_at"]),
    ]

    sqlite_cur = sqlite_conn.cursor()

    for table_name, cols in tables:
        sqlite_cur.execute(f"SELECT COUNT(*) FROM `{table_name}`;")
        sqlite_count = sqlite_cur.fetchone()[0]

        with mysql_engine.connect() as mysql_conn:
            res = mysql_conn.execute(text(f"SELECT COUNT(*) FROM `{table_name}`;"))
            mysql_count = res.scalar()

        if mysql_count > 0:
            print(f"[Skip] Table `{table_name}` already contains {mysql_count} records in MySQL.")
            continue

        if sqlite_count == 0:
            print(f"[Table: {table_name}] 0 records in SQLite (empty table preserved).")
            continue

        print(f"[Migrating `{table_name}`] Fetching {sqlite_count} records from SQLite...")
        col_list_str = ", ".join([f"`{c}`" for c in cols])
        param_list_str = ", ".join([f":{c}" for c in cols])

        sqlite_cur.execute(f"SELECT {col_list_str} FROM `{table_name}` ORDER BY id ASC;")
        rows = sqlite_cur.fetchall()

        insert_sql = text(f"INSERT INTO `{table_name}` ({col_list_str}) VALUES ({param_list_str});")

        batch_size = 500
        records = []
        max_id = 0
        for r in rows:
            record_dict = dict(r)
            records.append(record_dict)
            if record_dict.get("id", 0) > max_id:
                max_id = record_dict["id"]

        with mysql_engine.connect() as mysql_conn:
            for i in range(0, len(records), batch_size):
                batch = records[i:i + batch_size]
                mysql_conn.execute(insert_sql, batch)
            
            # Reset auto_increment to MAX(id) + 1
            if max_id > 0:
                mysql_conn.execute(text(f"ALTER TABLE `{table_name}` AUTO_INCREMENT = {max_id + 1};"))
            mysql_conn.commit()

        print(f"  [OK] Migrated {len(records)} records into `{table_name}` (AUTO_INCREMENT reset to {max_id + 1}).")


def verify_record_counts(sqlite_conn: sqlite3.Connection, mysql_engine: sa.engine.Engine):
    """
    Verifies that record counts in MySQL exactly match SQLite.
    """
    tables = ["sensor_readings", "predictions", "sms_dispatch_logs", "community_recipients"]
    sqlite_cur = sqlite_conn.cursor()

    print("\n" + "=" * 65)
    print(f"{'Table Name':<25} | {'SQLite Count':<15} | {'MySQL Count':<15} | {'Status'}")
    print("=" * 65)

    all_matched = True
    for tbl in tables:
        sqlite_cur.execute(f"SELECT COUNT(*) FROM `{tbl}`;")
        s_count = sqlite_cur.fetchone()[0]

        with mysql_engine.connect() as conn:
            m_count = conn.execute(text(f"SELECT COUNT(*) FROM `{tbl}`;")).scalar()

        match = (s_count == m_count)
        status = "MATCH [OK]" if match else "MISMATCH [FAIL]"
        if not match:
            all_matched = False

        print(f"{tbl:<25} | {s_count:<15} | {m_count:<15} | {status}")
    print("=" * 65)

    return all_matched


def run():
    print("=" * 65)
    print("  FLOODGUARD DATABASE MIGRATION: SQLITE -> MYSQL")
    print("=" * 65)
    print(f"Source SQLite : {SQLITE_PATH}")
    print(f"Target MySQL  : {MYSQL_USER}@{MYSQL_HOST}:{MYSQL_PORT}/{MYSQL_DATABASE}")
    print("-" * 65)

    if not SQLITE_PATH.exists():
        print(f"[INFO] Source SQLite database not found at {SQLITE_PATH}.")
        print("[INFO] FloodGuard has completed migration and runs exclusively on MySQL (127.0.0.1:3306/floodguard).")
        return True

    ok, msg = test_mysql_connection()
    if not ok:
        print(f"[MySQL Connection Status] FAILED: {msg}")
        return False

    print(f"[MySQL Connection Status] SUCCESS: {msg}")

    # Connect to SQLite read-only
    sqlite_conn = sqlite3.connect(f"file:{SQLITE_PATH}?mode=ro", uri=True)
    sqlite_conn.row_factory = sqlite3.Row

    # Prepare MySQL DB & Tables
    server_engine = get_mysql_engine(include_db=False)
    create_mysql_database_if_not_exists(server_engine)

    db_engine = get_mysql_engine(include_db=True)
    create_tables(db_engine)

    # Migrate data
    migrate_data(sqlite_conn, db_engine)

    # Verify counts
    success = verify_record_counts(sqlite_conn, db_engine)
    sqlite_conn.close()

    if success:
        print("\n[SUCCESS] SQLite to MySQL data migration completed successfully with 100% record parity!")
    else:
        print("\n[WARNING] Discrepancies detected between SQLite and MySQL record counts.")

    return success


if __name__ == "__main__":
    run()

