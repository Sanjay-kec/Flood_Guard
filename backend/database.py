"""
FloodGuard – Database Service (MySQL Exclusive)
================================================
Provides persistent storage for:
  1. Sensor readings from the ESP32 (POST /sensor)
  2. Flood prediction inputs and outputs (POST /predict, POST /predict/rf)

Database Engine:
  - MySQL 8.0+ via SQLAlchemy 2.0 and PyMySQL.
  - SQLite support has been completely decommissioned.
"""

from pathlib import Path
import os
from datetime import datetime
from typing import Any
from urllib.parse import quote_plus
import sqlalchemy as sa
from sqlalchemy import text
from dotenv import load_dotenv

# Load environment configuration from project root
_HERE = Path(__file__).resolve().parent
_PROJECT_ROOT = _HERE.parent
load_dotenv(_PROJECT_ROOT / ".env")

# Engine configuration (Strict MySQL)
DB_ENGINE_NAME = os.getenv("DB_ENGINE", "mysql").lower()
MYSQL_HOST = os.getenv("MYSQL_HOST", "127.0.0.1")
MYSQL_PORT = int(os.getenv("MYSQL_PORT", 3306))
MYSQL_USER = os.getenv("MYSQL_USER", "root")
MYSQL_PASSWORD = os.getenv("MYSQL_PASSWORD", "")
MYSQL_DATABASE = os.getenv("MYSQL_DATABASE", "floodguard")

_mysql_engine: sa.engine.Engine | None = None


def get_mysql_engine() -> sa.engine.Engine:
    """
    Returns a singleton SQLAlchemy Engine connected to MySQL.
    Raises RuntimeError if MySQL credentials are missing or invalid.
    """
    global _mysql_engine
    if _mysql_engine is None:
        if not MYSQL_PASSWORD:
            raise RuntimeError(
                "MYSQL_PASSWORD is empty in .env. Please configure MySQL root password "
                "in .env to connect to the database (127.0.0.1:3306/floodguard)."
            )
        encoded_pwd = quote_plus(MYSQL_PASSWORD)
        url = (
            f"mysql+pymysql://{MYSQL_USER}:{encoded_pwd}@{MYSQL_HOST}:{MYSQL_PORT}/"
            f"{MYSQL_DATABASE}?charset=utf8mb4"
        )
        try:
            _mysql_engine = sa.create_engine(
                url,
                pool_pre_ping=True,
                pool_recycle=3600,
                pool_size=10,
                max_overflow=20,
            )
        except Exception as exc:
            raise RuntimeError(
                f"Failed to create MySQL engine for {MYSQL_HOST}:{MYSQL_PORT}/{MYSQL_DATABASE}: {exc}"
            ) from exc
    return _mysql_engine


def init_db() -> None:
    """
    Initializes MySQL database schema idempotently if tables do not exist.
    Raises RuntimeError if MySQL is unreachable.
    """
    try:
        engine = get_mysql_engine()
        with engine.connect() as conn:
            conn.execute(text("""
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
            """))
            conn.execute(text("""
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
            """))
            conn.commit()
        print(f"[FloodGuard DB] Initialized MySQL database '{MYSQL_DATABASE}' via SQLAlchemy.")
    except Exception as exc:
        raise RuntimeError(
            f"[FloodGuard DB Error] Could not connect to MySQL server at {MYSQL_HOST}:{MYSQL_PORT}/{MYSQL_DATABASE}. "
            f"Ensure MySQL Server 8.0 is running and credentials in .env are correct. Details: {exc}"
        ) from exc


def insert_sensor_reading(
    temperature: float,
    humidity: float,
    rainfall: float,
    water_level: float,
    timestamp: str | None = None,
) -> int:
    """
    Inserts a single sensor reading received from the ESP32 into MySQL.
    """
    if timestamp is None:
        timestamp = datetime.now().isoformat()

    engine = get_mysql_engine()
    insert_stmt = text("""
        INSERT INTO `sensor_readings` (`timestamp`, `temperature`, `humidity`, `rainfall`, `water_level`)
        VALUES (:timestamp, :temperature, :humidity, :rainfall, :water_level);
    """)
    with engine.connect() as conn:
        res = conn.execute(
            insert_stmt,
            {
                "timestamp": str(timestamp),
                "temperature": float(temperature),
                "humidity": float(humidity),
                "rainfall": float(rainfall),
                "water_level": float(water_level),
            },
        )
        conn.commit()
        return int(res.lastrowid)


