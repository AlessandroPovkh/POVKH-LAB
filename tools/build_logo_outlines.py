#!/usr/bin/env python3
"""Build deterministic, portable Terminal Relic SVG logo masters.

All runtime lettering is converted to paths. The supplied ornament remains the
single geometry source; fonts and ``fontTools`` are build-time dependencies.
"""

from __future__ import annotations

import argparse
from html import escape
from pathlib import Path
import re
from typing import Dict, List, Optional


ROOT = Path(__file__).resolve().parents[1]
DISPLAY_FONT_PATH = ROOT / "assets/fonts/BarlowCondensed-Black.ttf"
MONO_FONT_PATH = ROOT / "assets/fonts/IBMPlexMono-SemiBold.ttf"
ORNAMENT_SOURCE = ROOT / "logo-concepts/terminal-relic/source/ornament-original.svg"
DEFAULT_OUTPUT = ROOT / "assets/logo"

VOID = "#080808"
BONE = "#F2EFE7"
SIGNAL = "#F32222"
WHITE = "#FFFFFF"

ORNAMENT_WIDTH = 2199
ORNAMENT_HEIGHT = 1257

MANAGED_FILES = (
    "povkh-lab-primary-dark-outlined.svg",
    "povkh-lab-primary-light-outlined.svg",
    "povkh-lab-mono-dark-outlined.svg",
    "povkh-lab-mono-light-outlined.svg",
    "povkh-lab-horizontal-dark-outlined.svg",
    "povkh-lab-compact-dark-outlined.svg",
    "povkh-lab-compact-light-outlined.svg",
    "povkh-lab-primary-reverse-transparent-outlined.svg",
    "povkh-lab-primary-dark-transparent-outlined.svg",
    "povkh-lab-mono-white-transparent-outlined.svg",
    "povkh-lab-mono-black-transparent-outlined.svg",
    "povkh-lab-horizontal-reverse-transparent-outlined.svg",
    "povkh-lab-compact-reverse-transparent-outlined.svg",
    "povkh-lab-ascii-dark-outlined.svg",
    "povkh-lab-ascii-reverse-transparent-outlined.svg",
)


def read_ornament_path() -> str:
    if not ORNAMENT_SOURCE.is_file():
        raise SystemExit(f"Ornament source not found: {ORNAMENT_SOURCE}")
    source = ORNAMENT_SOURCE.read_text(encoding="utf-8")
    if 'viewBox="0 0 2199 1257"' not in source:
        raise SystemExit("Ornament source viewBox changed; review the approved geometry before rebuilding")
    match = re.search(r'<path\b[^>]*\bd="([^"]+)"', source)
    if not match:
        raise SystemExit("Ornament source contains no path geometry")
    return match.group(1)


