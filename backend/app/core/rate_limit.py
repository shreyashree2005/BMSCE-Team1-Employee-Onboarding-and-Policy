"""In-memory limiter for failed login attempts (per process).

Good enough for a single API instance; multiple instances would need a shared store (e.g. Redis).
"""

import threading
import time
from collections import defaultdict, deque


class LoginAttemptLimiter:
    def __init__(self, max_failures: int, window_seconds: int) -> None:
        self._max = max_failures
        self._window = window_seconds
        self._failures: dict[str, deque[float]] = defaultdict(deque)
        self._lock = threading.Lock()

    def _prune(self, key: str, now: float) -> deque[float]:
        attempts = self._failures[key]
        while attempts and now - attempts[0] > self._window:
            attempts.popleft()
        return attempts

    def retry_after(self, key: str) -> int:
        """Seconds until another attempt is allowed (0 if allowed now)."""
        now = time.monotonic()
        with self._lock:
            attempts = self._prune(key, now)
            if len(attempts) < self._max:
                return 0
            return max(1, int(self._window - (now - attempts[0])) + 1)

    def record_failure(self, key: str) -> None:
        with self._lock:
            self._failures[key].append(time.monotonic())

    def reset(self, key: str) -> None:
        with self._lock:
            self._failures.pop(key, None)
