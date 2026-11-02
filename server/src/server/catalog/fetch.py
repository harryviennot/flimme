"""The film fetch (`fetch` messages, tmdb.md#one-request-per-film).

Load, compute, write. One request per film brings every part we keep. `build_film_rows` is the
pure middle: a response and what the database told us (`FetchContext`) in, the rows to write
out. Then one transaction per film replaces the film's children as a whole, so a credit, an
offer or a language TMDB dropped disappears, and running the message again changes nothing.

- 404: the film is deactivated at once (`tmdb_missing_since` set if null). A later success
  reactivates it and clears the mark.
- Offers are stored only for the swept set of each enabled country (decision Q16): listed
  services, free services and the variants of either. Where the film's own answer differs from
  what the sweep stored, the film's answer wins and the difference is counted.
- `quality_score` needs C, the catalog's average vote (Q18). It is computed in SQL once per
  message and never stored; without a first C the score stays null.
- The floor (tmdb.md#which-films-are-in-the-catalog): a `candidate` or `sweep` fetch stores a
  film only if it is released, at least 40 minutes long, has at least 30 votes and is not
  adult (decision Q19: the others are not stored). A film already stored is never removed by
  it, and refreshes (`changes`, `weekly`, `monthly`) are not judged by it.
- Nothing goes to `embed_titles` and no placeholder is made here (M2.8, M19.2).

A film whose response cannot be read is counted as an error and skipped; the others in the
message still go through. Logs carry TMDB ids only.
"""

import asyncio
import logging
from collections import Counter
from collections.abc import Mapping, Sequence
from dataclasses import dataclass, field
from datetime import UTC, date, datetime
from typing import Any, Literal

from psycopg import AsyncConnection
from psycopg.types.json import Jsonb
from pydantic import BaseModel, ConfigDict, Field, ValidationError

from server.catalog.tmdb import NotFound, TmdbClient
from server.db import queries
from server.db.payloads import FetchMessage
from server.db.pool import Database
from server.workers.runner import Done, Outcome

log = logging.getLogger(__name__)

# The request, as written in the doc.
LANGUAGE = "en-US"
APPENDED_PARTS = "translations,keywords,credits,release_dates,videos,watch/providers,images"
IMAGE_LANGUAGES = "fr,en,null"
REQUEST_PARAMS = {
    "language": LANGUAGE,
    "append_to_response": APPENDED_PARTS,
    "include_image_language": IMAGE_LANGUAGES,
}

# Starting values (tmdb.md#one-request-per-film).
QUALITY_M = 100
MAX_WRITERS = 3
MAX_CAST = 8
CERTIFICATION_TYPES: tuple[tuple[int, ...] | None, ...] = ((3,), (4,), (6,), None)
FALLBACK_COUNTRY = "US"
# Films of one message in flight at once (the TMDB client has its own limit as well).
CONCURRENCY = 8

# The floor, the lowest any deck uses (tmdb.md#which-films-are-in-the-catalog).
MIN_RUNTIME_MIN = 40
MIN_VOTES = 30
FLOOR_REASONS = frozenset({"candidate", "sweep"})

OfferKind = Literal["subscription", "free", "ads"]
# TMDB's name -> ours. Rent and buy are not stored at launch.
OFFER_KINDS: dict[str, OfferKind] = {"flatrate": "subscription", "free": "free", "ads": "ads"}
CreditRole = Literal["director", "writer", "cast"]


def _today() -> date:
    return datetime.now(UTC).date()


@dataclass(frozen=True)
class FetchContext:
    """What the database knows that the build needs."""

    enabled_countries: frozenset[str]
    swept: Mapping[str, frozenset[int]]  # country -> provider ids whose offers we store
    ages: Mapping[tuple[str, str], int | None]  # (country, certification) -> min_age
    catalog_average: float | None  # C; None until a first one exists
    today: date = field(default_factory=_today)  # "a past release date" is judged against it


