"""
Weighted player selection for the spin mechanic.
- Players who haven't had a turn get highest weight.
- Recent turn = lowest weight.
- Player blocked for 2-3 spins after their turn.
"""
import random
from datetime import datetime, timezone


def select_next_player(
    players: list[dict],
    excluded_ids: set[str],
) -> str | None:
    """
    players: list of dicts with keys: id, turn_count, last_turn_at (ISO str or None)
    excluded_ids: player IDs that cannot be selected (banned, blacked out, etc.)
    Returns player id or None if no eligible players.
    """
    eligible = [p for p in players if p["id"] not in excluded_ids and not p.get("is_banned")]
    if not eligible:
        return None

    now = datetime.now(timezone.utc)
    weights = []
    for p in eligible:
        if p["turn_count"] == 0:
            weight = 10.0
        else:
            last_turn = p.get("last_turn_at")
            if last_turn:
                if isinstance(last_turn, str):
                    last_turn = datetime.fromisoformat(last_turn)
                minutes_since = (now - last_turn).total_seconds() / 60
                weight = min(10.0, max(1.0, minutes_since / 5))
            else:
                weight = 5.0
        weights.append(weight)

    total = sum(weights)
    r = random.uniform(0, total)
    cumulative = 0.0
    for player, weight in zip(eligible, weights):
        cumulative += weight
        if r <= cumulative:
            return player["id"]

    return eligible[-1]["id"]
