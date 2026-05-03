from openai import AsyncOpenAI

from app.core.config import settings

_client: AsyncOpenAI | None = None


def _get_client() -> AsyncOpenAI:
    global _client
    if _client is None:
        _client = AsyncOpenAI(api_key=settings.OPENAI_API_KEY)
    return _client


async def is_content_safe(text: str) -> bool:
    """Returns True if content passes moderation, False if flagged.
    Fails open (allows content) on transient errors so OpenAI downtime
    doesn't break the feed. Set OPENAI_API_KEY to enable; if unset,
    moderation is skipped entirely.
    """
    if not settings.OPENAI_API_KEY:
        return True
    try:
        client = _get_client()
        response = await client.moderations.create(input=text, model="omni-moderation-latest")
        return not response.results[0].flagged
    except Exception:
        return True