@dataclass(frozen=True)
class TitleRow:
    tmdb_id: int
    imdb_id: str | None
    original_title: str | None
    original_language: str | None
    release_date: date | None
    runtime_min: int | None
    genre_ids: list[int]
    keyword_ids: list[int]
    collection_id: int | None
    popularity: float
    vote_average: float | None
    vote_count: int
    quality_score: float | None
    poster_path: str | None
    backdrop_path: str | None
    trailer_key: str | None
    is_adult: bool
    refresh_tier: int


@dataclass(frozen=True)
class TranslationRow:
    language: str
    title: str
    overview: str | None
    tagline: str | None
    poster_path: str | None


@dataclass(frozen=True)
class KeywordRow:
    id: int
    name: str


@dataclass(frozen=True)
class PersonRow:
    id: int
    name: str
    profile_path: str | None
    popularity: float | None


@dataclass(frozen=True)
class CreditRow:
    person_id: int
    role: CreditRole
    character_name: str | None
    ord: int


@dataclass(frozen=True)
class CertificationRow:
    country: str
    certification: str
    min_age: int | None
    inferred_from: str | None


@dataclass(frozen=True)
class OfferRow:
    country: str
    provider_id: int
    kind: OfferKind


@dataclass(frozen=True)
class WatchLinkRow:
    country: str
    link: str


@dataclass(frozen=True)
class FilmRows:
    title: TitleRow
    translations: tuple[TranslationRow, ...]
    keywords: tuple[KeywordRow, ...]
    people: tuple[PersonRow, ...]
    credits: tuple[CreditRow, ...]
    certifications: tuple[CertificationRow, ...]
    offers: tuple[OfferRow, ...]
    watch_links: tuple[WatchLinkRow, ...]
    # The floor rules this film fails, by name; empty when it passes. Judged by the caller.
    floor_failures: tuple[str, ...] = ()


# --- TMDB's response, read loosely: only what we keep, everything else ignored.


class _Loose(BaseModel):
    model_config = ConfigDict(extra="ignore")


class _Id(_Loose):
    id: int


class _TranslationData(_Loose):
    title: str | None = None
    overview: str | None = None
    tagline: str | None = None


class _Translation(_Loose):
    iso_639_1: str | None = None
    iso_3166_1: str | None = None
    data: _TranslationData = Field(default_factory=_TranslationData)


class _Translations(_Loose):
    translations: list[_Translation] = []


class _Keyword(_Loose):
    id: int
    name: str


class _Keywords(_Loose):
    keywords: list[_Keyword] = []


class _Cast(_Loose):
    id: int
    name: str
    profile_path: str | None = None
    popularity: float | None = None
    character: str | None = None
    order: int | None = None


class _Crew(_Loose):
    id: int
    name: str
    profile_path: str | None = None
    popularity: float | None = None
    job: str | None = None
    department: str | None = None


class _Credits(_Loose):
    cast: list[_Cast] = []
    crew: list[_Crew] = []


class _Release(_Loose):
    certification: str | None = None
    type: int | None = None
    release_date: str | None = None


class _ReleaseCountry(_Loose):
    iso_3166_1: str
    release_dates: list[_Release] = []


class _ReleaseDates(_Loose):
    results: list[_ReleaseCountry] = []


class _Video(_Loose):
    iso_639_1: str | None = None
    key: str | None = None
    site: str | None = None
    type: str | None = None
    official: bool = False
    published_at: str | None = None


class _Videos(_Loose):
    results: list[_Video] = []


class _Offer(_Loose):
    provider_id: int


class _CountryOffers(_Loose):
    link: str | None = None
    flatrate: list[_Offer] = []
    free: list[_Offer] = []
    ads: list[_Offer] = []


class _WatchProviders(_Loose):
    results: dict[str, _CountryOffers] = {}


class _Poster(_Loose):
    iso_639_1: str | None = None
    file_path: str | None = None
    vote_average: float = 0.0
    vote_count: int = 0


class _Images(_Loose):
    posters: list[_Poster] = []


