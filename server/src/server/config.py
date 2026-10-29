"""Settings from the environment, validated when the process starts.

A missing or malformed value stops the process with a message naming the setting
(never its value: the database URL holds a password). Local development reads
`.env.local` from the working directory; in staging and production the host sets
real environment variables and the file does not exist.

The variable names are the ones in docs/architecture/server-structure.md:
ENVIRONMENT, DATABASE_URL, TMDB_READ_TOKEN and SENTRY_DSN.
"""

from enum import StrEnum
from typing import Self

from psycopg.conninfo import conninfo_to_dict
from pydantic import AliasChoices, Field, SecretStr, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Environment(StrEnum):
    LOCAL = "local"
    STAGING = "staging"
    PRODUCTION = "production"


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env.local",
        env_file_encoding="utf-8",
        # An empty value (`TMDB_READ_TOKEN=` in .env.example) means "not set".
        env_ignore_empty=True,
        # Variables meant for other tools may share the file.
        extra="ignore",
        # Validation errors must not echo the value, which can be a password.
        hide_input_in_errors=True,
    )

    environment: Environment

    # The app_server login, through the shared pooler in session mode.
    database_url: SecretStr

    # TMDB's read access token. Only the pipeline worker and the API need it.
    tmdb_token: SecretStr | None = Field(
        default=None, validation_alias=AliasChoices("TMDB_READ_TOKEN", "tmdb_token")
    )

    sentry_dsn: SecretStr | None = None

    @classmethod
    def load(cls) -> Self:
        """Read the settings from the environment and .env.local, and validate them."""
        # pydantic-settings fills the required fields from the environment, which pyright
        # cannot know.
        return cls()  # pyright: ignore[reportCallIssue]

    @field_validator("database_url")
    @classmethod
    def _database_url_is_a_connection_url(cls, value: SecretStr) -> SecretStr:
        url = value.get_secret_value()
        if not url.startswith(("postgresql://", "postgres://")):
            raise ValueError("must be a postgresql:// or postgres:// URL")
        try:
            conninfo_to_dict(url)
        except Exception:
            raise ValueError("is not a valid PostgreSQL connection URL") from None
        return value
