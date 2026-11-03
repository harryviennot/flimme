import pytest

from server.cli import PLANNED, main


@pytest.mark.parametrize("command", [planned.name for planned in PLANNED])
def test_commands_not_built_yet_name_their_milestone_and_exit_2(
    command: str, capsys: pytest.CaptureFixture[str]
) -> None:
    assert main([command]) == 2

    message = capsys.readouterr().err
    assert f"server {command}: not built yet" in message
    assert "Roadmap M" in message


def test_trainer_accepts_its_future_argument(capsys: pytest.CaptureFixture[str]) -> None:
    assert main(["trainer", "nightly"]) == 2
    assert "not built yet" in capsys.readouterr().err


def test_api_refuses_to_start_with_invalid_settings(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: pytest.TempPathFactory,
    capsys: pytest.CaptureFixture[str],
) -> None:
    for name in ("ENVIRONMENT", "DATABASE_URL", "API_DATABASE_URL"):
        monkeypatch.delenv(name, raising=False)
    monkeypatch.chdir(tmp_path)  # type: ignore[arg-type]

    assert main(["api"]) == 1

    message = capsys.readouterr().err
    assert "ENVIRONMENT" in message


def test_api_without_a_url_exits_1_and_names_the_variable_not_a_value(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: pytest.TempPathFactory,
    capsys: pytest.CaptureFixture[str],
) -> None:
    monkeypatch.delenv("DATABASE_URL", raising=False)
    monkeypatch.delenv("API_DATABASE_URL", raising=False)
    monkeypatch.setenv("ENVIRONMENT", "staging")
    monkeypatch.setenv("TMDB_READ_TOKEN", "tmdb-secret-value")
    monkeypatch.chdir(tmp_path)  # type: ignore[arg-type]

    assert main(["api"]) == 1

    message = capsys.readouterr().err
    assert "API_DATABASE_URL" in message
    assert "tmdb-secret-value" not in message


def test_pipeline_worker_without_its_url_exits_1_and_names_the_variable(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: pytest.TempPathFactory,
    capsys: pytest.CaptureFixture[str],
) -> None:
    monkeypatch.delenv("DATABASE_URL", raising=False)
    monkeypatch.delenv("PIPELINE_DATABASE_URL", raising=False)
    monkeypatch.setenv("ENVIRONMENT", "staging")
    monkeypatch.setenv("API_DATABASE_URL", "postgresql://flimme_http:other-login@db/postgres")
    monkeypatch.chdir(tmp_path)  # type: ignore[arg-type]

    assert main(["pipeline-worker"]) == 1

    message = capsys.readouterr().err
    assert "PIPELINE_DATABASE_URL" in message
    assert "other-login" not in message  # another process's login is never used


def test_backfill_is_built_and_no_longer_planned():
    assert "backfill" not in [planned.name for planned in PLANNED]


@pytest.mark.parametrize("limit", ["0", "-5", "many"])
def test_backfill_refuses_a_limit_that_is_not_a_positive_number(
    limit: str, capsys: pytest.CaptureFixture[str]
) -> None:
    with pytest.raises(SystemExit) as stopped:
        main(["backfill", "--limit", limit])

    assert stopped.value.code == 2
    assert "--limit" in capsys.readouterr().err


def test_backfill_without_its_url_exits_1_and_names_the_variable(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: pytest.TempPathFactory,
    capsys: pytest.CaptureFixture[str],
) -> None:
    monkeypatch.delenv("DATABASE_URL", raising=False)
    monkeypatch.delenv("PIPELINE_DATABASE_URL", raising=False)
    monkeypatch.setenv("ENVIRONMENT", "local")
    monkeypatch.chdir(tmp_path)  # type: ignore[arg-type]

    assert main(["backfill"]) == 1

    assert "PIPELINE_DATABASE_URL" in capsys.readouterr().err


def test_backfill_without_a_tmdb_token_exits_1_and_says_so(
    monkeypatch: pytest.MonkeyPatch,
    tmp_path: pytest.TempPathFactory,
    capsys: pytest.CaptureFixture[str],
) -> None:
    monkeypatch.delenv("TMDB_READ_TOKEN", raising=False)
    monkeypatch.delenv("TMDB_TOKEN", raising=False)
    monkeypatch.setenv("ENVIRONMENT", "local")
    monkeypatch.setenv("DATABASE_URL", "postgresql://u:secret-password@127.0.0.1:1/db")
    monkeypatch.chdir(tmp_path)  # type: ignore[arg-type]

    assert main(["backfill"]) == 1

    message = capsys.readouterr().err
    assert "TMDB_READ_TOKEN" in message
    assert "secret-password" not in message


def test_httpx_and_httpcore_log_at_warning_so_a_full_load_does_not_print_every_request():
    import logging

    from server.cli import configure_logging

    configure_logging()

    assert logging.getLogger("httpx").getEffectiveLevel() == logging.WARNING
    assert logging.getLogger("httpcore").getEffectiveLevel() == logging.WARNING
