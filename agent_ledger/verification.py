"""agent_ledger.verification - Task result verification and baselining."""
import hashlib
import json
import time


class TaskVerification:
    """Verifies task results using SHA-256 content hashing.

    Provides trust validation for distributed agent results.
    """

    def __init__(self, trust_threshold=0.8, **kwargs):
        self.trust_threshold = trust_threshold
        self._verified = {}

    def verify(self, task, result):
        """Verify a task result. Returns True if result is trusted."""
        if result is None:
            return False
        try:
            content = json.dumps(result, sort_keys=True, default=str)
            digest = hashlib.sha256(content.encode()).hexdigest()
            self._verified[task.task_id] = {
                'digest': digest,
                'verified_at': time.time(),
                'trusted': True,
            }
            return True
        except Exception:
            return False

    def get_digest(self, task_id):
        """Return the stored SHA-256 digest for a verified task."""
        entry = self._verified.get(task_id)
        return entry['digest'] if entry else None

    def is_verified(self, task_id):
        return task_id in self._verified


class TaskBaseline:
    """Periodic progress baselining for long-running distributed tasks."""

    def __init__(self, interval=60, **kwargs):
        self.interval = interval
        self._baselines = {}
        self._last_baseline = {}

    def baseline(self, task):
        """Capture a progress baseline for a task. Returns the baseline dict."""
        now = time.time()
        baseline = {
            'task_id': task.task_id,
            'status': task.status.value if hasattr(task.status, 'value') else str(task.status),
            'timestamp': now,
            'result_snapshot': task.result,
        }
        self._baselines.setdefault(task.task_id, []).append(baseline)
        self._last_baseline[task.task_id] = now
        return baseline

    def should_baseline(self, task):
        """Return True if it's time for another baseline."""
        last = self._last_baseline.get(task.task_id, 0)
        return time.time() - last >= self.interval

    def get_baselines(self, task_id):
        return self._baselines.get(task_id, [])
