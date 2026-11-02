import pytest
from pydantic import ValidationError

from server.config import Environment, MissingSetting, Process, Settings

DATABASE_URL = "postgresql://app_server:s3cret@127.0.0.1:54322/postgres"


@pytest.fixture(autouse=True)
def clean_environment(monkeypatch: pytest.MonkeyPatch, tmp_path: pytest.TempPathFactory) -> None:
    """No inherited variables and no .env.local from the working directory."""
    for name in (
        "ENVIRONMENT",
        "DATABASE_URL",
        "PIPELINE_DATABASE_URL",
        "DECK_DATABASE_URL",
        "TRAINER_DATABASE_URL",
        "API_DATABASE_URL",
        "TMDB_READ_TOKEN",
        "TMDB_TOKEN",
        "SENTRY_DSN",
    ):
        monkeypatch.delenv(name, raising=False)
    monkeypatch.chdir(tmp_path)  # type: ignore[arg-type]


def test_reads_the_environment(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("ENVIRONMENT", "staging")
    monkeypatch.setenv("PIPELINE_DATABASE_URL", DATABASE_URL)
    monkeypatch.setenv("TMDB_READ_TOKEN", "token")

    settings = Settings.load()

    assert settings.environment is Environment.STAGING
    assert settings.database_url_for(Process.PIPELINE).get_secret_value() == DATABASE_URL
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


def test_refuses_a_missing_environment(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("DATABASE_URL", DATABASE_URL)

    with pytest.raises(ValidationError) as error:
        Settings.load()

    assert [problem["loc"] for problem in error.value.errors()] == [("environment",)]


@pytest.mark.parametrize(
    ("name", "value"),
    [
        ("ENVIRONMENT", "prod"),
        ("DATABASE_URL", "mysql://app_server:s3cret@host/db"),
        ("DATABASE_URL", "postgresql://app_server:s3cret@[::1/db"),
        ("PIPELINE_DATABASE_URL", "mysql://flimme_pipeline:s3cret@host/db"),
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


def test_the_pipeline_uses_database_url_locally(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("ENVIRONMENT", "local")
    monkeypatch.setenv("DATABASE_URL", DATABASE_URL)

    url = Settings.load().database_url_for(Process.PIPELINE)

    assert url.get_secret_value() == DATABASE_URL


def test_the_pipeline_prefers_its_own_url(monkeypatch: pytest.MonkeyPatch) -> None:
    own = "postgresql://flimme_pipeline:own@127.0.0.1:54322/postgres"
    monkeypatch.setenv("ENVIRONMENT", "local")
    monkeypatch.setenv("DATABASE_URL", DATABASE_URL)
    monkeypatch.setenv("PIPELINE_DATABASE_URL", own)

    settings = Settings.load()

    assert settings.database_url_for(Process.PIPELINE).get_secret_value() == own
    # Another process does not take the pipeline's login.
    assert settings.database_url_for(Process.DECK).get_secret_value() == DATABASE_URL


@pytest.mark.parametrize("process", list(Process))
def test_a_process_without_a_url_names_the_variable_not_a_value(
    monkeypatch: pytest.MonkeyPatch, process: Process
) -> None:
    monkeypatch.setenv("ENVIRONMENT", "local")

    with pytest.raises(MissingSetting) as error:
        Settings.load().database_url_for(process)

    assert error.value.variable == f"{process.value.upper()}_DATABASE_URL"
    assert error.value.variable in str(error.value)


def test_staging_does_not_fall_back_to_database_url(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.setenv("ENVIRONMENT", "staging")
    monkeypatch.setenv("DATABASE_URL", DATABASE_URL)

    with pytest.raises(MissingSetting) as error:
        Settings.load().database_url_for(Process.PIPELINE)

    assert error.value.variable == "PIPELINE_DATABASE_URL"
    assert "s3cret" not in str(error.value)
