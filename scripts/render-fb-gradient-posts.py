#!/usr/bin/env python3
"""Render 14 Facebook-style gradient graphics (image, not native color)."""

from __future__ import annotations

import json
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
OUT_DIR = Path.home() / "Desktop" / "Skybooplan-objave-14-dni"
IMG_DIR = OUT_DIR / "slike"
FONT_BOLD = ROOT / "public" / "fonts" / "DejaVuSans-Bold.ttf"
DATA = ROOT / "scripts" / "social-14-days.json"

W, H = 1080, 1350
PAD_X = 88
# Sampled from Facebook composer screenshot
TL = np.array([145, 63, 224], dtype=np.float32)
TR = np.array([237, 64, 245], dtype=np.float32)
BL = np.array([94, 63, 211], dtype=np.float32)
BR = np.array([185, 63, 233], dtype=np.float32)


def gradient() -> Image.Image:
    xs = np.linspace(0, 1, W, dtype=np.float32)[None, :, None]
    ys = np.linspace(0, 1, H, dtype=np.float32)[:, None, None]
    rgb = (1 - ys) * (1 - xs) * TL + (1 - ys) * xs * TR + ys * (1 - xs) * BL + ys * xs * BR
    return Image.fromarray(rgb.astype(np.uint8))


def wrap(draw: ImageDraw.ImageDraw, text: str, font: ImageFont.FreeTypeFont, max_w: int) -> list[str]:
    lines: list[str] = []
    for para in text.split("\n"):
        if para == "":
            lines.append("")
            continue
        cur = ""
        for word in para.split(" "):
            test = f"{cur} {word}".strip()
            if draw.textlength(test, font=font) <= max_w:
                cur = test
            else:
                if cur:
                    lines.append(cur)
                cur = word
        if cur:
            lines.append(cur)
    return lines


def block_height(lines: list[str], size: int, gap: int) -> int:
    return sum(size if line else size // 2 for line in lines) + gap * max(0, len(lines) - 1)


def render_day(day: dict) -> Path:
    img = gradient()
    draw = ImageDraw.Draw(img)
    max_w = W - PAD_X * 2
    body_size = 44
    cta_size = 52
    gap = 10

    while body_size >= 28:
        body_font = ImageFont.truetype(str(FONT_BOLD), body_size)
        cta_font = ImageFont.truetype(str(FONT_BOLD), cta_size)
        body_lines = wrap(draw, day["graphic"], body_font, max_w)
        cta_lines = wrap(draw, day["cta"], cta_font, max_w)
        body_h = block_height(body_lines, body_size, gap)
        cta_h = block_height(cta_lines, cta_size, 8)
        total = body_h + 48 + cta_h
        if total <= H - 220:
            break
        body_size -= 2
        cta_size = max(36, cta_size - 1)

    y = (H - total) // 2 - 10
    shadow = (40, 20, 80)

    def draw_centered(lines: list[str], font: ImageFont.FreeTypeFont, size: int, line_gap: int) -> int:
        nonlocal y
        for line in lines:
            if line == "":
                y += size // 2
                continue
            x = (W - draw.textlength(line, font=font)) / 2
            draw.text((x + 2, y + 2), line, font=font, fill=shadow)
            draw.text((x, y), line, font=font, fill=(255, 255, 255))
            y += size + line_gap
        return y

    draw_centered(body_lines, body_font, body_size, gap)
    y += 36
    draw_centered(cta_lines, cta_font, cta_size, 8)

    dest = IMG_DIR / f"dan-{day['n']:02d}.png"
    img.save(dest, "PNG", optimize=True)
    return dest


def main() -> None:
    IMG_DIR.mkdir(parents=True, exist_ok=True)
    days = json.loads(DATA.read_text())["days"]
    for day in days:
        path = render_day(day)
        print(f"ok  {path.name}  ·  {day['theme']}")
    print(f"\nSlike: {IMG_DIR}")


if __name__ == "__main__":
    main()
