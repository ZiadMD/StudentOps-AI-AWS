"""Timezone normalization helpers for persisted and external timestamps."""
from datetime import datetime, timezone


def as_utc(value: datetime) -> datetime:
    """Normalize a timestamp to aware UTC, treating SQLite-naive values as UTC."""
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)
