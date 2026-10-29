"""The FastAPI application.

Only the health route exists so far. The routes in server-structure.md ("The HTTP
API": Letterboxd import and search, account deletion, token checks) are roadmap
task M8.4 and later.
"""

from fastapi import FastAPI


def create_app() -> FastAPI:
    app = FastAPI(title="MovieMatch server")

    @app.get("/healthz")
    def health() -> dict[str, str]:
        return {"status": "ok"}

    return app


app = create_app()
