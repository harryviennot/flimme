"""The placeholder maker (M2.8). Images are generated here; nothing is downloaded."""

import io

import httpx
import pytest
from PIL import Image

from server.catalog.placeholders import IMAGE_BASE, Posters, thumbhash

pytestmark = pytest.mark.anyio
PINNED = "HQgOFRRhaHB4V4eId4aXZxePAPS4"  # for the gradient below, with the locked Pillow


def poster_bytes(width: int = 92, height: int = 138, shift: int = 0) -> bytes:
    """A synthetic poster: a diagonal gradient, so the hash has something to say."""
    image = Image.new("RGB", (width, height))
    for x in range(width):
        for y in range(height):
            image.putpixel((x, y), ((x * 3 + shift) % 256, (y * 2) % 256, (x + y) % 256))
    out = io.BytesIO()
    image.save(out, format="PNG")
    return out.getvalue()


def test_a_generated_image_gives_a_stable_hash():
    first = thumbhash(poster_bytes())
    assert thumbhash(poster_bytes()) == first
    assert first == PINNED
    assert thumbhash(poster_bytes(shift=90)) != first


def test_bytes_that_are_no_image_raise_a_value_error():
    with pytest.raises(ValueError):
        thumbhash(b"not an image")


async def test_a_poster_is_fetched_at_w92_and_hashed():
    seen: list[httpx.Request] = []

    def handler(request: httpx.Request) -> httpx.Response:
        seen.append(request)
        return httpx.Response(200, content=poster_bytes())

    posters = Posters(transport=httpx.MockTransport(handler))
    made = await posters.placeholder("/fixture-1.jpg")
    await posters.aclose()

    assert made == thumbhash(poster_bytes())
    assert str(seen[0].url) == f"{IMAGE_BASE}/fixture-1.jpg"
    assert "original" not in str(seen[0].url)


@pytest.mark.parametrize(
    "reply",
    [
        httpx.Response(404),
        httpx.Response(200, content=b"garbage"),
        httpx.ReadTimeout("slow"),
    ],
    ids=["not found", "not an image", "timeout"],
)
async def test_a_failed_download_gives_none(reply: httpx.Response | Exception):
    def handler(request: httpx.Request) -> httpx.Response:
        if isinstance(reply, Exception):
            raise reply
        return reply

    posters = Posters(transport=httpx.MockTransport(handler))
    assert await posters.placeholder("/fixture-1.jpg") is None
    await posters.aclose()