def insert_prediction(
    latitude: float,
    longitude: float,
    elevation: float,
    rainfall: float,
    temperature: float,
    humidity: float,
    water_level: float,
    prediction: int,
    result: str,
    timestamp: str | None = None,
    model_version: str = "v1",
) -> int:
    """
    Inserts a prediction result including all input features and model output into MySQL.
    """
    if timestamp is None:
        timestamp = datetime.now().isoformat()

    engine = get_mysql_engine()
    insert_stmt = text("""
        INSERT INTO `predictions` (
            `timestamp`, `latitude`, `longitude`, `elevation`,
            `temperature`, `humidity`, `rainfall`, `water_level`,
            `prediction`, `result`, `model_version`
        )
        VALUES (
            :timestamp, :latitude, :longitude, :elevation,
            :temperature, :humidity, :rainfall, :water_level,
            :prediction, :result, :model_version
        );
    """)
    with engine.connect() as conn:
        res = conn.execute(
            insert_stmt,
            {
                "timestamp": str(timestamp),
                "latitude": float(latitude),
                "longitude": float(longitude),
                "elevation": float(elevation),
                "temperature": float(temperature),
                "humidity": float(humidity),
                "rainfall": float(rainfall),
                "water_level": float(water_level),
                "prediction": int(prediction),
                "result": str(result),
                "model_version": str(model_version),
            },
        )
        conn.commit()
        return int(res.lastrowid)


def get_recent_sensor_readings(limit: int = 50) -> list[dict[str, Any]]:
    """
    Retrieves the most recent sensor readings from MySQL, newest first.
    """
    engine = get_mysql_engine()
    select_stmt = text("""
        SELECT `id`, `timestamp`, `temperature`, `humidity`, `rainfall`, `water_level`
        FROM `sensor_readings`
        ORDER BY `id` DESC
        LIMIT :limit;
    """)
    with engine.connect() as conn:
        rows = conn.execute(select_stmt, {"limit": limit}).fetchall()
        return [
            {
                "id": r[0],
                "timestamp": r[1],
                "temperature": r[2],
                "humidity": r[3],
                "rainfall": r[4],
                "water_level": r[5],
            }
            for r in rows
        ]


def get_recent_predictions(limit: int = 50) -> list[dict[str, Any]]:
    """
    Retrieves the most recent predictions from MySQL, newest first.
    Returns records structured identically to the frontend's alertHistory shape.
    """
    engine = get_mysql_engine()
    select_stmt = text("""
        SELECT `id`, `timestamp`, `latitude`, `longitude`, `elevation`,
               `temperature`, `humidity`, `rainfall`, `water_level`,
               `prediction`, `result`, `model_version`
        FROM `predictions`
        ORDER BY `id` DESC
        LIMIT :limit;
    """)
    with engine.connect() as conn:
        rows = conn.execute(select_stmt, {"limit": limit}).fetchall()
        return [
            {
                "id": r[0],
                "timestamp": r[1],
                "prediction": r[9],
                "result": r[10],
                "status": (
                    r[10]
                    if r[10] in ("NO FLOOD", "HIGH FLOOD ALERT")
                    else ("HIGH FLOOD ALERT" if r[9] == 1 else "NO FLOOD")
                ),
                "model_version": r[11],
                "inputs": {
                    "latitude": r[2],
                    "longitude": r[3],
                    "elevation": r[4],
                    "temperature": r[5],
                    "humidity": r[6],
                    "rainfall": r[7],
                    "water_level": r[8],
                },
            }
            for r in rows
        ]


# Initialize schema on module import
init_db()
