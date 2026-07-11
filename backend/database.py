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
                created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            )
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