"""Shim for pipecat.utils.run_context (from private Dograh pipecat fork)."""

from contextvars import ContextVar

run_id_var: ContextVar[str | None] = ContextVar("run_id_var", default=None)
_org_id_var: ContextVar[int | None] = ContextVar("_org_id_var", default=None)
turn_var: ContextVar[int] = ContextVar("turn_var", default=0)


def set_current_run_id(run_id: str | int | None) -> None:
    run_id_var.set(str(run_id) if run_id is not None else None)


def set_current_org_id(org_id: int | None) -> None:
    _org_id_var.set(org_id)


def get_current_org_id() -> int | None:
    return _org_id_var.get()
