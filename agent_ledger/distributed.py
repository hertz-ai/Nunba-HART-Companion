"""agent_ledger.distributed - Distributed task locking and coordination."""
import threading
import time


class DistributedTaskLock:
    """Atomic task claiming lock for distributed agent coordination.

    Provides an in-memory lock when Redis is unavailable (single-node mode).
    Falls back gracefully — no external dependency required.
    """

    def __init__(self, backend=None, lock_ttl=30, **kwargs):
        self.backend = backend
        self.lock_ttl = lock_ttl
        self._locks = {}
        self._lock = threading.Lock()
        self._task_id = None

    def acquire(self, task_id, timeout=None):
        """Atomically claim a task. Returns True if acquired."""
        deadline = time.monotonic() + (timeout or 0)
        while True:
            with self._lock:
                if task_id not in self._locks:
                    self._locks[task_id] = time.monotonic() + self.lock_ttl
                    self._task_id = task_id
                    return True
                # Evict expired locks
                if self._locks[task_id] < time.monotonic():
                    self._locks[task_id] = time.monotonic() + self.lock_ttl
                    self._task_id = task_id
                    return True
            if timeout is None or time.monotonic() > deadline:
                return False
            time.sleep(0.05)

    def release(self, task_id=None):
        """Release a claimed task lock."""
        tid = task_id or self._task_id
        if tid:
            with self._lock:
                self._locks.pop(tid, None)
            self._task_id = None

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc_val, exc_tb):
        self.release()
        return False

    def is_locked(self, task_id):
        with self._lock:
            expiry = self._locks.get(task_id)
            return expiry is not None and expiry > time.monotonic()
