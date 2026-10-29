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
    for name in ("ENVIRONMENT", "DATABASE_URL"):
        monkeypatch.delenv(name, raising=False)
    monkeypatch.chdir(tmp_path)  # type: ignore[arg-type]

    assert main(["api"]) == 1

    message = capsys.readouterr().err
    assert "ENVIRONMENT" in message
    assert "DATABASE_URL" in message
