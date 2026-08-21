"""
Small in-memory sliding-window rate limiter.

This is intentionally simple and process-local: it's a single uvicorn
process with the SSH listener embedded in it (see run.py), so a plain
dict + lock is sufficient. If this app is ever run as multiple worker
processes behind a load balancer, swap this for a shared store (e.g.
Redis) keyed the same way — the call sites don't need to change.
"""

import threading
import time
from collections import defaultdict, deque

from . import config


class RateLimiter:
    def __init__(self, max_requests: int, window_seconds: float):
        self.max_requests = max_requests
        self.window_seconds = window_seconds
        self._hits: dict[str, deque] = defaultdict(deque)
        self._lock = threading.Lock()

    def allow(self, key: str) -> bool:
        """Record one attempt for `key` and return whether it's within the
        limit. Rejected attempts are NOT counted against future windows —
        i.e. hammering the limiter doesn't itself do anything special, it
        just keeps getting rejected until the window rolls off."""
        now = time.monotonic()
        with self._lock:
            hits = self._hits[key]
            cutoff = now - self.window_seconds
            while hits and hits[0] < cutoff:
                hits.popleft()
            if len(hits) >= self.max_requests:
                return False
            hits.append(now)
            return True

    def reset(self, key: str | None = None) -> None:
        """Testing helper."""
        with self._lock:
            if key is None:
                self._hits.clear()
            else:
                self._hits.pop(key, None)


login_per_ip = RateLimiter(*config.RATE_LIMIT_LOGIN_PER_IP)
register_per_ip = RateLimiter(*config.RATE_LIMIT_REGISTER_PER_IP)
file_write_per_user = RateLimiter(*config.RATE_LIMIT_FILE_WRITE_PER_USER)
suggestion_per_user = RateLimiter(*config.RATE_LIMIT_SUGGESTION_PER_USER)
file_create_per_user = RateLimiter(*config.RATE_LIMIT_FILE_CREATE_PER_USER)
