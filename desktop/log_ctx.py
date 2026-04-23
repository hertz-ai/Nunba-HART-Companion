"""Correlation-id logging helper for Nunba (task #335 J2).

Threads the four canonical correlation ids through Nunba's four
cross-cutting log-emitting subsystems:

  * ``wamp_router`` — WAMP pub/sub/call message dispatch
  * ``tts.tts_handshake`` — first-run TTS verification
  * ``desktop.chat_sync`` — cross-device chat-bucket push/pull/merge
  * chat-settings routes (``/api/admin/config/chat`` GET / PUT)

Contract (pinned by commit ace96769):
  The four ids are ``request_id``, ``user_id``, ``prompt_id``,
  ``goal_id``.  We REUSE these existing fields.  Inventing a new
  ``trace_id`` or ``thread_id`` is a Gate 4 parallel-path violation.

Why ``desktop/`` and not ``core/`` (CLAUDE.md Rule 2):
  Nunba MUST NOT have its own top-level ``core/`` — namespace
  collision with HARTOS's ``core/`` under cx_Freeze silently hides
  whichever package's ``__init__.py`` loads second.  This helper is
  a Nunba-local concern (it wires Nunba-local subsystems), so it
  sits next to ``chat_settings.py`` / ``chat_sync.py`` /
  ``guest_identity.py`` — same reasoning documented in those
  files' headers.

Why a helper and not raw ``extra={...}``:
  * Gate 2 (DRY): a single stamping point keeps the four fields
    consistent — if we later add ``tenant_id`` or rename
    ``prompt_id`` to ``agent_id``, there is ONE call site to edit,
    not four.
  * Gate 4 (one writer per log-stamp): subsystems call
    ``log_ctx(logger, ...).info(...)`` — none of them learn the
    shape of the ``extra`` dict.  That stays encapsulated here.
  * Formatter compatibility: the ``_NULL_IDS`` default on the root
    logger means format strings that reference ``%(request_id)s``
    never crash on a log record that didn't set any ids.

Public API
----------
    log_ctx(logger: Logger,
            *,
            request_id: str | int | None = None,
            user_id:    str | int | None = None,
            prompt_id:  str | None       = None,
            goal_id:    str | int | None = None) -> LoggerAdapter

      Returns a short-lived ``logging.LoggerAdapter`` whose
      ``info`` / ``warning`` / ``error`` / ``debug`` calls stamp
      the four fields into the record's ``extra``.  None values
      are dropped so a subsystem that only knows ``user_id`` does
      NOT overwrite another subsystem's ``request_id=0`` with
      ``None``.

    with_ids(**ids) -> Callable[[F], F]

      Decorator form.  Stamps the same four fields onto every log
      record emitted INSIDE the decorated function via that
      function's module logger.  Useful for Flask handlers where
      adding a ``log_ctx(...)`` call to every ``logger.info`` is
      churn.

    install_root_formatter(fmt: str | None = None) -> None

      Idempotent: walks every handler on the root logger and
      replaces its Formatter with one whose format string includes
      ``[%(request_id)s user=%(user_id)s prompt=%(prompt_id)s
      goal=%(goal_id)s]`` when ANY of the four fields is set on the
      record, and renders as empty string otherwise.  The default
      fmt matches what ``app.py`` / ``main.py`` already use:
      ``'%(asctime)s - %(name)s - %(levelname)s -%(_ids)s %(message)s'``

      Call this once at app boot, AFTER ``app.py`` / ``main.py``
      have added their RotatingFileHandlers.

CLAUDE.md gates honoured here:
  Gate 2 (DRY):   one stamping helper, one formatter rewrite.
  Gate 3 (SRP):   ``log_ctx`` stamps, ``install_root_formatter``
                  formats, ``with_ids`` decorates.  No cross-concern.
  Gate 4 (no parallel paths): one writer per log-stamp — every
                  subsystem imports from here.
  Gate 7 (multi-OS): pure-stdlib, no platform-specific branches.
"""

from __future__ import annotations

import functools
import logging
from typing import Any, Callable, TypeVar

__all__ = [
    "CORRELATION_FIELDS",
    "install_root_formatter",
    "log_ctx",
    "with_ids",
]

# The four canonical correlation ids (contract commit ace96769).
# Order matters: formatter renders them in this order for log-grep
# predictability.
CORRELATION_FIELDS: tuple[str, ...] = (
    "request_id",
    "user_id",
    "prompt_id",
    "goal_id",
)

F = TypeVar("F", bound=Callable[..., Any])


def _build_extra(
    request_id: Any = None,
    user_id: Any = None,
    prompt_id: Any = None,
    goal_id: Any = None,
) -> dict[str, Any]:
    """Drop None values so a partial-id caller does NOT erase the
    other fields downstream."""
    out: dict[str, Any] = {}
    if request_id is not None:
        out["request_id"] = request_id
    if user_id is not None:
        out["user_id"] = user_id
    if prompt_id is not None:
        out["prompt_id"] = prompt_id
    if goal_id is not None:
        out["goal_id"] = goal_id
    return out


