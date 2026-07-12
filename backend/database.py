import json
import sqlite3
from pathlib import Path
from typing import Any

BASE_DIR = Path(__file__).resolve().parent
DB_PATH = BASE_DIR / "echovault.db"


def get_connection() -> sqlite3.Connection:
    connection = sqlite3.connect(DB_PATH)
    connection.row_factory = sqlite3.Row
    return connection


def init_db() -> None:
    with get_connection() as connection:
        connection.execute(
            """
            CREATE TABLE IF NOT EXISTS meetings (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                title TEXT NOT NULL,
                filename TEXT NOT NULL,
                transcript TEXT NOT NULL,
                language TEXT,
                model TEXT,
                processing_seconds REAL,
                summary TEXT,
                key_decisions TEXT,
                action_items TEXT,
                topics TEXT,
                analysis_model TEXT,
                analysis_seconds REAL,
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
            """
        )

        # Add new columns to databases created before analysis was added.
        existing_columns = {
            row["name"]
            for row in connection.execute(
                "PRAGMA table_info(meetings)"
            ).fetchall()
        }

        new_columns = {
            "summary": "TEXT",
            "key_decisions": "TEXT",
            "action_items": "TEXT",
            "topics": "TEXT",
            "analysis_model": "TEXT",
            "analysis_seconds": "REAL",
        }

        for column_name, column_type in new_columns.items():
            if column_name not in existing_columns:
                connection.execute(
                    f"""
                    ALTER TABLE meetings
                    ADD COLUMN {column_name} {column_type}
                    """
                )

        connection.commit()

def create_meeting_record(
    title: str,
    filename: str,
    transcript: str,
    language: str | None,
    model: str | None,
    processing_seconds: float | None,
) -> dict[str, Any]:
    with get_connection() as connection:
        cursor = connection.execute(
            """
            INSERT INTO meetings (
                title,
                filename,
                transcript,
                language,
                model,
                processing_seconds
            )
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (
                title,
                filename,
                transcript,
                language,
                model,
                processing_seconds,
            ),
        )

        connection.commit()
        meeting_id = cursor.lastrowid

    return get_meeting_record(meeting_id)


def list_meeting_records() -> list[dict[str, Any]]:
    with get_connection() as connection:
        rows = connection.execute(
            """
            SELECT *
            FROM meetings
            ORDER BY created_at DESC, id DESC
            """
        ).fetchall()

    return [dict(row) for row in rows]


def get_meeting_record(meeting_id: int) -> dict[str, Any] | None:
    with get_connection() as connection:
        row = connection.execute(
            """
            SELECT *
            FROM meetings
            WHERE id = ?
            """,
            (meeting_id,),
        ).fetchone()

    return dict(row) if row else None


def delete_meeting_record(meeting_id: int) -> bool:
    with get_connection() as connection:
        cursor = connection.execute(
            """
            DELETE FROM meetings
            WHERE id = ?
            """,
            (meeting_id,),
        )

        connection.commit()

    return cursor.rowcount > 0
def save_meeting_analysis(
    meeting_id: int,
    summary: str,
    key_decisions: list[str],
    action_items: list[dict[str, Any]],
    topics: list[str],
    analysis_model: str,
    analysis_seconds: float,
) -> dict[str, Any] | None:
    with get_connection() as connection:
        connection.execute(
            """
            UPDATE meetings
            SET
                summary = ?,
                key_decisions = ?,
                action_items = ?,
                topics = ?,
                analysis_model = ?,
                analysis_seconds = ?
            WHERE id = ?
            """,
            (
                summary,
                json.dumps(
                    key_decisions,
                    ensure_ascii=False,
                ),
                json.dumps(
                    action_items,
                    ensure_ascii=False,
                ),
                json.dumps(
                    topics,
                    ensure_ascii=False,
                ),
                analysis_model,
                analysis_seconds,
                meeting_id,
            ),
        )

        connection.commit()

    return get_meeting_record(meeting_id)