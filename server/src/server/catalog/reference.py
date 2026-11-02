"""The weekly reference data job (`reference_weekly`, tmdb.md#keeping-it-fresh).

Load from TMDB, compute, write. It keeps the small tables that every film points at in step
with TMDB, and applies our curation (`curation.toml`) on top:

- Genres in English and French. The slug comes from the English name and is set once.
- Countries: missing codes are inserted, disabled. Only curation enables a country.
- Per enabled country, its providers and their display priority. `is_listed`,
  `free_for_all` and `parent_id` are ours: the TMDB step never touches them. Nothing is ever
  deleted; a curated service TMDB stopped listing is logged as a warning (decision Q15).
- Certifications TMDB knows with no age in `certification_ages` are logged (policy: Q13).
- The image configuration: the run fails if a size the app uses is gone, and stores nothing
  (decision Q14).

Every write is an upsert that skips an unchanged row, so a rerun changes nothing, and the
message can safely arrive twice. The run is one `ingest_runs` row that always ends with
`finished_at` and its counts. Logs carry ids only.
"""

import logging
import re
import unicodedata
from typing import Any

from psycopg.types.json import Jsonb
from pydantic import BaseModel, ConfigDict, Field

from server.catalog.curation import Curation
from server.catalog.tmdb import NotFound, TmdbClient, TmdbError
from server.db import queries
from server.db.pool import Database
from server.workers.runner import Done, Outcome

log = logging.getLogger(__name__)

# What the app builds image URLs from (tmdb.md#images). "Never original".
SECURE_BASE_URL = "https://image.tmdb.org/t/p/"
REQUIRED_SIZES: dict[str, tuple[str, ...]] = {
    # w92 is the poster the placeholder is made from (M2.8).
    "poster_sizes": ("w92", "w185", "w342", "w500", "w780"),
    "backdrop_sizes": ("w780",),
    "logo_sizes": ("w92",),
}
DEFAULT_DISPLAY_PRIORITY = 100
MAX_DISPLAY_PRIORITY = 32767  # smallint


class ReferenceFailed(Exception):
    """The run cannot succeed until someone looks (not worth retrying)."""


class _Loose(BaseModel):
    model_config = ConfigDict(extra="ignore")


class _Genre(_Loose):
    id: int
    name: str


class _GenreList(_Loose):
    genres: list[_Genre]


class _Country(_Loose):
    iso_3166_1: str


class _Provider(_Loose):
    provider_id: int
    provider_name: str
    logo_path: str | None = None
    display_priority: int | None = None
    display_priorities: dict[str, int] = {}


class _ProviderList(_Loose):
    results: list[_Provider]


class _Certification(_Loose):
    certification: str


class _CertificationList(_Loose):
    certifications: dict[str, list[_Certification]]


class _Images(_Loose):
    secure_base_url: str = ""
    poster_sizes: list[str] = []
    backdrop_sizes: list[str] = []
    logo_sizes: list[str] = []


class _Configuration(_Loose):
    images: _Images = Field(default_factory=_Images)


def slugify(english_name: str) -> str:
    """`Science Fiction` -> `science_fiction`."""
    ascii_name = unicodedata.normalize("NFKD", english_name).encode("ascii", "ignore").decode()
    return re.sub(r"[^a-z0-9]+", "_", ascii_name.lower()).strip("_")


def missing_image_sizes(configuration: _Configuration) -> list[str]:
    """Sizes (or the base URL) the app relies on that TMDB's configuration no longer offers."""
    images = configuration.images
    missing = [] if images.secure_base_url == SECURE_BASE_URL else ["secure_base_url"]
    for field, sizes in REQUIRED_SIZES.items():
        have: list[str] = getattr(images, field)
        missing += [f"{field.removesuffix('_sizes')}:{size}" for size in sizes if size not in have]
    return missing


def display_priority(provider: _Provider, country: str) -> int:
    value = provider.display_priorities.get(country, provider.display_priority)
    if value is None:
        return DEFAULT_DISPLAY_PRIORITY
    return max(0, min(value, MAX_DISPLAY_PRIORITY))


async def run_reference_weekly(database: Database, tmdb: TmdbClient, curation: Curation) -> Outcome:
    """One run. Always leaves its `ingest_runs` row finished. Returns `Done` unless the failure
    is worth retrying (TMDB asking us to come back later), in which case the error escapes."""
    async with database.connection() as conn:
        cur = await conn.execute(queries.load("open_run"), ("reference_weekly",))
        row = await cur.fetchone()
    assert row is not None
    run_id: int = row[0]
    before = tmdb.stats
    stats: dict[str, int] = {}
    errors = 0
    note: str | None = None
    failure: Exception | None = None
    try:
        await _reference(database, tmdb, curation, run_id, stats)
    except ReferenceFailed as error:
        errors, note = 1, str(error)
        log.error("reference run failed run=%s reason=%s", run_id, note)
    except TmdbError as error:
        errors, note = 1, f"tmdb refused: {error}"
        log.error("reference run failed run=%s reason=%s", run_id, note)
    except Exception as error:
        errors, note, failure = 1, f"{type(error).__name__}, will be retried", error
        log.exception("reference run interrupted run=%s", run_id)
    after = tmdb.stats
    stats |= {key: after[key] - before[key] for key in after}
    async with database.connection() as conn:
        await conn.execute(queries.load("finish_run"), (errors, note, Jsonb(stats), run_id))
    if failure is not None:
        raise failure
    log.info("reference run done run=%s errors=%s", run_id, errors)
    return Done()


