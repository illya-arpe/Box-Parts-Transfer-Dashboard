"""Add is_archived column to snapshots table."""
import sys
sys.path.insert(0, ".")

from app.database import engine, Base

if __name__ == "__main__":
    with engine.connect() as conn:
        # SQLite: add column only if it doesn't exist
        result = conn.execute(
            __import__("sqlalchemy").text(
                "SELECT sql FROM sqlite_master WHERE type='table' AND name='snapshots'"
            )
        )
        row = result.fetchone()
        if row and "is_archived" not in (row[0] or ""):
            conn.execute(
                __import__("sqlalchemy").text(
                    "ALTER TABLE snapshots ADD COLUMN is_archived BOOLEAN DEFAULT 0 NOT NULL"
                )
            )
            conn.commit()
            print("Added is_archived column.")
        else:
            print("is_archived column already exists.")
