"""The bodies of the messages on the queues, as pydantic models.

`catalog_refresh` has three kinds of message (server-structure.md#consuming-the-queues,
tmdb.md). The pipeline handlers from M2.5 on only add handlers; the shapes live here.
A body that fails validation is bad input: the runner archives it at once.
"""

from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, TypeAdapter

Job = Literal[
    "reference_weekly",
    "popularity_daily",
    "availability_sweep",
    "changes_daily",
    "details_weekly",
    "details_monthly",
]

FetchReason = Literal["candidate", "sweep", "changes", "weekly", "monthly"]


class _Message(BaseModel):
    model_config = ConfigDict(frozen=True)


class JobMessage(_Message):
    """From cron or by hand: open an `ingest_runs` row, then do the work or fan out."""

    kind: Literal["job"] = "job"
    job: Job


class FetchMessage(_Message):
    """Fetch 1 to 100 TMDB movies and upsert them."""

    kind: Literal["fetch"] = "fetch"
    run_id: int
    tmdb_ids: Annotated[list[int], Field(min_length=1, max_length=100)]
    reason: FetchReason


class SweepMessage(_Message):
    """Sweep one service in one country: the three offer kinds, every page."""

    kind: Literal["sweep"] = "sweep"
    run_id: int
    country: Annotated[str, Field(pattern=r"^[A-Z]{2}$")]
    provider_id: int


CatalogRefreshMessage = Annotated[
    JobMessage | FetchMessage | SweepMessage, Field(discriminator="kind")
]

CatalogRefreshAdapter: TypeAdapter[CatalogRefreshMessage] = TypeAdapter(CatalogRefreshMessage)
