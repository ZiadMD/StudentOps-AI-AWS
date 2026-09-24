"""
In-Memory Sliding-Window Rate Limiter for StudentOps AI Backend.
Provides granular per-IP and per-user request throttling against brute force, DoS, and AI API abuse.
"""
import time
import asyncio
from collections import defaultdict
from typing import Optional, Callable
from fastapi import Request, HTTPException, status


class SlidingWindowRateLimiter:
    """
    Sliding window log rate limiter with in-memory timestamp tracking.
    Thread-safe and async-safe using asyncio.Lock.
    """

    def __init__(self, cleanup_interval_seconds: int = 300):
        # key -> list of timestamp floats
        self._records: dict[str, list[float]] = defaultdict(list)
        self._lock = asyncio.Lock()
        self._last_cleanup = time.time()
        self._cleanup_interval = cleanup_interval_seconds

    async def is_allowed(
        self,
        key: str,
        max_requests: int,
        window_seconds: int
    ) -> tuple[bool, int]:
        """
        Check if a request is allowed under the rate limit.
        Returns:
            (allowed: bool, retry_after_seconds: int)
        """
        now = time.time()

        async with self._lock:
            # Periodic cleanup of expired entries across all keys
            if now - self._last_cleanup > self._cleanup_interval:
                self._cleanup(now)

            timestamps = self._records[key]
            cutoff = now - window_seconds

            # Remove timestamps outside the sliding window
            valid_timestamps = [ts for ts in timestamps if ts > cutoff]
            self._records[key] = valid_timestamps

            if len(valid_timestamps) >= max_requests:
                # Rate limit exceeded: calculate retry-after based on oldest timestamp in window
                oldest_in_window = valid_timestamps[0]
                retry_after = max(1, int(window_seconds - (now - oldest_in_window)))
                return False, retry_after

            # Record this request
            self._records[key].append(now)
            return True, 0

    def _cleanup(self, now: float):
        """Purge empty or completely expired rate limit records."""
        keys_to_delete = []
        max_window = 3600  # 1 hour max retention for inactive keys
        cutoff = now - max_window

        for key, timestamps in list(self._records.items()):
            active = [ts for ts in timestamps if ts > cutoff]
            if not active:
                keys_to_delete.append(key)
            else:
                self._records[key] = active

        for key in keys_to_delete:
            self._records.pop(key, None)

        self._last_cleanup = now

    def reset(self):
        """Clear all rate limit records (useful for test isolation)."""
        self._records.clear()
        self._last_cleanup = time.time()


# Global limiter instance
limiter = SlidingWindowRateLimiter()


def get_client_ip(request: Request) -> str:
    """
    Extract client IP safely from request.
    Does not trust spoofable X-Forwarded-For unless specifically configured.
    """
    if request.client:
        return request.client.host
    return "unknown_client"


def create_rate_limit_dependency(
    max_requests: int,
    window_seconds: int,
    key_prefix: str = "general"
) -> Callable:
    """
    Factory creating a FastAPI dependency for route-level rate limiting.
    """
    async def dependency(request: Request):
        client_ip = get_client_ip(request)
        rate_key = f"{key_prefix}:{client_ip}"
        
        allowed, retry_after = await limiter.is_allowed(
            key=rate_key,
            max_requests=max_requests,
            window_seconds=window_seconds
        )

        if not allowed:
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail=f"Too many requests. Please try again in {retry_after} second(s).",
                headers={"Retry-After": str(retry_after)}
            )

    return dependency
