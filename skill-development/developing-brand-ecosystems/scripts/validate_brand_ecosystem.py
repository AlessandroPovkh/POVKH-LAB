#!/usr/bin/env python3
"""Configurable read-only static checks for a brand/product ecosystem."""

from __future__ import annotations

import argparse
import json
import re
from pathlib import Path
from urllib.parse import unquote, urlparse


IGNORED_DIRS = {".git", ".hg", ".svn", ".venv", "venv", "node_modules", "dist", "build", "coverage", "__pycache__"}
TEXT_SUFFIXES = {".md", ".html", ".htm", ".txt", ".json", ".csv", ".xml", ".svg", ".js", ".mjs", ".ts", ".tsx", ".css"}
FONT_SUFFIXES = {".ttf", ".otf", ".woff", ".woff2"}
LICENSE_WORDS = ("license", "licence", "ofl", "copyright")
LINK_RE = re.compile(r"(?<!!)\[[^\]]*\]\(([^)]+)\)")


def finding(severity: str, code: str, path: str, message: str) -> dict:
    return {"severity": severity, "code": code, "path": path, "message": message}


def iter_files(root: Path):
    for path in sorted(root.rglob("*")):
        if path.is_file() and not any(part in IGNORED_DIRS for part in path.relative_to(root).parts):
            yield path


def read_text(path: Path) -> str | None:
    try:
        return path.read_text(encoding="utf-8")
    except (OSError, UnicodeDecodeError):
        return None


def package_qa_commands(root: Path) -> set[str]:
    commands: set[str] = set()
    for path in iter_files(root):
        if path.name != "package.json":
            continue
        try:
            package = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, UnicodeDecodeError, json.JSONDecodeError):
            continue
        prefix = "npm" if path.parent == root else f"npm --prefix {path.parent.relative_to(root).as_posix()}"
        for name in package.get("scripts", {}):
            commands.add(f"{prefix} test" if name == "test" else f"{prefix} run {name}")
    return commands


def validate(root: Path, config: dict) -> dict:
    root = root.expanduser().resolve()
    if not root.is_dir():
        raise ValueError(f"Project root is not a directory: {root}")
    findings: list[dict] = []

    for required in sorted(config.get("required_paths", [])):
        if not (root / required).exists():
            findings.append(finding("error", "missing-required-path", required, "Required path does not exist"))

    for path in iter_files(root):
        rel = path.relative_to(root).as_posix()
        if path.suffix.lower() == ".md":
            text = read_text(path) or ""
            for raw_target in LINK_RE.findall(text):
                target = raw_target.strip().split(" ", 1)[0].strip("<>")
                parsed = urlparse(target)
                if parsed.scheme or target.startswith(("#", "/")):
                    continue
                local = (path.parent / unquote(parsed.path)).resolve()
                if parsed.path and not local.exists():
                    findings.append(finding("error", "broken-local-link", rel, f"Missing link target: {target}"))

    patterns = [re.compile(pattern, re.IGNORECASE) for pattern in config.get("placeholder_patterns", [])]
    for public_rel in sorted(config.get("public_paths", [])):
        public_path = root / public_rel
        candidates = [public_path] if public_path.is_file() else list(iter_files(public_path)) if public_path.is_dir() else []
        for path in candidates:
            if path.suffix.lower() not in TEXT_SUFFIXES:
                continue
            text = read_text(path)
            if text is None:
                continue
            for pattern in patterns:
                if pattern.search(text):
                    findings.append(finding("error", "public-placeholder", path.relative_to(root).as_posix(), f"Public output matches placeholder pattern: {pattern.pattern}"))
                    break

    for font_rel in sorted(config.get("font_paths", [])):
        font_root = root / font_rel
        if not font_root.exists():
            continue
        for font in sorted(path for path in font_root.rglob("*") if path.is_file() and path.suffix.lower() in FONT_SUFFIXES):
            nearby = [candidate for candidate in font.parent.iterdir() if candidate.is_file() and any(word in candidate.name.lower() for word in LICENSE_WORDS)]
            if not nearby:
                findings.append(finding("error", "missing-font-license", font.relative_to(root).as_posix(), "No license declaration found beside font"))

    known_commands = package_qa_commands(root) | set(config.get("declared_qa_commands", []))
    for command in sorted(config.get("required_qa_commands", [])):
        if command not in known_commands:
            findings.append(finding("error", "missing-qa-command", "package.json", f"Required QA command is not declared: {command}"))

    findings.sort(key=lambda item: (item["severity"], item["code"], item["path"], item["message"]))
    summary = {
        "errors": sum(item["severity"] == "error" for item in findings),
        "warnings": sum(item["severity"] == "warning" for item in findings),
    }
    return {"schema_version": 1, "root": str(root), "summary": summary, "findings": findings}


def render(report: dict, output_format: str) -> str:
    if output_format == "json":
        return json.dumps(report, ensure_ascii=False, indent=2, sort_keys=True) + "\n"
    lines = ["# Brand ecosystem validation", "", f"Errors: {report['summary']['errors']}  ", f"Warnings: {report['summary']['warnings']}", ""]
    if not report["findings"]:
        lines.append("PASS — no configured violations found.")
    else:
        lines.extend(f"- **{item['severity'].upper()} {item['code']}** `{item['path']}` — {item['message']}" for item in report["findings"])
    return "\n".join(lines) + "\n"


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("root", type=Path, help="Project root to validate")
    parser.add_argument("--config", type=Path, help="JSON validation configuration")
    parser.add_argument("--format", choices=("json", "markdown"), default="markdown")
    parser.add_argument("--output", type=Path, help="Write the report here; otherwise print to stdout")
    args = parser.parse_args()
    try:
        config = json.loads(args.config.read_text(encoding="utf-8")) if args.config else {}
        report = validate(args.root, config)
    except (ValueError, OSError, json.JSONDecodeError) as error:
        parser.error(str(error))
    text = render(report, args.format)
    if args.output:
        args.output.parent.mkdir(parents=True, exist_ok=True)
        args.output.write_text(text, encoding="utf-8")
    else:
        print(text, end="")
    return 1 if report["summary"]["errors"] else 0


if __name__ == "__main__":
    raise SystemExit(main())
