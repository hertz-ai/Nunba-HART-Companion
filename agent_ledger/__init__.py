"""
agent_ledger - Distributed task ledger for Hevolve Hive agent coordination.

Provides SmartLedger for tracking tasks across regional hosts, with
pluggable backends (Redis for multi-node, in-memory for single-node,
JSON-file for offline/embedded).
"""
from agent_ledger.core import (
    SmartLedger,
    Task,
    TaskType,
    TaskStatus,
    ExecutionMode,
)
from agent_ledger.factory import (
    create_production_ledger,
    get_or_create_ledger,
)


class JSONBackend:
    """Lightweight JSON-file backend for offline / single-node deployments.

    Stores tasks as a JSON file on disk.  Thread-safe via a simple lock.
    Falls back to in-memory dict if the file cannot be written (e.g. read-only
    install directory).
    """

    def __init__(self, path=None):
        import json, threading
        self._path = path
        self._lock = threading.Lock()
        self._store: dict = {}
        if path:
            try:
                import os
                if os.path.exists(path):
                    with open(path, "r", encoding="utf-8") as fh:
                        self._store = json.load(fh)
            except Exception:
                self._store = {}

    # ------------------------------------------------------------------
    # Minimal dict-like interface expected by SmartLedger
    # ------------------------------------------------------------------
    def get(self, key, default=None):
        with self._lock:
            return self._store.get(key, default)

    def set(self, key, value, **_kwargs):
        with self._lock:
            self._store[key] = value
            self._flush()

    def delete(self, key):
        with self._lock:
            self._store.pop(key, None)
            self._flush()

    def keys(self, pattern="*"):
        with self._lock:
            if pattern == "*":
                return list(self._store.keys())
            import fnmatch
            return [k for k in self._store if fnmatch.fnmatch(k, pattern)]

    def exists(self, key):
        with self._lock:
            return key in self._store

    def ping(self):
        return True

    # ------------------------------------------------------------------
    # Redis-compat helpers (no-ops where not applicable)
    # ------------------------------------------------------------------
    def expire(self, key, seconds):
        pass

    def ttl(self, key):
        return -1

    def scan_iter(self, match="*"):
        return iter(self.keys(match))

    def _flush(self):
        if not self._path:
            return
        try:
            import json, os, tempfile
            tmp = self._path + ".tmp"
            with open(tmp, "w", encoding="utf-8") as fh:
                json.dump(self._store, fh, default=str)
            os.replace(tmp, self._path)
        except Exception:
            pass


__all__ = [
    "SmartLedger",
    "Task",
    "TaskType",
    "TaskStatus",
    "ExecutionMode",
    "JSONBackend",
    "create_ledger_from_actions",
    "get_production_backend",
    "create_production_ledger",
    "get_or_create_ledger",
]

__version__ = "0.1.0"


def create_ledger_from_actions(actions, backend=None, **kwargs):
    """Create a SmartLedger pre-populated with tasks derived from actions."""
    ledger = SmartLedger(backend=backend)
    for action in (actions or []):
        if isinstance(action, Task):
            ledger.add_task(action)
        elif isinstance(action, dict):
            task = Task(
                task_id=action.get('task_id'),
                task_type=action.get('task_type', TaskType.GENERAL),
                payload=action.get('payload', action),
            )
            ledger.add_task(task)
    return ledger


def get_production_backend(redis_url=None, **kwargs):
    """Return the best available backend (Redis if reachable, else None).

    Returns None to signal in-memory mode — SmartLedger handles this
    gracefully without raising.
    """
    if redis_url:
        try:
            import redis
            client = redis.from_url(redis_url, socket_connect_timeout=2)
            client.ping()
            return client
        except Exception:
            pass
    return None
