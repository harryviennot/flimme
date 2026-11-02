"""Our curation of the reference tables: ids and flags only, never TMDB content.

`curation.toml` is applied by the reference job in every environment (decision Q12), because a
migration can't do it: the provider rows only exist once TMDB has filled them. Sections:

- `[countries.XX]`: `enabled` and `language`. The only way a country is ever enabled. It is
  applied every run, so a country switched off by hand while still in the file comes back on.
- `[certification_ages.XX]`: certification -> minimum age (decision Q13). A certification left
  out has no age, so a room with an age cap leaves the film out.
- `[services.XX]`: for one country, the ids of the `listed` services (shown in the picker), the
  `free` ones (count for every room), `variants` (variant id -> its main service id) and an
  optional `order` (service id -> display priority) overriding TMDB's. The reference job only
  applies a country that has this section, so a country without one keeps its flags as they are.
  France's entries come with M2.6.
"""

import tomllib
from pathlib import Path
from typing import Annotated, Self

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, model_validator

CURATION_FILE = Path(__file__).with_name("curation.toml")

type CountryCode = Annotated[str, StringConstraints(pattern=r"^[A-Z]{2}$")]
type MinAge = Annotated[int, Field(ge=0, le=21)]


class _Section(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)


class CountryCuration(_Section):
    enabled: bool
    language: str = Field(min_length=2, max_length=8)


class ServicesCuration(_Section):
    listed: list[int] = []
    free: list[int] = []
    variants: dict[int, int] = {}
    order: dict[int, Annotated[int, Field(ge=0, le=32767)]] = {}

    @model_validator(mode="after")
    def _consistent(self) -> Self:
        if set(self.listed) & set(self.free):
            raise ValueError("a service is either listed or free, not both")
        for child, parent in self.variants.items():
            if child == parent:
                raise ValueError("a variant cannot be its own main service")
            if child in self.listed:
                raise ValueError("a variant is never listed")
        return self


class Curation(_Section):
    countries: dict[CountryCode, CountryCuration] = {}
    certification_ages: dict[CountryCode, dict[str, MinAge]] = {}
    services: dict[CountryCode, ServicesCuration] = {}


def load_curation(path: Path = CURATION_FILE) -> Curation:
    with path.open("rb") as handle:
        return Curation.model_validate(tomllib.load(handle))
