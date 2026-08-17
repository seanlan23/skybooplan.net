#!/usr/bin/env python3
"""Facebook profile + cover: plane + name, one product line. No AI tagline."""

from __future__ import annotations

from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path(__file__).resolve().parent.parent
OUT_PUBLIC = ROOT / "public"
OUT_DESKTOP = Path.home() / "Desktop" / "Skybooplan-objave-14-dni" / "fb-stran"
FONT_BOLD = ROOT / "public" / "fonts" / "DejaVuSans-Bold.ttf"
FONT = ROOT / "public" / "fonts" / "DejaVuSans.ttf"

SKY = (14, 165, 233)
SKY_DARK = (2, 132, 199)
SKY_DEEP = (3, 105, 161)
BOO = (125, 211, 252)
WHITE = (255, 255, 255)
SOFT = (224, 242, 254)


def sky_bg(w: int, h: int) -> Image.Image:
    xs = np.linspace(0, 1, w, dtype=np.float32)[None, :, None]
    ys = np.linspace(0, 1, h, dtype=np.float32)[:, None, None]
    tl = np.array(SKY_DEEP, dtype=np.float32)
    tr = np.array(SKY, dtype=np.float32)
    bl = np.array(SKY_DARK, dtype=np.float32)
    br = np.array(SKY, dtype=np.float32)
    rgb = (1 - ys) * (1 - xs) * tl + (1 - ys) * xs * tr + ys * (1 - xs) * bl + ys * xs * br
    img = Image.fromarray(rgb.astype(np.uint8))
    flare = Image.new("L", (w, h), 0)
    fd = ImageDraw.Draw(flare)
    fd.ellipse((-int(w * 0.15), -int(h * 0.55), int(w * 0.45), int(h * 0.55)), fill=70)
    flare = flare.filter(ImageFilter.GaussianBlur(80))
    img = Image.composite(Image.new("RGB", (w, h), WHITE), img, flare)
    return img


def draw_plane(draw: ImageDraw.ImageDraw, cx: float, cy: float, size: float, fill=WHITE) -> None:
    s = size / 48.0

    def P(*xy: float) -> list[tuple[float, float]]:
        pts = list(zip(xy[::2], xy[1::2]))
        return [(cx + (x - 24) * s, cy + (y - 24) * s) for x, y in pts]

    draw.polygon(P(8, 36, 40, 8, 40, 24), fill=fill)
    draw.polygon(P(8, 36, 40, 24, 22, 36), fill=(236, 254, 255) if fill == WHITE else fill)
    draw.polygon(P(22, 36, 40, 24, 40, 38), fill=(186, 230, 253) if fill == WHITE else fill)


def profile_clean() -> Image.Image:
    s = 1080
    img = sky_bg(s, s)
    draw = ImageDraw.Draw(img)
    draw_plane(draw, s / 2, 400, 320)
    bold = ImageFont.truetype(str(FONT_BOLD), 72)
    light = ImageFont.truetype(str(FONT), 72)
    parts = [("sky", bold, WHITE), ("boo", light, SOFT), ("plan", bold, WHITE)]
    total = sum(draw.textlength(t, font=f) for t, f, _ in parts)
    x = (s - total) / 2
    y = 610
    for text, font, color in parts:
        draw.text((x, y), text, font=font, fill=color)
        x += draw.textlength(text, font=font)
    tag = ImageFont.truetype(str(FONT_BOLD), 34)
    tag_text = "From. To. When."
    tw = draw.textlength(tag_text, font=tag)
    draw.text(((s - tw) / 2, 710), tag_text, font=tag, fill=SOFT)
    return img


