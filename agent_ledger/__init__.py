"""
agent_ledger - Distributed task ledger for Hevolve Hive agent coordination.

Provides SmartLedger for tracking tasks across regional hosts, with
pluggable backends (Redis for multi-node, in-memory for single-node).
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

__all__ = [
    "SmartLedger",
    "Task",
    "TaskType",
    "TaskStatus",
    "ExecutionMode",
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