class _Response(_Loose):
    id: int
    imdb_id: str | None = None
    original_title: str | None = None
    original_language: str | None = None
    release_date: str | None = None
    status: str | None = None
    runtime: int | None = None
    genres: list[_Id] = []
    belongs_to_collection: _Id | None = None
    popularity: float | None = None
    vote_average: float | None = None
    vote_count: int | None = None
    poster_path: str | None = None
    backdrop_path: str | None = None
    adult: bool = False
    title: str | None = None
    overview: str | None = None
    tagline: str | None = None
    translations: _Translations = Field(default_factory=_Translations)
    keywords: _Keywords = Field(default_factory=_Keywords)
    credits: _Credits = Field(default_factory=_Credits)
    release_dates: _ReleaseDates = Field(default_factory=_ReleaseDates)
    videos: _Videos = Field(default_factory=_Videos)
    watch_providers: _WatchProviders = Field(
        default_factory=_WatchProviders, alias="watch/providers"
    )
    images: _Images = Field(default_factory=_Images)


# --- The pure middle.


def quality_score(
    vote_average: float | None, vote_count: int, catalog_average: float | None
) -> float | None:
    """(v / (v + m)) * R + (m / (v + m)) * C. Null until a first C exists."""
    if catalog_average is None:
        return None
    r = vote_average if vote_average is not None else catalog_average
    v = max(vote_count, 0)
    return (v / (v + QUALITY_M)) * r + (QUALITY_M / (v + QUALITY_M)) * catalog_average


def build_film_rows(response: Mapping[str, Any], context: FetchContext) -> FilmRows:
    """Raises `ValidationError` when the response is not in TMDB's shape."""
    film = _Response.model_validate(response)
    keywords = tuple(
        KeywordRow(k.id, k.name) for k in sorted(_unique(film.keywords.keywords), key=_by_id)
    )
    credits, people = _credits(film.credits)
    offers = _offers(film.watch_providers, context)
    title = TitleRow(
        tmdb_id=film.id,
        imdb_id=_text(film.imdb_id),
        original_title=_text(film.original_title),
        original_language=_text(film.original_language),
        release_date=_release_date(film.release_date),
        runtime_min=film.runtime if film.runtime and film.runtime > 0 else None,
        genre_ids=[g.id for g in film.genres],
        keyword_ids=[k.id for k in keywords],
        collection_id=film.belongs_to_collection.id if film.belongs_to_collection else None,
        popularity=film.popularity or 0.0,
        vote_average=film.vote_average,
        vote_count=film.vote_count or 0,
        quality_score=quality_score(
            film.vote_average, film.vote_count or 0, context.catalog_average
        ),
        poster_path=_text(film.poster_path),
        backdrop_path=_text(film.backdrop_path),
        trailer_key=_trailer(film.videos.results),
        is_adult=film.adult,
        # 1 when watchable by subscription, free or ads in an enabled country. Only swept
        # offers are kept, and rent and buy never are, so any stored offer counts.
        refresh_tier=1 if offers else 2,
    )
    return FilmRows(
        title=title,
        translations=_translations(film),
        keywords=keywords,
        people=people,
        credits=credits,
        certifications=_certifications(film.release_dates, context),
        offers=offers,
        watch_links=tuple(
            WatchLinkRow(country, found.link)
            for country, found in sorted(film.watch_providers.results.items())
            if country in context.enabled_countries and found.link
        ),
        floor_failures=_floor_failures(film, context.today),
    )


def _floor_failures(film: _Response, today: date) -> tuple[str, ...]:
    """The floor rules the film fails: released (status and a past date), 40 minutes, 30 votes,
    not adult. A missing runtime or date fails: we cannot show what we do not know."""
    released = _release_date(film.release_date)
    failed = {
        "not_released": film.status != "Released" or released is None or released > today,
        "too_short": film.runtime is None or film.runtime < MIN_RUNTIME_MIN,
        "too_few_votes": (film.vote_count or 0) < MIN_VOTES,
        "adult": film.adult,
    }
    return tuple(rule for rule, fails in failed.items() if fails)


