#!/usr/bin/env python3
"""
Webslinger build script.

- Bundles ESM source modules into a single drop-in browser file (IIFE global).
- Optionally minifies with terser (preferred) or a conservative Python fallback.
- Writes versioned outputs into repo root:
    webslinger.<version>.js
    webslinger.<version>.min.js

Optionally updates "latest" pointers:
    webslinger.js
    webslinger.min.js
"""

from __future__ import annotations

import argparse
import datetime as dt
import re
import shutil
import subprocess
from pathlib import Path
from typing import Dict, List, Set, Tuple


IMPORT_RE = re.compile(
    r"""^\s*import\s+(?P<what>.+?)\s+from\s+['"](?P<path>\.\/.*?|\.\.\/.*?[^'"]+)['"]\s*;\s*$"""
)

SIDE_EFFECT_IMPORT_RE = re.compile(
    r"""^\s*import\s+['"](?P<path>\.\/.*?|\.\.\/.*?[^'"]+)['"]\s*;\s*$"""
)

EXPORT_DEFAULT_RE = re.compile(r"^\s*export\s+default\s+", re.MULTILINE)
EXPORT_NAMED_RE = re.compile(r"^\s*export\s+(?=(class|function|const|let|var)\b)", re.MULTILINE)
EXPORT_BRACE_RE = re.compile(r"^\s*export\s*{[^}]*}\s*;\s*$", re.MULTILINE)


