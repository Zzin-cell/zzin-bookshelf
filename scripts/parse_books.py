#!/usr/bin/env python3
# -*- coding: utf-8 -*-
r"""
Parse WeRead (微信读书) Obsidian notes -> books.json
Source: C:/Users/MR/Documents/Obsidian Vault/*.md

Resilient parser: handles H2/H3 chapter headers, highlights marked with
📌 / 🔥 / 📌🔥, timestamps ⏱ or 共读 counters, and books with no
explicit chapter headers (falls back to chapterUid grouping).
"""
import json
import re
import sys
from pathlib import Path

VAULT_DIR = Path(r"C:\Users\MR\Documents\Obsidian Vault")
OUTPUT = Path(__file__).parent.parent / "data" / "books.json"


# ---------- frontmatter ----------

def parse_frontmatter(text: str) -> dict:
    m = re.match(r"^---\s*\n(.*?)\n---\s*\n", text, re.DOTALL)
    if not m:
        return {}
    fm = {}
    for line in m.group(1).splitlines():
        if not line.strip() or line.lstrip().startswith("#"):
            continue
        if ":" not in line:
            continue
        k, _, v = line.partition(":")
        fm[k.strip()] = v.strip().strip('"')
    return fm


# ---------- metadata block (简介 / 出版社 / 分类 / 字数 / PC地址) ----------

def parse_metadata(body: str) -> dict:
    meta = {}
    m = re.search(r"# 元数据\s*\n(.*?)(?=# )", body, re.DOTALL)
    if not m:
        return meta
    block = m.group(1)
    field_map = {
        "简介": "summary",
        "出版时间": "publishDate",
        "ISBN": "isbn",
        "字数": "wordCount",
        "分类": "category",
        "出版社": "publisher",
        "PC地址": "pcUrl",
    }
    for line in block.splitlines():
        # Lines are '> - 字段：值'. Strip both the leading '> ' and whitespace.
        stripped = line.lstrip("> ").lstrip()
        for k, v in field_map.items():
            if stripped.startswith(f"- {k}："):
                value = stripped.split("：", 1)[1].strip()
                if value:
                    meta[v] = value
                break
    return meta


# ---------- chapter headers (H2 / H3) within highlights block ----------

H_RE = re.compile(r"^#{2,3}\s+(?P<title>.+?)\s*$")


def collect_chapter_titles(body: str) -> dict[int, tuple]:
    """Return mapping: line_index -> (level, title).

    Scan inside '# 高亮划线' block; H1 ('#') ends it.
    """
    m = re.search(r"# 高亮划线\s*\n", body)
    if not m:
        return {}
    start = m.end()
    out: dict[int, tuple] = {}
    lines = body[start:].splitlines()
    for i, line in enumerate(lines):
        if line.startswith("# ") and not line.startswith("## "):
            break
        h = H_RE.match(line)
        if h:
            level = len(re.match(r"^#+", line).group(0))
            out[i] = (level, h.group("title").strip())
    return out


# ---------- highlight block scan ----------

# Each highlight block begins with a `> [...](weread://...)` line and may have
# additional `> ⏱ timestamp` and/or `> 🔥 N 人共读` / `> 📊 N 人共读` lines.
# Use direct codepoints to avoid surrogate-pair mismatches.
HL_START_RE = re.compile(
    r">\s*[\U0001F4CC\U0001F525]+\s*\[(?P<text>[^\]]*)\]\(<?weread://.*?chapterUid=(?P<uid>\d+).*?\)"
)
TS_RE = re.compile(r">\s*⏱\s*(?P<ts>\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2})")
COUNT_RE = re.compile(r">\s*[\U0001F525\U0001F4CA]\s*\d+\s*人共读")


