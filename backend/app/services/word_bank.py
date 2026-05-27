import random

WORDS = {
    "college": [
        "proxy", "backbencher", "bunk", "assignment", "viva", "lab coat", "semester",
        "CGPA", "attendance", "library", "canteen", "placement", "internship",
        "hostel", "ragging", "farewell", "freshers", "topper", "mass bunk",
        "last bench", "first bench", "photocopy", "notes", "practical",
    ],
    "hostel": [
        "maggi", "midnight", "roommate", "washing machine", "mess food", "curfew",
        "warden", "balcony", "power cut", "water tank", "iron", "bucket bath",
        "mosquito", "ceiling fan", "bunk bed", "suitcase", "home sick",
        "night canteen", "terrace", "common room",
    ],
    "desi": [
        "auto rickshaw", "chai tapri", "jugaad", "tuition", "selfie", "WiFi",
        "panipuri", "samosa", "biryani", "dosa", "paratha", "lassi",
        "cricket", "Diwali", "holi colors", "rangoli", "dhol", "kurta",
        "chappal", "scooter", "train", "bus stand", "temple", "market",
    ],
    "bollywood": [
        "SRK pose", "interval", "popcorn", "item song", "dialogue",
        "villain", "hero entry", "rain dance", "college romance", "fight scene",
        "award show", "red carpet", "paparazzi", "trailer", "blockbuster",
        "flop", "remake", "sequel", "audition", "director chair",
    ],
    "memes": [
        "Monday morning", "exam night", "results day", "group project",
        "online class", "camera off", "mute unmute", "WiFi buffering",
        "deadline", "all nighter", "coffee addict", "gym motivation",
        "diet starts Monday", "alarm snooze", "weekend plans", "traffic jam",
        "parking", "food delivery", "battery low", "screenshot",
    ],
}


def get_word_choices(category: str = "mixed", count: int = 3) -> list[str]:
    """Return `count` random words from the given category."""
    if category == "mixed":
        all_words = [w for words in WORDS.values() for w in words]
    else:
        all_words = WORDS.get(category, WORDS["college"])
    return random.sample(all_words, min(count, len(all_words)))
