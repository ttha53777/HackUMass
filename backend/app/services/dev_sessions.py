"""Dev-only: keep sessions across backend restarts.

Off unless `DEV_SESSION_FILE` names a file (the local launcher sets it). Then the
in-memory checkpointer is written to that file after every change and read back
at startup, so a restart doesn't send you back through the intake and the bank
step. The file holds answers, so it is git-ignored and must never be enabled on
a shared or deployed server.

Plain JSON with tagged bytes and tuples, never pickle, so loading the file can't
run code. Checkpoint payloads inside it are still decoded by the checkpointer's
own allow-listed serializer.
"""

from __future__ import annotations

import base64
import json
import logging
import os
from collections import defaultdict
from pathlib import Path
from typing import Any

from langgraph.checkpoint.memory import InMemorySaver

from app.services.log_safety import describe_exception

logger = logging.getLogger(__name__)

ENV_VAR = "DEV_SESSION_FILE"
VERSION = 1


def session_file() -> Path | None:
    value = (os.environ.get(ENV_VAR) or "").strip()
    return Path(value) if value else None


def _enc(value: Any) -> Any:
    if isinstance(value, bytes):
        return {"$b": base64.b64encode(value).decode("ascii")}
    if isinstance(value, tuple):
        return {"$t": [_enc(v) for v in value]}
    if isinstance(value, dict):
        # Keys may be tuples, so a dict is stored as a list of pairs.
        return {"$d": [[_enc(k), _enc(v)] for k, v in value.items()]}
    if isinstance(value, list):
        return [_enc(v) for v in value]
    return value


def _dec(value: Any) -> Any:
    if isinstance(value, dict):
        if "$b" in value:
            return base64.b64decode(value["$b"])
        if "$t" in value:
            return tuple(_dec(v) for v in value["$t"])
        if "$d" in value:
            return {_hashable(_dec(k)): _dec(v) for k, v in value["$d"]}
    if isinstance(value, list):
        return [_dec(v) for v in value]
    return value


def _hashable(key: Any) -> Any:
    return tuple(_hashable(k) for k in key) if isinstance(key, (list, tuple)) else key


def save(checkpointer: InMemorySaver, path: Path) -> None:
    """Write every session to `path` (atomically). Never raises."""
    try:
        data = {
            "version": VERSION,
            "storage": _enc({t: {ns: dict(cps) for ns, cps in by_ns.items()} for t, by_ns in checkpointer.storage.items()}),
            "writes": _enc(dict(checkpointer.writes)),
            "blobs": _enc(dict(checkpointer.blobs)),
        }
        path.parent.mkdir(parents=True, exist_ok=True)
        tmp = path.with_suffix(path.suffix + ".tmp")
        tmp.write_text(json.dumps(data))
        os.chmod(tmp, 0o600)
        tmp.replace(path)
    except Exception as exc:  # persistence is a convenience; never break a run
        logger.warning("dev sessions not saved: %s", describe_exception(exc))


def load(checkpointer: InMemorySaver, path: Path) -> list[str]:
    """Restore sessions from `path` into `checkpointer`. Returns their ids."""
    if not path.exists():
        return []
    try:
        data = json.loads(path.read_text())
        if data.get("version") != VERSION:
            return []
        storage = _dec(data["storage"])
        for thread_id, by_ns in storage.items():
            for ns, checkpoints in by_ns.items():
                checkpointer.storage[thread_id][ns].update(checkpoints)
        checkpointer.writes.update(_dec(data["writes"]))
        checkpointer.blobs.update(_dec(data["blobs"]))
        return list(storage)
    except Exception as exc:
        logger.warning("dev sessions not loaded: %s", describe_exception(exc))
        checkpointer.storage = defaultdict(lambda: defaultdict(dict))
        checkpointer.writes = defaultdict(dict)
        checkpointer.blobs = defaultdict()
        return []