def parse_highlights(body: str):
    """Return (chapter_titles_in_order, chapters_list).

    chapters_list: [{ chapter: str, chapterUid: int, notes: [{text, ts, ref, count}], index, noteCount }]
    """
    m = re.search(r"# 高亮划线\s*\n", body)
    if not m:
        return [], []
    start = m.end()
    slice_ = body[start:]
    lines = slice_.splitlines()

    # Pass 1: collect chapter headers and their line positions.
    headers = []  # list of (line_idx, title)
    for i, line in enumerate(lines):
        if line.startswith("# ") and not line.startswith("## "):
            # End of highlights block.
            break
        h = H_RE.match(line)
        if h:
            title = h.group("title").strip()
            # Skip generic section headers that are not chapters.
            if title in {"读书笔记", "本书评论", "高亮划线"}:
                continue
            headers.append((i, title))

    # Build chapterUid -> header title map by scanning from the most recent
    # header (so any highlight after header inherits it).
    uid_to_title: dict[int, str] = {}
    cur_title = None
    last_header_line = -1
    header_iter = iter(headers)
    next_header = next(header_iter, None)

    # Pass 2: iterate highlights, attach to most recent header.
    chapters: dict[int, dict] = {}  # chapterUid -> dict
    cur_title_for_uid: dict[int, str] = {}

    # Track which header line we've crossed.
    def header_for_line(line_idx: int) -> str | None:
        nonlocal cur_title, next_header
        while next_header and next_header[0] <= line_idx:
            cur_title = next_header[1]
            next_header = next(header_iter, None)
        return cur_title

    for i, line in enumerate(lines):
        if line.startswith("# ") and not line.startswith("## "):
            break
        cur = header_for_line(i)
        m_start = HL_START_RE.search(line)
        if not m_start:
            continue
        text = m_start.group("text").strip()
        uid = int(m_start.group("uid"))
        ts = ""
        count = 0
        # Look ahead a few lines for ⏱ timestamp and 共读 counter.
        for j in range(i, min(i + 4, len(lines))):
            mt = TS_RE.search(lines[j])
            if mt:
                ts = mt.group("ts").strip()
            mc = COUNT_RE.search(lines[j])
            if mc:
                # extract N
                n_match = re.search(r"(\d+)\s*人共读", lines[j])
                if n_match:
                    count = int(n_match.group(1))
        if uid not in chapters:
            chapters[uid] = {
                "chapterUid": uid,
                "chapter": cur or f"章节 {len(chapters) + 1}",
                "notes": [],
            }
        else:
            # Refine title if we now have a header that this uid inherited.
            if cur and chapters[uid]["chapter"].startswith("章节"):
                chapters[uid]["chapter"] = cur
        chapters[uid]["notes"].append({
            "text": text,
            "ts": ts,
            "count": count,
            "is_mine": bool(ts),  # user note if has timestamp; otherwise crowd-highlight
        })

    # Order: keep chapterUid natural order (1, 2, 3, ...) — that mirrors book
    # reading order for weread.
    ordered = sorted(chapters.values(), key=lambda c: c["chapterUid"])
    for idx, c in enumerate(ordered):
        c["index"] = idx
        c["noteCount"] = len(c["notes"])
    return ordered


# ---------- one book ----------

def parse_one(md_path: Path) -> dict | None:
    text = md_path.read_text(encoding="utf-8")
    fm = parse_frontmatter(text)
    if fm.get("doc_type") != "weread-highlights-reviews":
        return None
    body = text.split("---", 2)[-1]
    meta = parse_metadata(body)
    chapters = parse_highlights(body)
    return {
        "id": fm.get("bookId") or md_path.stem,
        "slug": md_path.stem,
        "title": fm.get("title", ""),
        "author": fm.get("author", ""),
        "cover": fm.get("cover", ""),
        "isbn": fm.get("isbn", ""),
        "category": meta.get("category", ""),
        "publisher": meta.get("publisher", ""),
        "publishDate": meta.get("publishDate", ""),
        "pcUrl": meta.get("pcUrl", ""),
        "summary": meta.get("summary", ""),
        "wordCount": meta.get("wordCount", ""),
        "noteCount": int(fm.get("noteCount", 0) or 0),
        "reviewCount": int(fm.get("reviewCount", 0) or 0),
        "progress": fm.get("progress", ""),
        "readingTime": fm.get("readingTime", ""),
        "readingDate": fm.get("readingDate", ""),
        "lastReadDate": fm.get("lastReadDate", ""),
        "readingStatus": fm.get("readingStatus", ""),
        "chapters": chapters,
    }


def main():
    md_files = sorted(VAULT_DIR.glob("*.md"))
    books = []
    for p in md_files:
        try:
            b = parse_one(p)
            if b:
                books.append(b)
        except Exception as e:
            print(f"[err] {p.name}: {e}", file=sys.stderr)
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_text(json.dumps(books, ensure_ascii=False, indent=2), encoding="utf-8")
    chapter_total = sum(len(b["chapters"]) for b in books)
    notes_total = sum(b["noteCount"] for b in books)
    parsed_notes = sum(sum(c["noteCount"] for c in b["chapters"]) for b in books)
    print(f"books={len(books)}  chapters={chapter_total}  notes_in_files={notes_total}  notes_parsed={parsed_notes}")
    for b in books:
        chs = ", ".join(c["chapter"][:18] for c in b["chapters"][:5])
        print(f"  {b['slug'][:30]:30s}  ch={len(b['chapters']):3d}  notes={b['noteCount']:4d}  | {chs}")


if __name__ == "__main__":
    main()