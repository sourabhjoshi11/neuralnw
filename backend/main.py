from contextlib import asynccontextmanager

from fastapi import FastAPI, WebSocket
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.routes.auth import router as auth_router
from app.api.routes.game import router as game_router
from app.api.routes.feed import router as feed_router
from app.api.websockets.game_ws import game_ws_handler
from app.core.config import settings
from app.db.base import AsyncSessionLocal, engine, Base


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Create tables on startup (use Alembic migrations in production)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    yield
    await engine.dispose()


app = FastAPI(
    title="ClassChaos API",
    version="1.0.0",
    lifespan=lifespan,
    docs_url="/docs" if settings.APP_ENV == "development" else None,
    redoc_url=None,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router)
app.include_router(game_router)
app.include_router(feed_router)


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.websocket("/ws/game/{room_code}")
async def game_ws_endpoint(ws: WebSocket, room_code: str):
    async with AsyncSessionLocal() as db:
        await game_ws_handler(ws, room_code, db)