def read_text(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def write_text(path: Path, content: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(content, encoding="utf-8", newline="\n")


def terser_available() -> bool:
    if shutil.which("terser"):
        return True
    if shutil.which("npx"):
        try:
            subprocess.run(
                ["npx", "--yes", "terser", "--version"],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                check=True,
            )
            return True
        except Exception:
            return False
    return False


def run_terser(input_path: Path, output_path: Path) -> None:
    if shutil.which("terser"):
        cmd = ["terser", str(input_path), "--compress", "--mangle", "--output", str(output_path)]
    else:
        cmd = ["npx", "--yes", "terser", str(input_path), "--compress", "--mangle", "--output", str(output_path)]
    subprocess.run(cmd, check=True)


def python_light_minify(js: str) -> str:
    """
    Conservative minifier:
      - preserves /*! ... */ banners
      - removes block comments (non-banners)
      - removes most // comments
      - collapses whitespace and some token-adjacent spaces

    Not as strong as terser, but safe for typical library code.
    """
    banner_placeholders: List[str] = []

    def _banner_repl(match: re.Match) -> str:
        banner_placeholders.append(match.group(0))
        return f"__BANNER_{len(banner_placeholders) - 1}__"

    js = re.sub(r"/\*![\s\S]*?\*/", _banner_repl, js)
    js = re.sub(r"/\*[\s\S]*?\*/", "", js)
    js = re.sub(r"(^|\s)//[^\n\r]*", r"\1", js, flags=re.MULTILINE)

    js = re.sub(r"[ \t]+", " ", js)
    js = re.sub(r"\s*\n\s*", "\n", js)

    js = re.sub(r"\s*([=+\-*/%<>!&|?:,;{}()\[\]])\s*", r"\1", js)

    for i, banner in enumerate(banner_placeholders):
        js = js.replace(f"__BANNER_{i}__", banner)

    return js.strip() + "\n"


def build_banner(name: str, version: str) -> str:
    date_str = dt.datetime.utcnow().strftime("%Y-%m-%d")
    return f"/*! {name} v{version} | {date_str} | MIT License */\n"


def resolve_import(from_file: Path, import_path: str) -> Path:
    target = (from_file.parent / import_path).resolve()
    if target.suffix == "":
        target = target.with_suffix(".js")
    return target


def strip_esm_syntax(source: str) -> str:
    """
    Remove ESM syntax in a way that's compatible with this library style:
      - remove import lines
      - convert `export default X;` -> `X;` by stripping `export default`
      - convert `export class/func/const ...` -> `class/func/const ...`
      - remove `export { ... };` re-export lines

    Note: This is intentionally simple and assumes your modules do not
    rely on ESM-only semantics beyond imports/exports.
    """
    lines = source.splitlines()
    kept: List[str] = []
    for line in lines:
        if IMPORT_RE.match(line) or SIDE_EFFECT_IMPORT_RE.match(line):
            continue
        kept.append(line)
    out = "\n".join(kept)

    out = EXPORT_BRACE_RE.sub("", out)
    out = EXPORT_DEFAULT_RE.sub("", out)
    out = EXPORT_NAMED_RE.sub("", out)

    return out.strip() + "\n"


def collect_dependency_graph(entry_file: Path) -> List[Path]:
    """
    Returns a list of files in dependency order (deps first, entry last).
    """
    adjacency: Dict[Path, List[Path]] = {}
    visited: Set[Path] = set()

    def walk(file_path: Path) -> None:
        file_path = file_path.resolve()
        if file_path in visited:
            return
        visited.add(file_path)

        src = read_text(file_path)
        deps: List[Path] = []

        for line in src.splitlines():
            m = IMPORT_RE.match(line)
            if m:
                dep_path = resolve_import(file_path, m.group("path"))
                deps.append(dep_path)
                continue
            m2 = SIDE_EFFECT_IMPORT_RE.match(line)
            if m2:
                dep_path = resolve_import(file_path, m2.group("path"))
                deps.append(dep_path)
                continue

        adjacency[file_path] = deps
        for dep in deps:
            if not dep.exists():
                raise FileNotFoundError(f"Missing dependency: {dep} (imported from {file_path})")
            walk(dep)

    walk(entry_file)

    temp: Set[Path] = set()
    perm: Set[Path] = set()
    ordered: List[Path] = []

    def visit(n: Path) -> None:
        if n in perm:
            return
        if n in temp:
            raise RuntimeError(f"Circular dependency detected at: {n}")
        temp.add(n)
        for d in adjacency.get(n, []):
            visit(d)
        temp.remove(n)
        perm.add(n)
        ordered.append(n)

    visit(entry_file)
    return ordered


def bundle_iife(ordered_files: List[Path], repo_root: Path, global_name: str, version: str) -> str:
    banner = build_banner("webslinger", version)
    parts: List[str] = [banner, "(function(global){\n'use strict';\n"]

    for f in ordered_files:
        rel = f.relative_to(repo_root).as_posix()
        src = read_text(f)
        body = strip_esm_syntax(src)
        parts.append(f"\n/* --- {rel} --- */\n{body}")

    parts.append(f"\n// Public global export\nglobal.{global_name}=Webslinger;\n")
    parts.append("})(typeof window!=='undefined'?window:globalThis);\n")

    return "".join(parts).strip() + "\n"


def main() -> int:
    parser = argparse.ArgumentParser(description="Build Webslinger single-file dist outputs.")

    parser.add_argument(
        "--entry",
        default="src/core.js",
        help="Entry point JS file (default: src/core.js)",
    )
    parser.add_argument(
        "--version",
        required=True,
        help="Version string, e.g. 0.1.0",
    )
    parser.add_argument(
        "--global_name",
        default="Webslinger",
        help="Global name for IIFE export (default: Webslinger)",
    )
    parser.add_argument(
        "--update_latest",
        action="store_true",
        help="Update webslinger.js and webslinger.min.js to point to this version",
    )
    parser.add_argument(
        "--no_terser",
        action="store_true",
        help="Disable terser even if available",
    )

    args = parser.parse_args()

    repo_root = Path(__file__).resolve().parent.parent
    entry_file = (repo_root / args.entry).resolve()

    if not entry_file.exists():
        raise FileNotFoundError(f"Entry file not found: {entry_file}")

    ordered_files = collect_dependency_graph(entry_file)

    bundled = bundle_iife(
        ordered_files=ordered_files,
        repo_root=repo_root,
        global_name=args.global_name,
        version=args.version,
    )

    out_js = repo_root / f"webslinger.{args.version}.js"
    out_min = repo_root / f"webslinger.{args.version}.min.js"

    write_text(out_js, bundled)

    use_terser = (not args.no_terser) and terser_available()

    if use_terser:
        try:
            run_terser(out_js, out_min)
        except Exception:
            write_text(out_min, python_light_minify(bundled))
    else:
        write_text(out_min, python_light_minify(bundled))

    if args.update_latest:
        write_text(repo_root / "webslinger.js", read_text(out_js))
        write_text(repo_root / "webslinger.min.js", read_text(out_min))

    print("Build complete:")
    print(f"  {out_js.name}")
    print(f"  {out_min.name}")
    if args.update_latest:
        print("  Updated webslinger.js and webslinger.min.js")
    print(f"  Minifier: {'terser' if use_terser else 'python_light_minify'}")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