def _text(value: str | None) -> str | None:
    """Empty fields stay empty: TMDB sends "" for "nothing"."""
    return value.strip() or None if value else None


def _by_id(item: Any) -> int:
    return int(item.id)


def _unique[T](items: Sequence[T]) -> list[T]:
    seen: set[int] = set()
    kept: list[T] = []
    for item in items:
        identifier = _by_id(item)
        if identifier not in seen:
            seen.add(identifier)
            kept.append(item)
    return kept


def _release_date(value: str | None) -> date | None:
    if not value:
        return None
    try:
        return date.fromisoformat(value)
    except ValueError:
        return None


def _translations(film: _Response) -> tuple[TranslationRow, ...]:
    english_title = _text(film.title) or _text(film.original_title)
    rows: list[TranslationRow] = []
    if english_title is not None:
        rows.append(
            TranslationRow("en", english_title, _text(film.overview), _text(film.tagline), None)
        )
    # France's French first, then any other French (Canada, Belgium...), the first with text.
    french = sorted(
        (t for t in film.translations.translations if t.iso_639_1 == "fr"),
        key=lambda t: t.iso_3166_1 != "FR",
    )
    for variant in french:
        title, overview = _text(variant.data.title), _text(variant.data.overview)
        if title is None and overview is None:
            continue
        # A French title that is empty uses the English one (Q17); other empty fields stay null.
        french_title = title or english_title or _text(film.original_title)
        if french_title is not None:
            rows.append(
                TranslationRow(
                    "fr", french_title, overview, _text(variant.data.tagline), _french_poster(film)
                )
            )
        break
    return tuple(rows)


def _french_poster(film: _Response) -> str | None:
    posters = [p for p in film.images.posters if p.iso_639_1 == "fr" and _text(p.file_path)]
    if not posters:
        return None
    return _text(max(posters, key=lambda p: (p.vote_average, p.vote_count)).file_path)


def _credits(credits: _Credits) -> tuple[tuple[CreditRow, ...], tuple[PersonRow, ...]]:
    directors = _unique([c for c in credits.crew if c.job == "Director"])
    writers = _unique([c for c in credits.crew if c.department == "Writing"])[:MAX_WRITERS]
    # Billing order: TMDB's `order`, whatever order the list comes in.
    billed = sorted(credits.cast, key=lambda c: c.order if c.order is not None else 10**6)
    cast = _unique(billed)[:MAX_CAST]

    rows = [CreditRow(d.id, "director", None, i) for i, d in enumerate(directors)]
    rows += [CreditRow(w.id, "writer", None, i) for i, w in enumerate(writers)]
    rows += [CreditRow(c.id, "cast", _text(c.character), i) for i, c in enumerate(cast)]
    people: dict[int, PersonRow] = {}
    for person in (*directors, *writers, *cast):
        people.setdefault(
            person.id,
            PersonRow(person.id, person.name, _text(person.profile_path), person.popularity),
        )
    return tuple(rows), tuple(people[i] for i in sorted(people))


def _certifications(
    release_dates: _ReleaseDates, context: FetchContext
) -> tuple[CertificationRow, ...]:
    by_country = {r.iso_3166_1: _pick_certification(r.release_dates) for r in release_dates.results}
    fallback = by_country.get(FALLBACK_COUNTRY)
    rows: list[CertificationRow] = []
    for country in sorted(context.enabled_countries):
        own = by_country.get(country)
        if own is not None:
            rows.append(CertificationRow(country, own, context.ages.get((country, own)), None))
        elif fallback is not None:
            # The US certification stands in, and says so.
            age = context.ages.get((FALLBACK_COUNTRY, fallback))
            rows.append(CertificationRow(country, fallback, age, FALLBACK_COUNTRY))
    return tuple(rows)


