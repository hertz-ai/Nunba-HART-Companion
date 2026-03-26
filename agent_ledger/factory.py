"""agent_ledger.factory - Factory functions for creating SmartLedger instances."""
from agent_ledger.core import SmartLedger

_ledger_registry = {}


def create_production_ledger(ledger_id=None, backend=None, **kwargs):
    """Create a new SmartLedger configured for production use."""
    ledger = SmartLedger(backend=backend, **kwargs)
    if ledger_id:
        _ledger_registry[ledger_id] = ledger
    return ledger


def get_or_create_ledger(ledger_id=None, backend=None, **kwargs):
    """Return an existing ledger by ID, or create a new one."""
    if ledger_id and ledger_id in _ledger_registry:
        return _ledger_registry[ledger_id]
    return create_production_ledger(ledger_id=ledger_id, backend=backend, **kwargs)


def list_ledgers():
    """Return all registered ledger IDs."""
    return list(_ledger_registry.keys())


def clear_ledgers():
    """Remove all registered ledgers (for testing)."""
    _ledger_registry.clear()
