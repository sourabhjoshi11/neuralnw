"""
Run this once to seed truth_or_dare questions into the database.
Usage: python -m scripts.seed_content
"""

import asyncio
import uuid
from app.db.base import engine, Base
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import sessionmaker
from sqlalchemy import text

TRUTHS = [
    "What's the most embarrassing thing you've done in class?",
    "Have you ever cheated on a test? Tell us.",
    "Who do you have a crush on right now?",
    "What's the biggest lie you've told your parents?",
    "Have you ever blamed someone else for something you did?",
    "What's the most embarrassing song on your playlist?",
    "Have you ever secretly liked your friend's ex?",
    "What's a secret you've never told anyone?",
    "Have you ever pretended to be sick to skip school?",
    "Who in this group would you swap lives with?",
    "What's the weirdest dream you've ever had?",
    "Have you ever sent a text to the wrong person?",
    "What's something you're too embarrassed to Google?",
    "Have you ever eavesdropped on someone's conversation?",
    "What's the most childish thing you still do?",
    "Have you ever liked your own Instagram post with a fake account?",
    "What's the longest you've gone without showering?",
    "Have you ever stolen something, even something small?",
    "What's the most embarrassing thing in your camera roll?",
    "Who in this room do you think is the most fake?",
    "Have you ever walked into a glass door?",
    "What's your most embarrassing autocorrect fail?",
    "Have you ever peed in a pool?",
    "What's something you pretend to understand but actually don't?",
    "Have you ever made fun of someone behind their back?",
    "What's the pettiest thing you've ever done for revenge?",
    "Have you ever blocked someone and then stalked their profile on a different account?",
    "What's the most desperate thing you've done for attention?",
    "Have you ever laughed at something you definitely shouldn't have?",
    "What's a habit you have that would gross people out?",
]

DARES = [
    "Text your crush 'hey I miss you' right now.",
    "Let someone in the group post anything on your Instagram story.",
    "Do your best impression of a teacher.",
    "Call a random contact and say 'I know what you did last summer'.",
    "Show everyone your most recent Google search.",
    "Let the group go through your camera roll for 30 seconds.",
    "Send a voice note to the last person you texted saying 'I think about you a lot'.",
    "Do 20 push-ups without stopping.",
    "Let someone draw on your arm with a marker.",
    "Text your parents 'I need to tell you something important' and wait for their reply.",
    "Do your best dance move in front of everyone.",
    "Speak in an accent for the next 3 rounds.",
    "Let the group pick a story for you to post on WhatsApp.",
    "Eat something spicy without making a face.",
    "Do the worm on the floor.",
    "Let someone style your hair however they want.",
    "Call a friend and tell them you're thinking of becoming a monk.",
    "Show your most recent DM conversation.",
    "Sing the chorus of the last song you listened to out loud.",
    "Let the group change your phone wallpaper.",
    "Try to lick your elbow for 10 seconds.",
    "Talk like a robot for the next 2 rounds.",
    "Let someone in the group send a reply to your last Instagram comment.",
    "Do a 1-minute standup comedy routine right now.",
    "Write a 3-line poem about the person to your left.",
    "Imitate every person in the room, one by one.",
    "Send a wholesome compliment to someone you haven't talked to in months.",
    "Let the group rate your notes app.",
    "Narrate everything you do for the next 60 seconds like a nature documentary.",
    "Let the group send one emoji to any contact of their choice from your phone.",
]

async def seed():
    async_session = sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)
    async with async_session() as session:
        # Check if already seeded
        result = await session.execute(text("SELECT COUNT(*) FROM truth_or_dare"))
        count = result.scalar()
        if count and count > 0:
            print(f"Already have {count} rows — skipping seed. Delete rows first to re-seed.")
            return

        rows = []
        for t in TRUTHS:
            rows.append({
                "id": str(uuid.uuid4()),
                "type": "truth",
                "content": t,
                "points": 10,
                "is_active": True,
            })
        for d in DARES:
            rows.append({
                "id": str(uuid.uuid4()),
                "type": "dare",
                "content": d,
                "points": 20,
                "is_active": True,
            })

        await session.execute(
            text(
                "INSERT INTO truth_or_dare (id, type, content, points, is_active) "
                "VALUES (:id, :type, :content, :points, :is_active)"
            ),
            rows,
        )
        await session.commit()
        print(f"✅ Seeded {len(TRUTHS)} truths and {len(DARES)} dares ({len(rows)} total).")

if __name__ == "__main__":
    asyncio.run(seed())