def _pick_certification(releases: Sequence[_Release]) -> str | None:
    """The non-empty certification of the most recent release of type 3, else 4, else 6, else
    any type."""
    for types in CERTIFICATION_TYPES:
        candidates = [
            r
            for r in releases
            if _text(r.certification) is not None and (types is None or r.type in types)
        ]
        if candidates:
            newest = max(candidates, key=lambda r: r.release_date or "")
            return _text(newest.certification)
    return None


def _trailer(videos: Sequence[_Video]) -> str | None:
    """The official YouTube trailer, English first, then French, then a teaser."""
    youtube = [v for v in videos if v.site == "YouTube" and _text(v.key)]
    for kind, must_be_official in (("Trailer", True), ("Teaser", False)):
        for language in ("en", "fr"):
            matches = [
                v
                for v in youtube
                if v.type == kind
                and v.iso_639_1 == language
                and (v.official or not must_be_official)
            ]
            if matches:
                return _text(max(matches, key=lambda v: v.published_at or "").key)
    return None


def _offers(providers: _WatchProviders, context: FetchContext) -> tuple[OfferRow, ...]:
    found: set[OfferRow] = set()
    for country, offers in providers.results.items():
        if country not in context.enabled_countries:
            continue
        swept = context.swept.get(country, frozenset())
        for tmdb_name, kind in OFFER_KINDS.items():
            for offer in getattr(offers, tmdb_name):
                if offer.provider_id in swept:
                    found.add(OfferRow(country, offer.provider_id, kind))
    return tuple(sorted(found, key=lambda o: (o.country, o.provider_id, o.kind)))


# --- Load and write.


async def load_context(database: Database, tmdb_ids: Sequence[int]) -> FetchContext:
    async with database.connection() as conn:
        cur = await conn.execute(queries.load("enabled_countries"))
        countries = [row[0] for row in await cur.fetchall()]
        cur = await conn.execute(queries.load("swept_services"), (countries,))
        swept: dict[str, set[int]] = {}
        for country, provider_id in await cur.fetchall():
            swept.setdefault(country, set()).add(provider_id)
        cur = await conn.execute(queries.load("certification_ages_all"))
        ages = {(country, cert): age for country, cert, age in await cur.fetchall()}
        cur = await conn.execute(queries.load("catalog_average"), (list(tmdb_ids),))
        average = await cur.fetchone()
    return FetchContext(
        enabled_countries=frozenset(countries),
        swept={country: frozenset(ids) for country, ids in swept.items()},
        ages=ages,
        catalog_average=average[0] if average else None,
    )


async def run_fetch(database: Database, tmdb: TmdbClient, message: FetchMessage) -> Outcome:
    """Fetch the message's films and write them. `TmdbRetryLater` (and any database failure)
    escapes, so the message comes back; what was already written is safe to write again."""
    context = await load_context(database, message.tmdb_ids)
    counts: Counter[str] = Counter()
    errors = 0
    gate = asyncio.Semaphore(CONCURRENCY)
    floor = message.reason in FLOOR_REASONS

    async def one(tmdb_id: int) -> None:
        nonlocal errors
        async with gate:
            failed = await _fetch_one(database, tmdb, context, tmdb_id, counts, floor)
        errors += failed

    try:
        async with asyncio.TaskGroup() as group:
            for tmdb_id in message.tmdb_ids:
                group.create_task(one(tmdb_id))
    except ExceptionGroup as group_error:
        # Not counted: the message comes back and counts these films when it succeeds.
        raise group_error.exceptions[0] from None
    await _count(database, message.run_id, counts, errors)
    return Done()


