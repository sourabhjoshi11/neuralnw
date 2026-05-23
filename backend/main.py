from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException, Request, WebSocket
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.util import get_remote_address

from app.api.routes.auth import router as auth_router
from app.api.routes.game import router as game_router
from app.api.routes.feed import router as feed_router
from app.api.routes.chor_sipahi import router as cs_router
from app.api.websockets.game_ws import game_ws_handler
from app.api.websockets.cs_ws import cs_ws_handler
from app.core.config import settings
from app.db.base import AsyncSessionLocal, engine, Base
import app.models  # noqa: F401 - ensures all models are registered with SQLAlchemy

limiter = Limiter(key_func=get_remote_address)
HTTP_DEBUG_LOG = Path("http_debug.log")


def _http_log(message: str) -> None:
    print(message, flush=True)
    try:
        with HTTP_DEBUG_LOG.open("a", encoding="utf-8") as f:
            f.write(message + "\n")
    except Exception:
        pass


@asynccontextmanager
async def lifespan(app: FastAPI):
    try:
        async with engine.begin() as conn:
            await conn.run_sync(Base.metadata.create_all)
        print("Database connected and tables ready")
    except Exception as e:
        print(f"Database connection failed at startup: {e}")
        print("Server will start anyway")
    yield
    await engine.dispose()


app = FastAPI(
    title="ClassChaos API",
    version="1.0.0",
    lifespan=lifespan,
    docs_url="/docs" if settings.APP_ENV == "development" else None,
    redoc_url=None,
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    print(f"Unhandled error for {request.method} {request.url.path}: {exc}")
    origin = request.headers.get("origin")
    headers = {}
    if origin:
        headers["Access-Control-Allow-Origin"] = origin
        headers["Access-Control-Allow-Credentials"] = "true"
    return JSONResponse(
        status_code=500,
        content={
            "detail": str(exc) if settings.APP_ENV == "development" else "Internal server error",
        },
        headers=headers,
    )


@app.exception_handler(HTTPException)
async def http_exception_handler(request: Request, exc: HTTPException):
    origin = request.headers.get("origin")
    headers = dict(exc.headers or {})
    if origin:
        headers["Access-Control-Allow-Origin"] = origin
        headers["Access-Control-Allow-Credentials"] = "true"
    return JSONResponse(
        status_code=exc.status_code,
        content={"detail": exc.detail},
        headers=headers,
    )

_DEV_ORIGINS = [
    "http://localhost:8081",
    "http://localhost:19000",
    "http://localhost:19006",
    "http://127.0.0.1:8081",
    "http://127.0.0.1:19000",
    "http://127.0.0.1:19006",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.origins + _DEV_ORIGINS,
    allow_origin_regex=r"https?://(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+)(:\d+)?",
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "Accept", "Origin", "X-Requested-With"],
    expose_headers=["Authorization", "Content-Type"],
    max_age=600,
)


@app.middleware("http")
async def dev_request_logger(request: Request, call_next):
    origin = request.headers.get("origin")
    _http_log(f"[HTTP] {request.method} {request.url.path} origin={origin}")
    try:
        response = await call_next(request)
        _http_log(f"[HTTP] {request.method} {request.url.path} -> {response.status_code}")
    except Exception as exc:
        _http_log(f"[HTTP] {request.method} {request.url.path} FAILED {type(exc).__name__}: {exc}")
        response = JSONResponse(
            status_code=500,
            content={"detail": str(exc) if settings.APP_ENV == "development" else "Internal server error"},
        )
    if origin:
        response.headers["Access-Control-Allow-Origin"] = origin
        response.headers["Access-Control-Allow-Credentials"] = "true"
    return response

Path("uploads").mkdir(exist_ok=True)
app.mount("/uploads", StaticFiles(directory="uploads"), name="uploads")

app.include_router(auth_router)
app.include_router(game_router)
app.include_router(feed_router)
app.include_router(cs_router)


@app.get("/health")
async def health():
    return {"status": "ok", "env": settings.APP_ENV}


@app.websocket("/ws/game/{room_code}")
async def game_ws_endpoint(ws: WebSocket, room_code: str):
    async with AsyncSessionLocal() as db:
        await game_ws_handler(ws, room_code, db)


@app.websocket("/ws/cs/{room_code}")
async def cs_ws_endpoint(ws: WebSocket, room_code: str):
    async with AsyncSessionLocal() as db:
        await cs_ws_handler(ws, room_code, db)
