import pytest
from pydantic import ValidationError

from server.config import Environment, Settings

DATABASE_URL = "postgresql://app_server:s3cret@127.0.0.1:54322/postgres"


@pytest.fixture(autouse=True)
def clean_environment(monkeypatch: pytest.MonkeyPatch, tmp_path: pytest.TempPathFactory) -> None:
    """No inherited variables and no .env.local from the working directory."""
    for name in ("ENVIRONMENT", "DATABASE_URL", "TMDB_READ_TOKEN", "TMDB_TOKEN", "SENTRY_DSN"):
        monkeypatch.delenv(name, raising=False)
    monkeypatch.chdir(tmp_path)  # type: ignore[arg-type]


def test_reads_the_environment(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("ENVIRONMENT", "staging")
    monkeypatch.setenv("DATABASE_URL", DATABASE_URL)
    monkeypatch.setenv("TMDB_READ_TOKEN", "token")

    settings = Settings.load()

    assert settings.environment is Environment.STAGING
    assert settings.database_url.get_secret_value() == DATABASE_URL
    assert settings.tmdb_token is not None
    assert settings.tmdb_token.get_secret_value() == "token"
    assert settings.sentry_dsn is None


def test_reads_env_local(monkeypatch: pytest.MonkeyPatch) -> None:
    with open(".env.local", "w") as file:
        file.write(
            f"ENVIRONMENT=local\nDATABASE_URL={DATABASE_URL}\nSENTRY_DSN=\nTMDB_READ_TOKEN=\n"
        )

    settings = Settings.load()

    assert settings.environment is Environment.LOCAL
    assert settings.sentry_dsn is None  # an empty value counts as not set
    assert settings.tmdb_token is None


def test_refuses_a_missing_value(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("ENVIRONMENT", "local")

    with pytest.raises(ValidationError) as error:
        Settings.load()

    assert [problem["loc"] for problem in error.value.errors()] == [("database_url",)]


@pytest.mark.parametrize(
    ("name", "value"),
    [
        ("ENVIRONMENT", "prod"),
        ("DATABASE_URL", "mysql://app_server:s3cret@host/db"),
        ("DATABASE_URL", "postgresql://app_server:s3cret@[::1/db"),
    ],
)
def test_refuses_a_malformed_value_without_echoing_it(
    monkeypatch: pytest.MonkeyPatch, name: str, value: str
) -> None:
    monkeypatch.setenv("ENVIRONMENT", "local")
    monkeypatch.setenv("DATABASE_URL", DATABASE_URL)
    monkeypatch.setenv(name, value)

    with pytest.raises(ValidationError) as error:
        Settings.load()

    assert "s3cret" not in str(error.value)


def test_hides_secrets_in_repr(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("ENVIRONMENT", "local")
    monkeypatch.setenv("DATABASE_URL", DATABASE_URL)

    assert "s3cret" not in repr(Settings.load())
