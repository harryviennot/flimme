"""The local seed and the reference job must live in one database (M2.9).

`genres.slug` is unique. The seed's genres have made-up ids but readable slugs, and the
reference job adds TMDB's genres with a slug from their English name. A seed slug equal to
one of those would make `reference_weekly` (and so `server backfill`, the local catalog
seeder) fail on a seeded database. So every seed slug carries a `seed_` prefix.

The list below is TMDB's movie genre names: identifiers, not content.
"""

import re
from pathlib import Path

from server.catalog.reference import slugify

TMDB_GENRE_NAMES = (
    "Action",
    "Adventure",
    "Animation",
    "Comedy",
    "Crime",
    "Documentary",
    "Drama",
    "Family",
    "Fantasy",
    "History",
    "Horror",
    "Music",
    "Mystery",
    "Romance",
    "Science Fiction",
    "TV Movie",
    "Thriller",
    "War",
    "Western",
)

SEED = Path(__file__).parents[3] / "supabase" / "seed.sql"


def seed_slugs() -> list[str]:
    text = SEED.read_text(encoding="utf-8")
    block = text.split("insert into public.genres", 1)[1].split(";", 1)[0]
    return re.findall(r"\(\s*\d+\s*,\s*'([a-z_]+)'", block)


def test_the_seed_has_its_twelve_genres():
    assert len(seed_slugs()) == 12


def test_no_seed_genre_slug_equals_one_the_reference_job_will_make():
    taken = {slugify(name) for name in TMDB_GENRE_NAMES}

    assert taken.isdisjoint(seed_slugs())


def test_every_seed_genre_slug_is_prefixed_so_a_new_tmdb_genre_cannot_collide():
    assert all(slug.startswith("seed_") for slug in seed_slugs())
