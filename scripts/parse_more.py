#!/usr/bin/env python3
# -*- coding: utf-8 -*-
r"""
parse_more.py — Parse "more/" Obsidian content → more.json
Source: C:/Users/MR/Documents/Obsidian Vault/more/**/*.md
Output: data/more.json (and mirrored to public/data/more.json)

Every immediate subdirectory of `more/` is a category. The directory
name (e.g. "极客时间", "动手学习小感悟") becomes the category label.
Adding a new subdirectory + .md files in Obsidian is enough — no manual
registration needed.

Markdown is converted to HTML at parse time, so the front-end can
innerHTML it directly without a JS markdown lib.
"""
import json
import re
import sys
from pathlib import Path

import markdown

VAULT_MORE = Path(r"C:\Users\MR\Documents\Obsidian Vault\more")
HERE = Path(__file__).parent
ROOT = HERE.parent
DATA_JSON = ROOT / "data" / "more.json"
PUBLIC_JSON = ROOT / "public" / "data" / "more.json"


def parse_frontmatter(text: str) -> tuple[dict, str]:
    """Extract YAML-ish frontmatter block (between --- markers).

    Returns (metadata_dict, body_text_after_frontmatter).
    """
    m = re.match(r"^---\s*\n(.*?)\n---\s*\n(.*)$", text, re.DOTALL)
    if not m:
        return {}, text
    fm = {}
    for line in m.group(1).splitlines():
        if not line.strip() or line.lstrip().startswith("#"):
            continue
        if ":" not in line:
            continue
        k, _, v = line.partition(":")
        fm[k.strip()] = v.strip().strip('"').strip("'")
    return fm, m.group(2)


def slugify(s: str) -> str:
    """URL-safe slug. Preserves CJK characters (browsers handle them fine)."""
    s = s.strip()
    s = re.sub(r"[\\/:*?\"<>|]+", "-", s)
    s = re.sub(r"\s+", "-", s)
    s = re.sub(r"-+", "-", s)
    return s.strip("-") or "untitled"


def md_to_html(body: str) -> str:
    md = markdown.Markdown(
        extensions=["fenced_code", "tables", "sane_lists", "toc"],
        output_format="html",
    )
    return md.convert(body)


def extract_description(body: str, max_len: int = 120) -> str:
    """Pick the first non-heading paragraph as a short summary."""
    for line in body.splitlines():
        s = line.strip()
        if not s or s.startswith("#") or s.startswith("```"):
            continue
        # strip very light markdown leftovers for the summary preview
        s = re.sub(r"\*\*(.+?)\*\*", r"\1", s)
        s = re.sub(r"\*(.+?)\*", r"\1", s)
        s = re.sub(r"`([^`]+)`", r"\1", s)
        s = re.sub(r"\[(.+?)\]\(.+?\)", r"\1", s)
        if len(s) > max_len:
            s = s[: max_len - 1] + "…"
        return s
    return ""


def fmt_emoji(name: str) -> str:
    """Best-effort emoji from common category keywords."""
    keywords = {
        "极客": "📺", "课程": "📺", "技术": "🛠",
        "感悟": "💭", "思考": "💭", "动手": "✍️", "实操": "✍️",
        "读书": "📚", "笔记": "📝", "项目": "🧪", "demo": "🧪",
        "经验": "🧠", "总结": "🧠", "复盘": "🔁",
        "review": "📖", "geo": "🌍",
    }
    for k, v in keywords.items():
        if k in name:
            return v
    return "📄"


def main() -> int:
    if not VAULT_MORE.exists():
        # No `more/` yet — write empty placeholder so the front-end
        # renders an empty grouped shelf cleanly.
        DATA_JSON.parent.mkdir(parents=True, exist_ok=True)
        DATA_JSON.write_text("[]", encoding="utf-8")
        PUBLIC_JSON.parent.mkdir(parents=True, exist_ok=True)
        PUBLIC_JSON.write_text("[]", encoding="utf-8")
        print(f"[parse_more] {VAULT_MORE} missing → empty placeholder written")
        return 0

    out = []
    # Sort by category name so output is deterministic.
    for cat_dir in sorted(p for p in VAULT_MORE.iterdir() if p.is_dir()):
        category_label = cat_dir.name
        category_key = slugify(category_label)
        articles = []
        for md_file in sorted(cat_dir.glob("*.md")):
            text = md_file.read_text(encoding="utf-8", errors="replace")
            fm, body = parse_frontmatter(text)

            title = (
                fm.get("title")
                or fm.get("标题")
                or md_file.stem
            )
            summary = (
                fm.get("summary")
                or fm.get("简介")
                or fm.get("description")
                or extract_description(body)
            )
            updated = fm.get("updated") or fm.get("date") or fm.get("updatedAt") or ""
            tags = [t.strip() for t in re.split(r"[,，]\s*", (fm.get("tags") or fm.get("tag") or "").strip()) if t.strip()]
            html_body = md_to_html(body)
            stat = md_file.stat()
            articles.append({
                "slug": slugify(md_file.stem),
                "title": title,
                "summary": summary,
                "tags": tags,
                "updatedAt": updated,
                "mtime": int(stat.st_mtime),
                "sizeBytes": stat.st_size,
                "html": html_body,
                "srcPath": str(md_file.relative_to(VAULT_MORE.parent.parent)),
            })
        out.append({
            "category": category_label,
            "categoryKey": category_key,
            "categoryEmoji": fmt_emoji(category_label),
            "articles": articles,
        })

    DATA_JSON.parent.mkdir(parents=True, exist_ok=True)
    DATA_JSON.write_text(
        json.dumps(out, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    PUBLIC_JSON.parent.mkdir(parents=True, exist_ok=True)
    PUBLIC_JSON.write_text(
        json.dumps(out, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    n_cats = len(out)
    n_arts = sum(len(c["articles"]) for c in out)
    size_kb = PUBLIC_JSON.stat().st_size // 1024
    print(f"[parse_more] {n_cats} categories, {n_arts} articles → public/data/more.json ({size_kb} KB)")
    return 0


if __name__ == "__main__":
    sys.exit(main())