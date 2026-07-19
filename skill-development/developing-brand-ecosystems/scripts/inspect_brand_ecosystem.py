#!/usr/bin/env python3
"""Read-only inventory of a brand/product project."""

from __future__ import annotations

import argparse
import json
from pathlib import Path
from typing import Iterable


IGNORED_DIRS = {".git", ".hg", ".svn", ".venv", "venv", "node_modules", "dist", "build", "coverage", "__pycache__"}
FONT_SUFFIXES = {".ttf", ".otf", ".woff", ".woff2"}
NORMATIVE_WORDS = ("brand-guide", "brand_guide", "brand guide", "design-system", "design_system", "style-guide", "guidelines")
MANIFEST_NAMES = {"package.json", "package-lock.json", "pyproject.toml", "requirements.txt", "cargo.toml", "go.mod", "composer.json"}
LICENSE_WORDS = ("license", "licence", "ofl", "copyright")


def iter_files(root: Path) -> Iterable[Path]:
    for path in sorted(root.rglob("*")):
        if not path.is_file():
            continue
        if any(part in IGNORED_DIRS for part in path.relative_to(root).parts):
            continue
        yield path


def relative(path: Path, root: Path) -> str:
    return path.relative_to(root).as_posix()


def qa_commands(root: Path, files: list[Path]) -> list[str]:
    commands: set[str] = set()
    for path in files:
        if path.name != "package.json":
            continue
        try:
            package = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, UnicodeDecodeError, json.JSONDecodeError):
            continue
        prefix = "npm" if path.parent == root else f"npm --prefix {relative(path.parent, root)}"
        for name in sorted(package.get("scripts", {})):
            if name in {"test", "qa", "check", "lint"} or name.startswith(("test:", "qa:", "check:")):
                commands.add(f"{prefix} run {name}" if name != "test" else f"{prefix} test")
    return sorted(commands)


def detect_touchpoints(rel_files: list[str]) -> list[str]:
    joined = "\n".join(rel_files).lower()
    rules = {
        "digital-product": ("site/", "website", "src/", "app/", "index.html"),
        "identity": ("logo", "brand-guide", "design-system", "tokens"),
        "content-campaign": ("campaign", "content", "editorial", "copy-deck"),
        "media": ("motion", "video", "photo", "audio", "sonic"),
        "physical": ("packaging", "print", "merch", "dieline", "physical"),
        "operations": ("onboarding", "dashboard", "raci", "workflow", "operations"),
    }
    return sorted(name for name, needles in rules.items() if any(needle in joined for needle in needles))


def inspect(root: Path) -> dict:
    root = root.expanduser().resolve()
    if not root.is_dir():
        raise ValueError(f"Project root is not a directory: {root}")
    files = list(iter_files(root))
    rel_files = [relative(path, root) for path in files]
    normative = [rel for rel in rel_files if any(word in rel.lower() for word in NORMATIVE_WORDS)]
    manifests = [rel for rel in rel_files if Path(rel).name.lower() in MANIFEST_NAMES]
    fonts = []
    for path in files:
        if path.suffix.lower() not in FONT_SUFFIXES:
            continue
        nearby = [candidate for candidate in path.parent.iterdir() if candidate.is_file() and any(word in candidate.name.lower() for word in LICENSE_WORDS)]
        fonts.append({"path": relative(path, root), "license_status": "declared-nearby" if nearby else "missing-nearby"})
    report = {
        "schema_version": 1,
        "root": str(root),
        "files": rel_files,
        "normative_sources": normative,
        "dependency_manifests": manifests,
        "fonts": sorted(fonts, key=lambda item: item["path"]),
        "touchpoint_signals": detect_touchpoints(rel_files),
        "qa_commands": qa_commands(root, files),
    }
    return report


def render(report: dict, output_format: str) -> str:
    if output_format == "json":
        return json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True) + "\n"
    lines = ["# Brand ecosystem inventory", "", f"Root: `{report['root']}`", ""]
    for key, title in (
        ("normative_sources", "Normative sources"),
        ("dependency_manifests", "Dependency manifests"),
        ("touchpoint_signals", "Touchpoint signals"),
        ("qa_commands", "QA commands"),
    ):
        lines.extend([f"## {title}", ""])
        values = report[key]
        lines.extend([f"- `{value}`" for value in values] or ["- None detected"])
        lines.append("")
    lines.extend(["## Fonts", ""])
    lines.extend([f"- `{item['path']}` — {item['license_status']}" for item in report["fonts"]] or ["- None detected"])
    return "\n".join(lines) + "\n"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("root", type=Path, help="Project root to inspect")
    parser.add_argument("--format", choices=("json", "markdown"), default="markdown")
    parser.add_argument("--output", type=Path, help="Write the report here; otherwise print to stdout")
    args = parser.parse_args()
    try:
        text = render(inspect(args.root), args.format)
    except ValueError as error:
        parser.error(str(error))
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(text, encoding="utf-8")
    else:
        print(text, end="")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
