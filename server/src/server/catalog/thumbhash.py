"""ThumbHash encoder, vendored (the encoder only, pure Python apart from Pillow's decoding).

Ported from Evan Wallace's reference implementation, https://github.com/evanw/thumbhash
(`js/thumbhash.js`, `rgbaToThumbHash`), checked against the `thumbhash-python` 1.0.1 port.

MIT License. Copyright (c) 2023 Evan Wallace.
Permission is hereby granted, free of charge, to any person obtaining a copy of this software
and associated documentation files (the "Software"), to deal in the Software without
restriction, including without limitation the rights to use, copy, modify, merge, publish,
distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the
Software is furnished to do so, subject to the following conditions: the above copyright notice
and this permission notice shall be included in all copies or substantial portions of the
Software. THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED,
INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR
PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR
ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE,
ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
"""

import math
from base64 import b64encode

from PIL import Image
from PIL.ImageOps import exif_transpose

MAX_SIDE = 100


def image_to_thumbhash(image: Image.Image) -> str:
    """The base64 thumbhash of a Pillow image (8-bit modes; any size, shrunk to 100 x 100)."""
    rgba = exif_transpose(image).convert("RGBA")
    rgba.thumbnail((MAX_SIDE, MAX_SIDE))
    width, height = rgba.size
    data = rgba.tobytes()
    rgba.close()
    return b64encode(rgba_to_thumbhash(width, height, data)).decode("ascii")


def _round(value: float) -> int:
    """JavaScript's Math.round (halves go up), as in the reference."""
    return math.floor(value + 0.5)


def rgba_to_thumbhash(w: int, h: int, rgba: bytes) -> bytes:
    """The hash of w x h RGBA pixels (at most 100 x 100), row by row."""
    if w > MAX_SIDE or h > MAX_SIDE:
        raise ValueError(f"{w}x{h} does not fit in {MAX_SIDE}x{MAX_SIDE}")
    if len(rgba) != w * h * 4:
        raise ValueError("pixel data does not match the size")
    count = w * h

    # The average colour, weighted by alpha, fills in transparent pixels.
    avg_r = avg_g = avg_b = avg_a = 0.0
    for i in range(count):
        alpha = rgba[i * 4 + 3] / 255
        avg_r += alpha / 255 * rgba[i * 4]
        avg_g += alpha / 255 * rgba[i * 4 + 1]
        avg_b += alpha / 255 * rgba[i * 4 + 2]
        avg_a += alpha
    if avg_a > 0:
        avg_r, avg_g, avg_b = avg_r / avg_a, avg_g / avg_a, avg_b / avg_a

    has_alpha = avg_a < count
    l_limit = 5 if has_alpha else 7
    lx = max(1, _round(l_limit * w / max(w, h)))
    ly = max(1, _round(l_limit * h / max(w, h)))
    lum, p, q, a = ([0.0] * count for _ in range(4))
    for i in range(count):
        alpha = rgba[i * 4 + 3] / 255
        r = avg_r * (1 - alpha) + alpha / 255 * rgba[i * 4]
        g = avg_g * (1 - alpha) + alpha / 255 * rgba[i * 4 + 1]
        b = avg_b * (1 - alpha) + alpha / 255 * rgba[i * 4 + 2]
        lum[i] = (r + g + b) / 3
        p[i] = (r + g) / 2 - b
        q[i] = r - g
        a[i] = alpha

    def encode_channel(channel: list[float], nx: int, ny: int) -> tuple[float, list[float], float]:
        dc = 0.0
        ac: list[float] = []
        scale = 0.0
        for cy in range(ny):
            cx = 0
            while cx * ny < nx * (ny - cy):
                fx = [math.cos(math.pi / w * cx * (x + 0.5)) for x in range(w)]
                f = 0.0
                for y in range(h):
                    fy = math.cos(math.pi / h * cy * (y + 0.5))
                    row = y * w
                    for x in range(w):
                        f += channel[row + x] * fx[x] * fy
                f /= count
                if cx > 0 or cy > 0:
                    ac.append(f)
                    scale = max(scale, abs(f))
                else:
                    dc = f
                cx += 1
        if scale > 0:
            ac = [0.5 + 0.5 / scale * v for v in ac]
        return dc, ac, scale

    l_dc, l_ac, l_scale = encode_channel(lum, max(3, lx), max(3, ly))
    p_dc, p_ac, p_scale = encode_channel(p, 3, 3)
    q_dc, q_ac, q_scale = encode_channel(q, 3, 3)
    a_dc, a_ac, a_scale = encode_channel(a, 5, 5) if has_alpha else (1.0, [], 1.0)

    is_landscape = w > h
    header24 = (
        _round(63 * l_dc)
        | (_round(31.5 + 31.5 * p_dc) << 6)
        | (_round(31.5 + 31.5 * q_dc) << 12)
        | (_round(31 * l_scale) << 18)
        | (int(has_alpha) << 23)
    )
    header16 = (
        (ly if is_landscape else lx)
        | (_round(63 * p_scale) << 3)
        | (_round(63 * q_scale) << 9)
        | (int(is_landscape) << 15)
    )
    out = bytearray([header24 & 255, (header24 >> 8) & 255, header24 >> 16])
    out += bytes([header16 & 255, header16 >> 8])
    if has_alpha:
        out.append(_round(15 * a_dc) | (_round(15 * a_scale) << 4))
    nibbles = [*l_ac, *p_ac, *q_ac, *(a_ac if has_alpha else [])]
    packed = bytearray((len(nibbles) + 1) // 2)
    for index, value in enumerate(nibbles):
        packed[index // 2] |= _round(15 * value) << ((index & 1) * 4)
    return bytes(out + packed)
