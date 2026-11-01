"""
FloodGuard – SMS Database Module (MySQL Exclusive)
==================================================
Manages persistent storage in MySQL for:
  1. sms_dispatch_logs – Audit logs for every SMS sent via Twilio/mock
  2. community_recipients – Opt-in recipients for community flood alerts

Database Engine:
  - MySQL 8.0+ via SQLAlchemy 2.0 and PyMySQL.
  - SQLite support has been completely decommissioned.
"""

from datetime import datetime
from typing import Any
import sqlalchemy as sa
from sqlalchemy import text
from backend.database import get_mysql_engine


def init_sms_db() -> None:
    """
    Initializes the SMS-related tables and indexes idempotently in MySQL.
    """
    engine = get_mysql_engine()
    with engine.connect() as conn:
        conn.execute(text("""
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
        """))
        conn.execute(text("""
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
        """))
        conn.commit()


def insert_sms_log(
    phone_number: str,
    message_text: str,
    provider_name: str,
    delivery_status: str,
    provider_message_id: str | None = None,
    error_details: str | None = None,
    is_test: bool = True,
    timestamp: str | None = None,
) -> int:
    """
    Inserts a single SMS dispatch record into sms_dispatch_logs in MySQL.
    """
    if timestamp is None:
        timestamp = datetime.now().isoformat()

    engine = get_mysql_engine()
    insert_stmt = text("""
        INSERT INTO `sms_dispatch_logs` (
            `timestamp`, `phone_number`, `message_text`,
            `provider_name`, `provider_message_id`,
            `delivery_status`, `error_details`, `is_test`
        )
        VALUES (
            :timestamp, :phone_number, :message_text,
            :provider_name, :provider_message_id,
            :delivery_status, :error_details, :is_test
        );
    """)
    with engine.connect() as conn:
        res = conn.execute(
            insert_stmt,
            {
                "timestamp": str(timestamp),
                "phone_number": str(phone_number),
                "message_text": str(message_text),
                "provider_name": str(provider_name),
                "provider_message_id": provider_message_id,
                "delivery_status": str(delivery_status),
                "error_details": error_details,
                "is_test": 1 if is_test else 0,
            },
        )
        conn.commit()
        return int(res.lastrowid)


def get_recent_sms_logs(limit: int = 50) -> list[dict[str, Any]]:
    """
    Retrieves recent SMS dispatch records from MySQL, newest first.
    Masks middle digits of phone number for display safety.
    """
    engine = get_mysql_engine()
    select_stmt = text("""
        SELECT `id`, `timestamp`, `phone_number`, `message_text`,
               `provider_name`, `provider_message_id`, `delivery_status`,
               `error_details`, `is_test`
        FROM `sms_dispatch_logs`
        ORDER BY `id` DESC
        LIMIT :limit;
    """)
    with engine.connect() as conn:
        rows = conn.execute(select_stmt, {"limit": limit}).fetchall()
        results = []
        for r in rows:
            raw_phone = str(r[2] or "")
            if len(raw_phone) >= 10:
                masked_phone = raw_phone[:3] + " " + raw_phone[3:5] + "*****" + raw_phone[-2:]
            else:
                masked_phone = raw_phone
            results.append({
                "id": r[0],
                "timestamp": r[1],
                "phone_number": raw_phone,
                "masked_phone": masked_phone,
                "message_text": r[3],
                "provider_name": r[4],
                "provider_message_id": r[5],
                "delivery_status": r[6],
                "error_details": r[7],
                "is_test": bool(r[8]),
            })
        return results


def get_daily_test_sms_count() -> int:
    """
    Counts how many test SMS messages were successfully sent today (current calendar date).
    """
    today_prefix = datetime.now().strftime("%Y-%m-%d")
    engine = get_mysql_engine()
    query = text("""
        SELECT COUNT(*) as `cnt`
        FROM `sms_dispatch_logs`
        WHERE `timestamp` LIKE :prefix
          AND `is_test` = 1
          AND `delivery_status` IN ('sent', 'queued', 'delivered', 'mock_sent', 'simulated');
    """)
    with engine.connect() as conn:
        res = conn.execute(query, {"prefix": f"{today_prefix}%"}).scalar()
        return int(res or 0)


def get_recipient_stats() -> dict[str, int]:
    """
    Returns registered and opted-in community recipient counts from MySQL.
    """
    engine = get_mysql_engine()
    query = text("""
        SELECT
            COUNT(*) as total_registered,
            SUM(CASE WHEN `is_active` = 1 AND `consent_given` = 1 THEN 1 ELSE 0 END) as active_opted_in
        FROM `community_recipients`;
    """)
    with engine.connect() as conn:
        row = conn.execute(query).fetchone()
        total = int(row[0]) if row and row[0] else 0
        active = int(row[1]) if row and row[1] else 0
        return {
            "total_registered": total,
            "active_opted_in": active,
        }


# Auto-initialize SMS tables on module load
init_sms_db()