async def _reference(
    database: Database, tmdb: TmdbClient, curation: Curation, run_id: int, stats: dict[str, int]
) -> None:
    # Check first: a missing size means the app's image URLs break, so write nothing.
    configuration = _Configuration.model_validate(await _get(tmdb, "/configuration"))
    if missing := missing_image_sizes(configuration):
        raise ReferenceFailed(f"image configuration lost: {', '.join(missing)}")

    await _apply_countries(database, curation, stats)
    await _genres(database, tmdb, stats)
    await _countries(database, tmdb, stats)
    await _providers(database, tmdb, run_id, stats)
    await _certifications(database, tmdb, curation, stats)
    await _apply_services(database, curation, stats)


async def _get(tmdb: TmdbClient, path: str, params: dict[str, str] | None = None) -> dict[str, Any]:
    body = await tmdb.get(path, params)
    if isinstance(body, NotFound):
        raise TmdbError(f"{path} not found")
    return body


async def _apply_countries(database: Database, curation: Curation, stats: dict[str, int]) -> None:
    async with database.connection() as conn, conn.transaction():
        for code, country in curation.countries.items():
            await conn.execute(
                queries.load("upsert_country_curation"), (code, country.language, country.enabled)
            )
    stats["countries_curated"] = len(curation.countries)


async def _genres(database: Database, tmdb: TmdbClient, stats: dict[str, int]) -> None:
    english = _GenreList.model_validate(
        await _get(tmdb, "/genre/movie/list", {"language": "en-US"})
    )
    french = _GenreList.model_validate(await _get(tmdb, "/genre/movie/list", {"language": "fr-FR"}))
    french_names = {genre.id: genre.name for genre in french.genres}
    async with database.connection() as conn, conn.transaction():
        for genre in english.genres:
            names = {"en": genre.name, "fr": french_names.get(genre.id, genre.name)}
            await conn.execute(
                queries.load("upsert_genre"), (genre.id, slugify(genre.name), Jsonb(names))
            )
    stats["genres"] = len(english.genres)


async def _countries(database: Database, tmdb: TmdbClient, stats: dict[str, int]) -> None:
    body = await tmdb.get_list("/configuration/countries")
    if isinstance(body, NotFound):
        raise TmdbError("/configuration/countries not found")
    found = {_Country.model_validate(item).iso_3166_1 for item in body}
    codes = sorted(code for code in found if re.fullmatch(r"[A-Z]{2}", code))
    added = 0
    async with database.connection() as conn, conn.transaction():
        for code in codes:
            cur = await conn.execute(queries.load("insert_country"), (code,))
            added += cur.rowcount
    stats["countries_added"] = added


async def _providers(
    database: Database, tmdb: TmdbClient, run_id: int, stats: dict[str, int]
) -> None:
    async with database.connection() as conn:
        cur = await conn.execute(queries.load("enabled_countries"))
        countries = [row[0] for row in await cur.fetchall()]
    providers = regions = 0
    for country in countries:
        listing = _ProviderList.model_validate(
            await _get(tmdb, "/watch/providers/movie", {"watch_region": country})
        )
        async with database.connection() as conn, conn.transaction():
            for provider in listing.results:
                await conn.execute(
                    queries.load("upsert_provider"),
                    (provider.provider_id, provider.provider_name, provider.logo_path),
                )
                await conn.execute(
                    queries.load("upsert_provider_region"),
                    (provider.provider_id, country, display_priority(provider, country)),
                )
            cur = await conn.execute(
                queries.load("curated_services_missing"),
                (country, [p.provider_id for p in listing.results]),
            )
            for (provider_id,) in await cur.fetchall():
                log.warning(
                    "curated service missing from tmdb run=%s country=%s provider_id=%s",
                    run_id,
                    country,
                    provider_id,
                )
                stats["curated_services_missing"] = stats.get("curated_services_missing", 0) + 1
        providers += len(listing.results)
        regions += len(listing.results)
    stats["providers"] = providers
    stats["provider_regions"] = regions
    stats.setdefault("curated_services_missing", 0)


async def _certifications(
    database: Database, tmdb: TmdbClient, curation: Curation, stats: dict[str, int]
) -> None:
    async with database.connection() as conn, conn.transaction():
        for country, ages in curation.certification_ages.items():
            # An age row needs its country row. A country we have ages for but TMDB did not
            # list yet is added disabled.
            await conn.execute(queries.load("insert_country"), (country,))
            for certification, min_age in ages.items():
                await conn.execute(
                    queries.load("upsert_certification_age"), (country, certification, min_age)
                )
    stats["certification_ages"] = sum(len(a) for a in curation.certification_ages.values())

    listing = _CertificationList.model_validate(await _get(tmdb, "/certification/movie/list"))
    without_age = 0
    async with database.connection() as conn:
        cur = await conn.execute(queries.load("countries_with_ages"))
        countries = [row[0] for row in await cur.fetchall()]
        for country in countries:
            cur = await conn.execute(queries.load("certification_ages_for"), (country,))
            known = {row[0] for row in await cur.fetchall()}
            for item in listing.certifications.get(country, []):
                if item.certification not in known:
                    without_age += 1
                    log.warning(
                        "certification without an age country=%s certification=%s",
                        country,
                        item.certification,
                    )
    stats["certifications_without_age"] = without_age


async def _apply_services(database: Database, curation: Curation, stats: dict[str, int]) -> None:
    async with database.connection() as conn, conn.transaction():
        for country, services in curation.services.items():
            await conn.execute(
                queries.load("set_service_flags"),
                (services.listed, services.free, country, services.listed, services.free),
            )
            for provider_id, priority in services.order.items():
                await conn.execute(
                    queries.load("set_service_order"), (priority, country, provider_id, priority)
                )
            for child, parent in services.variants.items():
                await conn.execute(
                    queries.load("set_variant_parent"), (parent, child, parent, parent)
                )
    stats["countries_with_services"] = len(curation.services)
