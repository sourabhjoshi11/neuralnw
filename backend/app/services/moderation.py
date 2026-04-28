from openai import AsyncOpenAI

from app.core.config import settings

_client: AsyncOpenAI | None = None


def _get_client() -> AsyncOpenAI:
    global _client
    if _client is None:
        _client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)
    return _client


async def is_content_safe(text: str) -> bool:
    """Returns True if content passes moderation, False if flagged."""
    try:
        client = _get_client()
        response = await client.moderations.create(input=text, model="omni-moderation-latest")
        return not response.results[0].flagged
    except Exception:
        return True
