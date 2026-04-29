"""
Per-room asyncio timers that auto-advance game phases.
One active timer per room at any time.
"""
import asyncio
import logging
from collections.abc import Awaitable, Callable

logger = logging.getLogger(__name__)


class PhaseTimer:
    def __init__(self) -> None:
        self._tasks: dict[str, asyncio.Task] = {}

    def schedule(
        self,
        room_code: str,
        delay_seconds: float,
        callback: Callable[[], Awaitable[None]],
    ) -> None:
        """Cancel any existing timer for the room and schedule a new one."""
        self.cancel(room_code)
        self._tasks[room_code] = asyncio.create_task(
            self._run(room_code, delay_seconds, callback)
        )

    def cancel(self, room_code: str) -> None:
        task = self._tasks.pop(room_code, None)
        if task and not task.done():
            task.cancel()

    def cancel_all(self) -> None:
        for task in self._tasks.values():
            if not task.done():
                task.cancel()
        self._tasks.clear()

    async def _run(
        self,
        room_code: str,
        delay_seconds: float,
        callback: Callable[[], Awaitable[None]],
    ) -> None:
        try:
            await asyncio.sleep(delay_seconds)
            self._tasks.pop(room_code, None)
            await callback()
        except asyncio.CancelledError:
            pass
        except Exception:
            logger.exception("Phase timer callback failed for room %s", room_code)


# Global singleton used by game engine and routes
phase_timer = PhaseTimer()


# Phase durations in seconds
PHASE_DURATIONS: dict[str, float] = {
    "spinning": 4,
    "choice": 30,
    "truth_question": 5,
    "truth_answer": 120,
    "dare_show": 5,
    "dare_vote": 60,
    "reaction": 60,
    "punishment_vote": 30,
    "identity_reveal": 10,
}
