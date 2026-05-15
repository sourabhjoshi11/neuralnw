from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    APP_ENV: str = "development"
    SECRET_KEY: str
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 43200  # 30 days

    DATABASE_URL: str
    SUPABASE_URL: str = ""
    SUPABASE_SERVICE_KEY: str = ""

    ENCRYPTION_KEY: str

    MSG91_AUTH_KEY: str = ""
    MSG91_TEMPLATE_ID: str = ""

    OPENAI_API_KEY: str = ""

    REDIS_URL: str = "redis://localhost:6379"

    ALLOWED_ORIGINS: str = "http://localhost:3000"

    @property
    def origins(self) -> list[str]:
        return [o.strip() for o in self.ALLOWED_ORIGINS.split(",")]


settings = Settings()  # type: ignore[call-arg]
