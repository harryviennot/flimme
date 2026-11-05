"""Settings from the environment, validated when the process starts.

A missing or malformed value stops the process with a message naming the setting
(never its value: the database URL holds a password). Local development reads
`.env.local` from the working directory; in staging and production the host sets
real environment variables and the file does not exist.

Each process has its own database login (M1.12), so each has its own URL variable:
PIPELINE_DATABASE_URL, DECK_DATABASE_URL, TRAINER_DATABASE_URL and API_DATABASE_URL. Locally
only, DATABASE_URL stands in for any of them. A command asks for the one URL it needs with
`Settings.database_url_for`, so a process never needs another process's login.
"""

from enum import StrEnum
from typing import Self

from psycopg.conninfo import conninfo_to_dict
from pydantic import AliasChoices, Field, SecretStr, field_validator, model_validator
from pydantic_settings import BaseSettings, SettingsConfigDict


class Environment(StrEnum):
    LOCAL = "local"
    STAGING = "staging"
    PRODUCTION = "production"


class Process(StrEnum):
    """A process with its own database login. The value names its URL variable."""

    PIPELINE = "pipeline"
    DECK = "deck"
    TRAINER = "trainer"
    API = "api"

    @property
    def variable(self) -> str:
        return f"{self.value.upper()}_DATABASE_URL"


class MissingSetting(Exception):
    """A required setting is not set. Names the variable, never a value."""

    def __init__(self, variable: str) -> None:
        super().__init__(f"{variable} is not set")
        self.variable = variable


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

    # Each process's own login, through the shared pooler in session mode. `database_url` is
    # the local stand-in for all of them.
    database_url: SecretStr | None = None
    pipeline_database_url: SecretStr | None = None
    deck_database_url: SecretStr | None = None
    trainer_database_url: SecretStr | None = None
    api_database_url: SecretStr | None = None

    # TMDB's read access token. Only the pipeline worker and the API need it.
    tmdb_token: SecretStr | None = Field(
        default=None, validation_alias=AliasChoices("TMDB_READ_TOKEN", "tmdb_token")
    )

    # The project's URL, for the HTTP API: it finds the signing keys and the token issuer there.
    supabase_url: str | None = None

    # The HTTP API's secret key, for Supabase's auth admin API (account deletion). Only the
    # HTTP API process holds it.
    supabase_secret_key: SecretStr | None = None

    # PostHog, for forgetting a deleted player. The project id is a number; the personal API key
    # is a secret. Without a key the step is skipped (no analytics run in local or staging).
    posthog_personal_api_key: SecretStr | None = None
    posthog_project_id: str | None = None
    posthog_host: str = "https://eu.posthog.com"

    sentry_dsn: SecretStr | None = None

    @classmethod
    def load(cls) -> Self:
        """Read the settings from the environment and .env.local, and validate them."""
        # pydantic-settings fills the required fields from the environment, which pyright
        # cannot know.
        return cls()  # pyright: ignore[reportCallIssue]

    def database_url_for(self, process: Process) -> SecretStr:
        """The login URL of one process. Raises MissingSetting naming the variable."""
        own: SecretStr | None = getattr(self, f"{process.value}_database_url")
        if own is not None:
            return own
        if self.environment is Environment.LOCAL and self.database_url is not None:
            return self.database_url
        raise MissingSetting(process.variable)

    @field_validator(
        "database_url",
        "pipeline_database_url",
        "deck_database_url",
        "trainer_database_url",
        "api_database_url",
    )
    @classmethod
    def _database_url_is_a_connection_url(cls, value: SecretStr | None) -> SecretStr | None:
        if value is None:
            return None
        url = value.get_secret_value()
        if not url.startswith(("postgresql://", "postgres://")):
            raise ValueError("must be a postgresql:// or postgres:// URL")
        try:
            conninfo_to_dict(url)
        except Exception:
            raise ValueError("is not a valid PostgreSQL connection URL") from None
        return value

    def missing_for_api(self) -> str | None:
        """The first setting the HTTP API needs and lacks (a variable name), or None.

        The secret key is required outside local; PostHog's key and project id in production.
        """
        if self.supabase_url is None:
            return "SUPABASE_URL"
        if self.environment is not Environment.LOCAL and self.supabase_secret_key is None:
            return "SUPABASE_SECRET_KEY"
        if self.environment is Environment.PRODUCTION and self.posthog_personal_api_key is None:
            return "POSTHOG_PERSONAL_API_KEY"
        if self.posthog_personal_api_key is not None and self.posthog_project_id is None:
            return "POSTHOG_PROJECT_ID"
        if self.environment is Environment.PRODUCTION and self.posthog_project_id is None:
            return "POSTHOG_PROJECT_ID"
        return None

    @model_validator(mode="after")
    def _supabase_url_is_https(self) -> Self:
        url = self.supabase_url
        if url is None:
            return self
        local_host = url.startswith(("http://127.0.0.1", "http://localhost"))
        if not (
            url.startswith("https://") or (local_host and self.environment is Environment.LOCAL)
        ):
            raise ValueError("must be an https:// URL (http://127.0.0.1 or localhost when local)")
        return self
