import pytest


@pytest.fixture(scope="session")
def anyio_backend() -> str:
    # anyio's pytest plugin (already installed with FastAPI) runs the async tests on asyncio.
    return "asyncio"
