from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    app_name: str = "AI EDA"
    debug: bool = True
    env: str = "development"

    # Server
    backend_host: str = "0.0.0.0"
    backend_port: int = 8000

    # PostgreSQL
    postgres_user: str = "ai_eda"
    postgres_password: str = "changeme"
    postgres_db: str = "ai_eda"
    postgres_host: str = "localhost"
    postgres_port: int = 5432

    # Redis
    redis_host: str = "localhost"
    redis_port: int = 6379

    # LLM (OpenAI-compatible)
    llm_api_key: str = "sk-placeholder"
    llm_base_url: str = ""  # Empty = OpenAI default. Set for local/proxy.
    llm_model: str = "gpt-4o-mini"
    llm_temperature: float = 0.1

    @property
    def database_url(self) -> str:
        return (
            f"postgresql://{self.postgres_user}:{self.postgres_password}"
            f"@{self.postgres_host}:{self.postgres_port}/{self.postgres_db}"
        )

    @property
    def redis_url(self) -> str:
        return f"redis://{self.redis_host}:{self.redis_port}/0"

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


@lru_cache()
def get_settings() -> Settings:
    return Settings()
