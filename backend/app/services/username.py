import random

_ADJECTIVES = [
    "Sleepy", "Spicy", "Lazy", "Hungry", "Silent", "Sneaky", "Grumpy",
    "Clumsy", "Witty", "Cheeky", "Dramatic", "Extra", "Sassy", "Fancy",
]

_NOUNS = [
    "BiryaniLover", "LastBenchLegend", "ProxyAttendance", "ChaiwalaNo3",
    "SleepyPanda", "Backbencher", "CopyPasta", "NightOwl", "ChillPill",
    "GhostStudent", "ExamTopper", "AttendanceSaver", "ClassClown",
    "QuietKid", "GroupProjectHero", "WiFiHunter", "CanteenKing",
    "PenBorrower", "LateSubmitter", "DaydreamBeliever",
]

_WHEEL_COLORS = [
    "#3b82f6", "#06b6d4", "#8b5cf6", "#ec4899", "#10b981", "#f59e0b",
]


def generate_username(exclude: set[str] | None = None) -> str:
    """Generate a unique-ish username. Tries adjective+noun combos first,
    then falls back to appending a number if all combos are exhausted."""
    exclude = exclude or set()
    # Shuffle to reduce predictable patterns
    attempts = [
        f"{adj}{noun}"
        for adj in random.sample(_ADJECTIVES, len(_ADJECTIVES))
        for noun in random.sample(_NOUNS, len(_NOUNS))
    ]
    for name in attempts:
        if name not in exclude:
            return name
    # All 280 combos taken (shouldn't happen with ≤20 players) — append number
    base = f"{random.choice(_ADJECTIVES)}{random.choice(_NOUNS)}"
    suffix = 2
    while f"{base}{suffix}" in exclude:
        suffix += 1
    return f"{base}{suffix}"


def pick_color(used_colors: list[str]) -> str:
    available = [c for c in _WHEEL_COLORS if c not in used_colors]
    if available:
        return random.choice(available)
    return random.choice(_WHEEL_COLORS)