def build_documents() -> Dict[str, str]:
    try:
        from fontTools.pens.svgPathPen import SVGPathPen
        from fontTools.pens.transformPen import TransformPen
        from fontTools.ttLib import TTFont
    except ModuleNotFoundError as error:
        if error.name and error.name.split(".")[0] == "fontTools":
            raise SystemExit(
                "Missing build dependency 'fontTools'. Run: "
                "python3 -m pip install -r tools/requirements.txt"
            ) from error
        raise

    for font_path in (DISPLAY_FONT_PATH, MONO_FONT_PATH):
        if not font_path.is_file():
            raise SystemExit(f"Source font not found: {font_path}")

    ornament_d = read_ornament_path()
    display_font = TTFont(DISPLAY_FONT_PATH, lazy=False, recalcBBoxes=False, recalcTimestamp=False)
    mono_font = TTFont(MONO_FONT_PATH, lazy=False, recalcBBoxes=False, recalcTimestamp=False)

    def font_data(font: TTFont) -> tuple:
        return font.getGlyphSet(), font.getBestCmap() or {}, font["hmtx"], font["head"].unitsPerEm

    display = font_data(display_font)
    mono = font_data(mono_font)

    try:
        def outlined_text(
            data: tuple,
            text: str,
            x: float,
            baseline: float,
            width: float,
            size: float,
            fill: str,
        ) -> str:
            glyph_set, cmap, hmtx, upem = data
            pen = SVGPathPen(glyph_set)
            cursor = 0
            for char in text:
                glyph_name = cmap.get(ord(char))
                if glyph_name is None:
                    raise ValueError(f"Build font has no glyph for {char!r}")
                glyph_set[glyph_name].draw(TransformPen(pen, (1, 0, 0, 1, cursor, 0)))
                cursor += hmtx[glyph_name][0]
            if cursor <= 0:
                raise ValueError(f"Cannot outline empty or zero-width text: {text!r}")
            return (
                f'<path fill="{fill}" d="{pen.getCommands()}" '
                f'transform="translate({x} {baseline}) scale({width / cursor:.8f} {-size / upem:.8f})"/>'
            )

        def ornament(x: float, y: float, width: float, fill: str) -> str:
            scale = width / ORNAMENT_WIDTH
            return (
                f'<path fill="{fill}" d="{ornament_d}" '
                f'transform="translate({x} {y}) scale({scale:.8f})"/>'
            )

        def svg_document(width: int, height: int, title: str, content: str, defs: str = "") -> str:
            safe_title = escape(title, quote=True)
            defs_block = f"\n  <defs>\n    {defs}\n  </defs>" if defs else ""
            return f'''<svg xmlns="http://www.w3.org/2000/svg" width="{width}" height="{height}" viewBox="0 0 {width} {height}" role="img" aria-label="{safe_title}">
  <title>{safe_title}</title>{defs_block}
  {content}
</svg>
'''

        def background(width: int, height: int, colour: Optional[str]) -> List[str]:
            return [f'<rect width="{width}" height="{height}" fill="{colour}"/>'] if colour else []

        def stacked(bg: Optional[str], ink: str, line: str) -> str:
            content = "\n  ".join(
                background(1000, 1000, bg)
                + [
                    ornament(195, 80, 610, ink),
                    f'<rect x="130" y="474" width="740" height="18" fill="{line}"/>',
                    outlined_text(display, "POVKH", 130, 747, 740, 300, ink),
                    outlined_text(display, "LAB", 130, 930, 410, 218, ink),
                ]
            )
            return svg_document(1000, 1000, "POVKH LAB Terminal Relic primary logo", content)

        def horizontal(bg: Optional[str], ink: str, line: str) -> str:
            content = "\n  ".join(
                background(1600, 400, bg)
                + [
                    ornament(60, 61, 480, ink),
                    f'<rect x="586" y="50" width="12" height="300" fill="{line}"/>',
                    outlined_text(display, "POVKH", 660, 232, 820, 222, ink),
                    outlined_text(display, "LAB", 660, 350, 300, 132, ink),
                ]
            )
            return svg_document(1600, 400, "POVKH LAB Terminal Relic horizontal logo", content)

        def compact(bg: Optional[str], ink: str) -> str:
            content = "\n  ".join(
                background(1000, 1000, bg)
                + [ornament(110, 277, 780, ink)]
            )
            return svg_document(1000, 1000, "POVKH LAB Terminal Relic compact mark", content)

        ascii_rows = (
            "0101::PVKH////SIGNAL....LAB::00110010",
            "PVKH_LAB::RELIC/VOID/TRACE::01101001",
            "001101::ARCHIVE////SOURCE::PVKH_LAB",
            "SIGNAL::01001011::ORGANIC::SYSTEM::01",
            "LAB/RELIC/TRACE::::0010110100::PVKH",
            "0100::POVKH_LAB::TERMINAL::RELIC::10",
            "ARCHIVE::SIGNAL::00110101::LAB////01",
            "PVKH::VOID::TRACE::010010110101::LAB",
            "0010////RELIC::SOURCE::POVKH_LAB::11",
            "SYSTEM::ORGANIC::SIGNAL::010101::01",
            "PVKH_LAB::ARCHIVE::TRACE::00110010",
            "011010::RELIC////VOID::SIGNAL::PVKH",
            "LAB::SOURCE::01010101::TERMINAL::01",
            "PVKH_LAB::SIGNAL::RELIC::001101::10",
        )

        def ascii_signature(bg: Optional[str], ink: str, accent: str) -> str:
            mark_x = 70
            mark_y = 50
            mark_width = 850
            scale = mark_width / ORNAMENT_WIDTH
            defs = (
                f'<clipPath id="terminal-relic-clip">'
                f'<path d="{ornament_d}" transform="translate({mark_x} {mark_y}) scale({scale:.8f})"/>'
                f'</clipPath>'
            )
            texture = [
                outlined_text(mono, row, 65, 82 + index * 35, 870, 31, ink)
                for index, row in enumerate(ascii_rows)
            ]
            content = "\n  ".join(
                background(1600, 600, bg)
                + [f'<g clip-path="url(#terminal-relic-clip)">', *texture, "</g>",
                    f'<rect x="995" y="442" width="515" height="10" fill="{accent}"/>',
                    outlined_text(mono, "POVKH_LAB::SIGNAL", 995, 525, 515, 58, ink),
                ]
            )
            return svg_document(1600, 600, "POVKH LAB Terminal Relic ASCII signature", content, defs)

        documents = {
            "povkh-lab-primary-dark-outlined.svg": stacked(VOID, BONE, SIGNAL),
            "povkh-lab-primary-light-outlined.svg": stacked(BONE, VOID, SIGNAL),
            "povkh-lab-mono-dark-outlined.svg": stacked(VOID, BONE, BONE),
            "povkh-lab-mono-light-outlined.svg": stacked(BONE, VOID, VOID),
            "povkh-lab-horizontal-dark-outlined.svg": horizontal(VOID, BONE, SIGNAL),
            "povkh-lab-compact-dark-outlined.svg": compact(VOID, BONE),
            "povkh-lab-compact-light-outlined.svg": compact(BONE, VOID),
            "povkh-lab-primary-reverse-transparent-outlined.svg": stacked(None, BONE, SIGNAL),
            "povkh-lab-primary-dark-transparent-outlined.svg": stacked(None, VOID, SIGNAL),
            "povkh-lab-mono-white-transparent-outlined.svg": stacked(None, WHITE, WHITE),
            "povkh-lab-mono-black-transparent-outlined.svg": stacked(None, VOID, VOID),
            "povkh-lab-horizontal-reverse-transparent-outlined.svg": horizontal(None, BONE, SIGNAL),
            "povkh-lab-compact-reverse-transparent-outlined.svg": compact(None, BONE),
            "povkh-lab-ascii-dark-outlined.svg": ascii_signature(BONE, VOID, SIGNAL),
            "povkh-lab-ascii-reverse-transparent-outlined.svg": ascii_signature(None, BONE, SIGNAL),
        }
        if tuple(documents) != MANAGED_FILES:
            raise RuntimeError("Managed SVG manifest and generator output are out of sync")
        return documents
    finally:
        display_font.close()
        mono_font.close()


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=DEFAULT_OUTPUT,
        help="Destination for generated SVGs (default: assets/logo)",
    )
    parser.add_argument(
        "--check",
        action="store_true",
        help="Verify committed SVGs match a clean rebuild without writing files",
    )
    return parser.parse_args()


def main() -> None:
    args = parse_args()
    output_dir = args.output_dir.expanduser().resolve()
    documents = build_documents()

    if args.check:
        mismatches = []
        for name, expected in documents.items():
            target = output_dir / name
            if not target.is_file() or target.read_text(encoding="utf-8") != expected:
                mismatches.append(name)
        if mismatches:
            raise SystemExit("Outlined SVG rebuild mismatch: " + ", ".join(mismatches))
        print(f"Outlined SVG rebuild check passed: {len(documents)} deterministic masters.")
        return

    output_dir.mkdir(parents=True, exist_ok=True)
    changed = 0
    for name, content in documents.items():
        target = output_dir / name
        if target.is_file() and target.read_text(encoding="utf-8") == content:
            continue
        with target.open("w", encoding="utf-8", newline="\n") as handle:
            handle.write(content)
        changed += 1
    print(f"Generated {len(documents)} outlined SVG masters in {output_dir} ({changed} changed).")


if __name__ == "__main__":
    main()