def _clouds(img: Image.Image) -> None:
    w, h = img.size
    layer = Image.new("L", (w, h), 0)
    d = ImageDraw.Draw(layer)
    blobs = [
        (-80, h - 90, 280, h + 80),
        (120, h - 70, 520, h + 90),
        (400, h - 50, 820, h + 70),
        (900, h - 80, 1280, h + 60),
        (1180, h - 55, 1640, h + 80),
    ]
    for box in blobs:
        d.ellipse(box, fill=90)
    layer = layer.filter(ImageFilter.GaussianBlur(18))
    img.paste(Image.new("RGB", (w, h), WHITE), (0, 0), layer)


def _card(base: Image.Image, xy: tuple[int, int], size: tuple[int, int], title: str, sub: str) -> None:
    x, y = xy
    w, h = size
    shadow = Image.new("RGBA", base.size, (0, 0, 0, 0))
    sd = ImageDraw.Draw(shadow)
    sd.rounded_rectangle((x + 6, y + 8, x + w + 6, y + h + 8), 18, fill=(3, 80, 130, 50))
    shadow = shadow.filter(ImageFilter.GaussianBlur(6))
    base.alpha_composite(shadow)
    draw = ImageDraw.Draw(base)
    draw.rounded_rectangle((x, y, x + w, y + h), 18, fill=WHITE)
    title_f = ImageFont.truetype(str(FONT_BOLD), 26)
    sub_f = ImageFont.truetype(str(FONT), 18)
    draw.text((x + 22, y + 22), title, font=title_f, fill=SKY_DEEP)
    draw.text((x + 22, y + 58), sub, font=sub_f, fill=SKY_DARK)


def cover() -> Image.Image:
    w, h = 1640, 624
    img = sky_bg(w, h)
    _clouds(img)
    img = img.convert("RGBA")
    draw = ImageDraw.Draw(img)

    draw_plane(draw, 200, 210, 150)
    name_size = 62
    bold = ImageFont.truetype(str(FONT_BOLD), name_size)
    light = ImageFont.truetype(str(FONT), name_size)
    x, y = 300, 118
    for text, font, color in (("sky", bold, WHITE), ("boo", light, SOFT), ("plan", bold, WHITE)):
        draw.text((x, y), text, font=font, fill=color)
        x += draw.textlength(text, font=font)

    line = ImageFont.truetype(str(FONT_BOLD), 38)
    sub = ImageFont.truetype(str(FONT), 24)
    url = ImageFont.truetype(str(FONT_BOLD), 22)
    draw.text((300, 200), "From. To. When.", font=line, fill=WHITE)
    draw.text((300, 258), "Days, map, PDF. Free.", font=sub, fill=SOFT)
    draw.text((300, 330), "skybooplan.com", font=url, fill=WHITE)

    # Route into the cards (right half — away from profile crop)
    draw.line([(520, 390), (780, 210), (980, 250)], fill=(255, 255, 255, 160), width=3)
    for px, py in ((520, 390), (780, 210), (980, 250)):
        draw.ellipse((px - 7, py - 7, px + 7, py + 7), fill=WHITE)

    _card(img, (860, 88), (340, 100), "From  →  To", "You type it. We build it.")
    _card(img, (980, 220), (340, 100), "Days + map", "A day plan. Not 31 pins.")
    _card(img, (860, 352), (340, 100), "PDF in a minute", "No account. Free.")

    return img.convert("RGB")


def main() -> None:
    OUT_PUBLIC.mkdir(parents=True, exist_ok=True)
    OUT_DESKTOP.mkdir(parents=True, exist_ok=True)
    prof = profile_clean()
    cov = cover()
    for folder in (OUT_PUBLIC, OUT_DESKTOP):
        prof.save(folder / "skybooplan-fb-profile.png", "PNG", optimize=True)
        cov.save(folder / "skybooplan-fb-cover.png", "PNG", optimize=True)
    print(f"Profil: {OUT_DESKTOP / 'skybooplan-fb-profile.png'}")
    print(f"Glava:  {OUT_DESKTOP / 'skybooplan-fb-cover.png'}")
    print("Isto tudi v public/")


if __name__ == "__main__":
    main()
