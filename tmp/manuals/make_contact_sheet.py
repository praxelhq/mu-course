#!/usr/bin/env python3
from __future__ import annotations

import argparse
import re
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont


def page_number(path: Path) -> int:
    match = re.search(r"page-(\d+)\.png$", path.name)
    return int(match.group(1)) if match else 10**9


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("render_dir", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--columns", type=int, default=5)
    args = parser.parse_args()

    pages = sorted(args.render_dir.glob("page-*.png"), key=page_number)
    if not pages:
        raise SystemExit("No page PNGs found")

    thumb_w, thumb_h, label_h, gap = 255, 330, 24, 14
    rows = (len(pages) + args.columns - 1) // args.columns
    sheet = Image.new(
        "RGB",
        (gap + args.columns * (thumb_w + gap), gap + rows * (thumb_h + label_h + gap)),
        "#D9D3C8",
    )
    draw = ImageDraw.Draw(sheet)
    font = ImageFont.load_default()

    for idx, path in enumerate(pages):
        image = Image.open(path).convert("RGB")
        image.thumbnail((thumb_w, thumb_h), Image.Resampling.LANCZOS)
        col, row = idx % args.columns, idx // args.columns
        x = gap + col * (thumb_w + gap) + (thumb_w - image.width) // 2
        y = gap + row * (thumb_h + label_h + gap)
        sheet.paste(image, (x, y))
        label = f"Page {page_number(path)}"
        bbox = draw.textbbox((0, 0), label, font=font)
        tx = gap + col * (thumb_w + gap) + (thumb_w - (bbox[2] - bbox[0])) // 2
        draw.text((tx, y + thumb_h + 5), label, fill="#1E3A35", font=font)

    args.output.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(args.output, optimize=True)


if __name__ == "__main__":
    main()

