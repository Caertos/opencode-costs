#!/usr/bin/env python3
"""Render a tmux ANSI capture into a PNG (documentation screenshots).

Usage:
  tmux capture-pane -pet <session> > capture.ansi
  python3 scripts/ansi2png.py capture.ansi docs/images/sidebar.png \
      [--cols 96:150] [--rows 0:45]

Only the SGR sequences OpenCode actually emits are supported: reset, bold,
dim, italic, underline, the 16 basic colors, 256-color and truecolor, both for
foreground and background.
"""

from __future__ import annotations

import argparse
import re
from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

FONT_PATH = "/usr/share/fonts/truetype/dejavu/DejaVuSansMono.ttf"
FONT_SIZE = 15
CELL_W = 9
CELL_H = 18
DEFAULT_BG = (8, 8, 8)
DEFAULT_FG = (204, 204, 204)

ANSI_16 = [
    (0, 0, 0), (205, 49, 49), (13, 188, 121), (229, 229, 16),
    (36, 114, 200), (188, 63, 188), (17, 168, 205), (229, 229, 229),
    (102, 102, 102), (241, 76, 76), (35, 209, 139), (245, 245, 67),
    (59, 142, 234), (214, 112, 214), (41, 184, 219), (255, 255, 255),
]

SGR = re.compile(r"\x1b\[([0-9;]*)m")


def color_256(index: int) -> tuple[int, int, int]:
    if index < 16:
        return ANSI_16[index]
    if index < 232:
        level = index - 16
        r = level // 36
        g = (level % 36) // 6
        b = level % 6
        steps = [0, 95, 135, 175, 215, 255]
        return steps[r], steps[g], steps[b]
    gray = 8 + (index - 232) * 10
    return gray, gray, gray


class Cell:
    __slots__ = ("char", "fg", "bg", "bold", "dim", "italic", "underline")

    def __init__(self, char: str = " "):
        self.char = char
        self.fg = DEFAULT_FG
        self.bg = DEFAULT_BG
        self.bold = False
        self.dim = False
        self.italic = False
        self.underline = False


def parse_line(raw: str, state: dict) -> list[Cell]:
    cells: list[Cell] = []
    index = 0
    while index < len(raw):
        match = SGR.match(raw, index)
        if match:
            codes = [int(code) for code in match.group(1).split(";") if code != ""] or [0]
            step = 0
            while step < len(codes):
                code = codes[step]
                if code == 0:
                    state["fg"] = DEFAULT_FG
                    state["bg"] = DEFAULT_BG
                    state["bold"] = state["dim"] = state["italic"] = state["underline"] = False
                elif code == 1:
                    state["bold"] = True
                elif code == 2:
                    state["dim"] = True
                elif code == 3:
                    state["italic"] = True
                elif code == 4:
                    state["underline"] = True
                elif code == 22:
                    state["bold"] = state["dim"] = False
                elif code == 23:
                    state["italic"] = False
                elif code == 24:
                    state["underline"] = False
                elif 30 <= code <= 37:
                    state["fg"] = ANSI_16[code - 30]
                elif code == 39:
                    state["fg"] = DEFAULT_FG
                elif 40 <= code <= 47:
                    state["bg"] = ANSI_16[code - 40]
                elif code == 49:
                    state["bg"] = DEFAULT_BG
                elif 90 <= code <= 97:
                    state["fg"] = ANSI_16[code - 90 + 8]
                elif 100 <= code <= 107:
                    state["bg"] = ANSI_16[code - 100 + 8]
                elif code in (38, 48):
                    target = "fg" if code == 38 else "bg"
                    if step + 1 < len(codes) and codes[step + 1] == 5:
                        state[target] = color_256(codes[step + 2])
                        step += 2
                    elif step + 1 < len(codes) and codes[step + 1] == 2:
                        state[target] = (codes[step + 2], codes[step + 3], codes[step + 4])
                        step += 4
                step += 1
            index = match.end()
            continue

        char = raw[index]
        index += 1
        cell = Cell(char)
        cell.fg = state["fg"]
        cell.bg = state["bg"]
        cell.bold = state["bold"]
        cell.dim = state["dim"]
        cell.italic = state["italic"]
        cell.underline = state["underline"]
        cells.append(cell)
    return cells


def render(lines: list[list[Cell]], cols: slice, rows: slice) -> Image.Image:
    selected = lines[rows]
    width_cells = cols.stop - cols.start if cols.stop else max(len(line) for line in selected)
    height_cells = len(selected)

    image = Image.new("RGB", (width_cells * CELL_W, height_cells * CELL_H), DEFAULT_BG)
    draw = ImageDraw.Draw(image)
    font = ImageFont.truetype(FONT_PATH, FONT_SIZE)
    bold = ImageFont.truetype(FONT_PATH.replace("Mono.ttf", "Mono-Bold.ttf"), FONT_SIZE)
    italic = ImageFont.truetype(FONT_PATH.replace("Mono.ttf", "Mono-Oblique.ttf"), FONT_SIZE)

    for row, line in enumerate(selected):
        for column, cell in enumerate(line[cols]):
            if column >= width_cells:
                break
            x = column * CELL_W
            y = row * CELL_H
            if cell.bg != DEFAULT_BG:
                draw.rectangle([x, y, x + CELL_W, y + CELL_H], fill=cell.bg)
            if cell.char.strip() == "":
                continue
            foreground = cell.fg
            if cell.dim:
                foreground = tuple(int(channel * 0.6) for channel in foreground)
            chosen = bold if cell.bold else italic if cell.italic else font
            draw.text((x, y), cell.char, font=chosen, fill=foreground)
            if cell.underline:
                draw.line([x, y + CELL_H - 2, x + CELL_W, y + CELL_H - 2], fill=foreground)
    return image


def parse_range(value: str | None, total: int) -> slice:
    if not value:
        return slice(0, total)
    start, _, end = value.partition(":")
    return slice(int(start or 0), int(end) if end else total)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("source")
    parser.add_argument("target")
    parser.add_argument("--cols", help="column range as start:end (cells)")
    parser.add_argument("--rows", help="row range as start:end")
    args = parser.parse_args()

    raw_lines = Path(args.source).read_text(encoding="utf-8", errors="replace").splitlines()
    state = {
        "fg": DEFAULT_FG,
        "bg": DEFAULT_BG,
        "bold": False,
        "dim": False,
        "italic": False,
        "underline": False,
    }
    lines = [parse_line(line, state) for line in raw_lines]

    width = max(len(line) for line in lines) if lines else 0
    image = render(lines, parse_range(args.cols, width), parse_range(args.rows, len(lines)))
    target = Path(args.target)
    target.parent.mkdir(parents=True, exist_ok=True)
    image.save(target)
    print(f"wrote {target} ({image.width}x{image.height})")


if __name__ == "__main__":
    main()