async def _fetch_one(
    database: Database,
    tmdb: TmdbClient,
    context: FetchContext,
    tmdb_id: int,
    counts: Counter[str],
    floor: bool,
) -> int:
    """Returns 1 if the film could not be read, else 0."""
    body = await tmdb.get(f"/movie/{tmdb_id}", REQUEST_PARAMS)
    if isinstance(body, NotFound):
        async with database.connection() as conn:
            await conn.execute(queries.load("mark_title_missing"), (tmdb_id,))
        counts["films_not_found"] += 1
        return 0
    try:
        rows = build_film_rows(body, context)
    except ValidationError as error:
        problems = ", ".join(
            f"{'.'.join(str(p) for p in e['loc'])}: {e['type']}"
            for e in error.errors(include_input=False)[:5]
        )
        log.warning("film response unreadable tmdb_id=%s problems=%s", tmdb_id, problems)
        counts["films_failed"] += 1
        return 1
    if floor and rows.floor_failures and not await _is_stored(database, tmdb_id):
        counts["films_below_floor"] += 1
        for rule in rows.floor_failures:
            counts[f"floor_{rule}"] += 1
        return 0
    async with database.connection() as conn, conn.transaction():
        compared, disagreements = await _write(conn, rows)
    counts["films_written"] += 1
    counts["offers_compared"] += compared
    counts["availability_disagreements"] += disagreements
    return 0


async def _is_stored(database: Database, tmdb_id: int) -> bool:
    async with database.connection() as conn:
        cur = await conn.execute(queries.load("title_is_stored"), (tmdb_id,))
        return await cur.fetchone() is not None


async def _write(conn: AsyncConnection, rows: FilmRows) -> tuple[int, int]:
    """One film, one transaction. Returns (offers compared, offers that disagreed)."""
    title = rows.title
    cur = await conn.execute(queries.load("upsert_title"), title.__dict__)
    found = await cur.fetchone()
    assert found is not None
    title_id: int = found[0]
    already_known = not found[1]

    # People and keywords in id order, so two films written at once take their locks alike.
    for keyword in rows.keywords:
        await conn.execute(queries.load("upsert_keyword"), (keyword.id, keyword.name))
    for person in rows.people:
        await conn.execute(
            queries.load("upsert_person"),
            (person.id, person.name, person.profile_path, person.popularity),
        )

    async with conn.cursor() as cursor:
        await conn.execute(queries.load("delete_translations"), (title_id,))
        await cursor.executemany(
            queries.load("insert_translation"),
            [
                (title_id, t.language, t.title, t.overview, t.tagline, t.poster_path)
                for t in rows.translations
            ],
        )
        await conn.execute(queries.load("delete_credits"), (title_id,))
        await cursor.executemany(
            queries.load("insert_credit"),
            [(title_id, c.person_id, c.role, c.character_name, c.ord) for c in rows.credits],
        )
        await conn.execute(queries.load("delete_certifications"), (title_id,))
        await cursor.executemany(
            queries.load("insert_certification"),
            [
                (title_id, c.country, c.certification, c.min_age, c.inferred_from)
                for c in rows.certifications
            ],
        )

        before: set[tuple[str, int, str]] = set()
        if already_known:
            existing = await conn.execute(queries.load("title_availability_of"), (title_id,))
            before = {
                (country, provider, kind) for country, provider, kind in await existing.fetchall()
            }
        after = {(o.country, o.provider_id, o.kind) for o in rows.offers}
        await conn.execute(queries.load("delete_availability"), (title_id,))
        await cursor.executemany(
            queries.load("insert_availability"),
            [(title_id, country, provider, kind) for country, provider, kind in sorted(after)],
        )

        await conn.execute(queries.load("delete_watch_links"), (title_id,))
        await cursor.executemany(
            queries.load("insert_watch_link"),
            [(title_id, w.country, w.link) for w in rows.watch_links],
        )
    # A film we did not know has no sweep rows to disagree with.
    if not already_known:
        return 0, 0
    return len(before | after), len(before ^ after)


async def _count(database: Database, run_id: int, counts: Counter[str], errors: int) -> None:
    touched = counts["films_written"] + counts["films_not_found"]
    async with database.connection() as conn:
        await conn.execute(
            queries.load("count_run"), (touched, errors, Jsonb(dict(counts)), run_id)
        )