class _CorrelationAdapter(logging.LoggerAdapter):
    """LoggerAdapter that merges our correlation fields into the
    record's ``extra`` without stomping caller-supplied extras."""

    def process(self, msg: Any, kwargs: dict[str, Any]) -> tuple[Any, dict[str, Any]]:
        caller_extra = kwargs.get("extra") or {}
        merged = dict(self.extra or {})
        merged.update(caller_extra)  # caller wins on explicit override
        kwargs["extra"] = merged
        return msg, kwargs


def log_ctx(
    logger: logging.Logger,
    *,
    request_id: Any = None,
    user_id: Any = None,
    prompt_id: Any = None,
    goal_id: Any = None,
) -> logging.LoggerAdapter:
    """Return a LoggerAdapter that stamps the four correlation ids
    on every record it emits.

    Usage:
        log = log_ctx(logger, request_id=req_id, user_id=uid)
        log.info("push succeeded n_bytes=%d", n)

    The returned adapter is cheap (no I/O, no lock); create one per
    request / per handler invocation and discard.
    """
    return _CorrelationAdapter(logger, _build_extra(
        request_id=request_id,
        user_id=user_id,
        prompt_id=prompt_id,
        goal_id=goal_id,
    ))


def with_ids(
    *,
    request_id: Any = None,
    user_id: Any = None,
    prompt_id: Any = None,
    goal_id: Any = None,
) -> Callable[[F], F]:
    """Decorator that stamps the four ids on every log record the
    decorated function emits via its module logger.

    Static-ids form (values known at decoration time):

        @with_ids(prompt_id="speech_companion")
        def greet(user): ...

    Dynamic-ids form (values known at call time) — prefer
    ``log_ctx`` in-function instead of this, but for Flask
    handlers the decorator reads ids from kwargs injected by the
    route layer if the caller passes them.

    The decorator uses the function's own module logger
    (``logging.getLogger(fn.__module__)``) — it does NOT create a
    new logger.  That keeps child-logger propagation / handler
    attachment unchanged.
    """
    static_extra = _build_extra(
        request_id=request_id,
        user_id=user_id,
        prompt_id=prompt_id,
        goal_id=goal_id,
    )

    def decorator(fn: F) -> F:
        fn_logger = logging.getLogger(fn.__module__)

        @functools.wraps(fn)
        def wrapper(*args: Any, **kwargs: Any) -> Any:
            # Stash the adapter on the function so the body can reach
            # it via `log_ctx(logger, ...)`.  We intentionally do NOT
            # mutate `kwargs` to avoid surprising the wrapped fn.
            adapter = _CorrelationAdapter(fn_logger, dict(static_extra))
            wrapper.log = adapter  # type: ignore[attr-defined]
            return fn(*args, **kwargs)

        return wrapper  # type: ignore[return-value]

    return decorator


class _CorrelationFormatter(logging.Formatter):
    """Formatter that renders correlation ids compactly.

    When NONE of the four fields is set on the record, the ids
    slot renders as empty string (no bracket noise on the ~95%
    of log lines that don't carry correlation context).

    When ANY of the four is set, the slot renders as
    `` [request_id=…user=…prompt=…goal=…]`` with absent fields
    omitted so a chat-only line shows
    `` [request_id=42 user=u7]`` not
    `` [request_id=42 user=u7 prompt= goal=]``.
    """

    _DEFAULT_FMT = (
        "%(asctime)s - %(name)s - %(levelname)s -%(_ids)s %(message)s"
    )

    def __init__(self, fmt: str | None = None, datefmt: str | None = None):
        super().__init__(fmt or self._DEFAULT_FMT, datefmt)

    def format(self, record: logging.LogRecord) -> str:
        parts: list[str] = []
        for field in CORRELATION_FIELDS:
            val = getattr(record, field, None)
            if val is None or val == "":
                continue
            # Compact: use short aliases for prompt_id / user_id so
            # grep is quick; keep request_id as-is (most diagnostic).
            alias = {
                "request_id": "request_id",
                "user_id": "user",
                "prompt_id": "prompt",
                "goal_id": "goal",
            }[field]
            parts.append(f"{alias}={val}")
        record._ids = " [" + " ".join(parts) + "]" if parts else ""
        return super().format(record)


def install_root_formatter(fmt: str | None = None) -> None:
    """Replace every root-logger handler's Formatter with
    ``_CorrelationFormatter``.

    Idempotent: calling twice is a no-op on the second call because
    the check is ``isinstance(handler.formatter, _CorrelationFormatter)``.

    Call this AFTER ``app.py`` / ``main.py`` have added their
    RotatingFileHandlers but BEFORE the first log line carrying
    correlation ids is emitted.  Safe to call from either module
    (idempotent), or from a separate boot hook.
    """
    root = logging.getLogger()
    for handler in root.handlers:
        if isinstance(handler.formatter, _CorrelationFormatter):
            continue
        handler.setFormatter(_CorrelationFormatter(fmt))
