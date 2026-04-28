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


def generate_username() -> str:
    return random.choice(_NOUNS)


def pick_color(used_colors: list[str]) -> str:
    available = [c for c in _WHEEL_COLORS if c not in used_colors]
    if available:
        return random.choice(available)
    return random.choice(_WHEEL_COLORS)
