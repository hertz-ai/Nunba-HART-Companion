"""agent_ledger.core - Task ledger core types and SmartLedger."""
import enum
import uuid
import threading


class TaskType(enum.Enum):
    CODING = "coding"
    RESEARCH = "research"
    MUSIC = "music"
    ART = "art"
    GENERAL = "general"
    ANALYSIS = "analysis"
    WRITING = "writing"


class TaskStatus(enum.Enum):
    PENDING = "pending"
    CLAIMED = "claimed"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


class ExecutionMode(enum.Enum):
    LOCAL = "local"
    DISTRIBUTED = "distributed"
    HYBRID = "hybrid"


class Task:
    """Represents a unit of work in the agent ledger."""

    def __init__(self, task_id=None, task_type=None, status=None,
                 payload=None, result=None, execution_mode=None, **kwargs):
        self.task_id = task_id or str(uuid.uuid4())
        self.task_type = task_type or TaskType.GENERAL
        self.status = status or TaskStatus.PENDING
        self.payload = payload or {}
        self.result = result
        self.execution_mode = execution_mode or ExecutionMode.LOCAL
        self.metadata = kwargs

    def __repr__(self):
        return (f"Task(id={self.task_id!r}, type={self.task_type}, "
                f"status={self.status})")


class SmartLedger:
    """In-process task ledger for tracking and coordinating agent work."""

    def __init__(self, backend=None, **kwargs):
        self._tasks = {}
        self._lock = threading.Lock()
        self.backend = backend

    def add_task(self, task):
        with self._lock:
            self._tasks[task.task_id] = task
        return task

    def get_task(self, task_id):
        return self._tasks.get(task_id)

    def update_task(self, task_id, **updates):
        with self._lock:
            task = self._tasks.get(task_id)
            if task:
                for k, v in updates.items():
                    if hasattr(task, k):
                        setattr(task, k, v)
        return task

    def list_tasks(self, status=None, task_type=None):
        tasks = list(self._tasks.values())
        if status:
            tasks = [t for t in tasks if t.status == status]
        if task_type:
            tasks = [t for t in tasks if t.task_type == task_type]
        return tasks

    def claim_task(self, task_id, worker_id=None):
        with self._lock:
            task = self._tasks.get(task_id)
            if task and task.status == TaskStatus.PENDING:
                task.status = TaskStatus.CLAIMED
                if worker_id:
                    task.metadata['worker_id'] = worker_id
                return task
        return None

    def complete_task(self, task_id, result=None):
        return self.update_task(task_id, status=TaskStatus.COMPLETED, result=result)

    def fail_task(self, task_id, error=None):
        return self.update_task(task_id, status=TaskStatus.FAILED,
                                result={'error': str(error)})

    def __len__(self):
        return len(self._tasks)
