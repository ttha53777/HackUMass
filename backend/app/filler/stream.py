"""The live view: a CDP screencast plus the agent's events, fanned out to viewers.

One `LiveStream` per run. Producers call `publish` (never blocks); each viewer gets
its own bounded queue from `subscribe`. A slow viewer loses old frames, never the
events: when its queue is full, the oldest frame in it is dropped to make room. A
viewer that joins late first receives the latest frame and status, so it never
starts on a blank screen.

Events (JSON objects, each with a "type"):
  frame   {data: base64 JPEG, width, height}
  cursor  {x, y, kind: "move" | "click"}       viewport pixels
  step    {caption, field_key?}                 never a typed value
  status  {status, message?}
  end     {}                                    the stream is over

Frames are never written to disk or logged.
"""

from __future__ import annotations

import asyncio
import logging
import time
from collections import deque
from typing import Any

from app.filler.config import SCREENCAST_QUALITY, VIEWPORT_HEIGHT, VIEWPORT_WIDTH
from app.services.log_safety import describe_exception

logger = logging.getLogger(__name__)

QUEUE_SIZE = 64
FPS_WINDOW_SECONDS = 2.0


class LiveStream:
    def __init__(self) -> None:
        self._queues: set[asyncio.Queue[dict[str, Any] | None]] = set()
        self._last_frame: dict[str, Any] | None = None
        self._last_status: dict[str, Any] | None = None
        self._frame_times: deque[float] = deque(maxlen=600)
        self.frames = 0
        self.closed = False
        self._cdp: Any = None

    # -- viewers ---------------------------------------------------------------

    def subscribe(self) -> asyncio.Queue[dict[str, Any] | None]:
        queue: asyncio.Queue[dict[str, Any] | None] = asyncio.Queue(maxsize=QUEUE_SIZE)
        for event in (self._last_status, self._last_frame):
            if event is not None:
                queue.put_nowait(event)
        if self.closed:
            queue.put_nowait({"type": "end"})
            queue.put_nowait(None)
        self._queues.add(queue)
        return queue

    def unsubscribe(self, queue: asyncio.Queue[dict[str, Any] | None]) -> None:
        self._queues.discard(queue)

    @property
    def viewers(self) -> int:
        return len(self._queues)

    # -- producers -------------------------------------------------------------

    def publish(self, event: dict[str, Any]) -> None:
        if self.closed:
            return
        kind = event.get("type")
        if kind == "frame":
            self._last_frame = event
            self.frames += 1
            self._frame_times.append(time.monotonic())
        elif kind == "status":
            self._last_status = event
        for queue in self._queues:
            _offer(queue, event)

    def cursor(self, x: int, y: int, kind: str = "move") -> None:
        self.publish({"type": "cursor", "x": x, "y": y, "kind": kind})

    def step(self, caption: str, field_key: str | None = None) -> None:
        event: dict[str, Any] = {"type": "step", "caption": caption}
        if field_key:
            event["field_key"] = field_key
        self.publish(event)

    def status(self, status: str, message: str | None = None) -> None:
        event: dict[str, Any] = {"type": "status", "status": status}
        if message:
            event["message"] = message
        self.publish(event)

    def fps(self, window: float = FPS_WINDOW_SECONDS, now: float | None = None) -> float:
        """Frames per second over the last `window` seconds."""
        now = time.monotonic() if now is None else now
        recent = [t for t in self._frame_times if now - t <= window]
        return len(recent) / window

    def peak_fps(self, window: float = FPS_WINDOW_SECONDS) -> float:
        """Best `fps` over any window so far: the rate while the page was changing."""
        times = list(self._frame_times)
        best = 0
        start = 0
        for end, t in enumerate(times):
            while t - times[start] > window:
                start += 1
            best = max(best, end - start + 1)
        return best / window

    # -- screencast ------------------------------------------------------------

    async def start_screencast(self, page: Any) -> None:
        """Push the page's frames into this stream (Chromium's Page.startScreencast).

        Chromium sends a frame only when the page repaints, and waits for an ack
        before the next one, so a still page costs nothing.
        """
        cdp = await page.context.new_cdp_session(page)
        self._cdp = cdp

        def on_frame(params: dict[str, Any]) -> None:
            meta = params.get("metadata") or {}
            self.publish({
                "type": "frame",
                "data": params["data"],
                "width": int(meta.get("deviceWidth") or VIEWPORT_WIDTH),
                "height": int(meta.get("deviceHeight") or VIEWPORT_HEIGHT),
            })
            asyncio.ensure_future(_ack(cdp, params["sessionId"]))

        cdp.on("Page.screencastFrame", on_frame)
        await cdp.send("Page.startScreencast", {
            "format": "jpeg",
            "quality": SCREENCAST_QUALITY,
            "maxWidth": VIEWPORT_WIDTH,
            "maxHeight": VIEWPORT_HEIGHT,
            "everyNthFrame": 1,
        })

    async def stop_screencast(self) -> None:
        cdp, self._cdp = self._cdp, None
        if cdp is None:
            return
        try:
            await cdp.send("Page.stopScreencast")
            await cdp.detach()
        except Exception as exc:  # the browser may already be gone
            logger.info("screencast stop: %s", exc.__class__.__name__)

    async def close(self) -> None:
        await self.stop_screencast()
        if self.closed:
            return
        self.publish({"type": "end"})
        self.closed = True
        for queue in self._queues:
            _offer(queue, None)


def _offer(queue: asyncio.Queue[dict[str, Any] | None], event: dict[str, Any] | None) -> None:
    """Put without blocking. When full, drop the oldest frame (else the oldest event)."""
    if queue.full():
        items = []
        while not queue.empty():
            items.append(queue.get_nowait())
        for i, item in enumerate(items):
            if item is not None and item.get("type") == "frame":
                del items[i]
                break
        else:
            items.pop(0)
        for item in items:
            queue.put_nowait(item)
    queue.put_nowait(event)


async def _ack(cdp: Any, session_id: int) -> None:
    try:
        await cdp.send("Page.screencastFrameAck", {"sessionId": session_id})
    except Exception as exc:
        logger.debug("screencast ack failed: %s", describe_exception(exc))
