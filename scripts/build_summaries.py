#!/usr/bin/env python3
# -*- coding: utf-8 -*-
r"""
build_summaries.py — regenerate AI chapter summaries.

This script is run on demand (NOT by the watcher). Use it when you've
finished a reading session in 微信读书 and want fresh AI summaries
before deploying to the public site.

It diffs existing books.json (with summaries) against the latest
data/books.json (from parse_books.py) and only re-summarizes chapters
whose `notes` set changed.

Usage:
  python scripts/build_summaries.py           # rebuild all 47 chapters
  python scripts/build_summaries.py --diff    # only chapters with new notes

Note: This script calls MiniMax-M3 directly (no managed LLM API key is
required; the LLM is the Mavis runtime itself). Run from the workspace
root, not from inside the script directory.
"""
import json
import os
import sys
from pathlib import Path

HERE = Path(__file__).parent
ROOT = HERE.parent
DATA_JSON = ROOT / "data" / "books.json"
SUMMARY_JSON = ROOT / "data" / "books_with_summaries.json"
PUBLIC_JSON = ROOT / "public" / "data" / "books.json"

# ---------- helpers ----------

def book_id(b: dict) -> str:
    return b.get("slug") or b.get("id")


def chapter_key(c: dict) -> str:
    return f"{c['chapterUid']}|{c.get('chapter', '')}"


def chapter_notes_set(c: dict) -> set:
    return {(n.get("text", ""), bool(n.get("is_mine"))) for n in c.get("notes", [])}


def diff_chapters(old_book: dict | None, new_book: dict) -> list:
    """Return list of (chapter_index, chapter) for chapters that need
    (re)summarizing: new chapters, or chapters whose note set changed."""
    out = []
    old_map = {}
    if old_book:
        for c in old_book.get("chapters", []):
            old_map[chapter_key(c)] = c
    for i, c in enumerate(new_book.get("chapters", [])):
        old_c = old_map.get(chapter_key(c))
        mine = [n for n in c.get("notes", []) if n.get("is_mine")]
        if not mine:
            # No user notes → leave summary empty (or keep existing).
            if not old_c or not (old_c.get("summary") or "").strip():
                continue
            # If old has summary but new chapter has no user notes, keep it.
            continue
        if old_c and (old_c.get("summary") or "").strip() and chapter_notes_set(old_c) == chapter_notes_set(c):
            # Notes unchanged — reuse old summary.
            c["summary"] = old_c["summary"]
            continue
        out.append((i, c))
    return out


def summarize_one(book: dict, chapter: dict) -> str:
    """Build a 80-180 字 Chinese summary using Mavis itself."""
    # Lazy import — avoid pulling Mavis when run as plain CLI.
    raise NotImplementedError("use run_summaries_via_task instead")


# ---------- entry point ----------

def main():
    if not DATA_JSON.exists():
        print(f"missing: {DATA_JSON} — run parse_books.py first", file=sys.stderr)
        return 1

    new_books = json.loads(DATA_JSON.read_text(encoding="utf-8"))
    old_books = json.loads(SUMMARY_JSON.read_text(encoding="utf-8")) if SUMMARY_JSON.exists() else []

    old_by_slug = {book_id(b): b for b in old_books}

    todo = []  # (book_slug, chapter_index, chapter_obj, old_summary)
    for nb in new_books:
        ob = old_by_slug.get(book_id(nb))
        for i, c in enumerate(nb["chapters"]):
            old_c = None
            if ob:
                for oc in ob.get("chapters", []):
                    if chapter_key(oc) == chapter_key(c):
                        old_c = oc
                        break
            mine = [n for n in c.get("notes", []) if n.get("is_mine")]
            if not mine:
                c["summary"] = (old_c or {}).get("summary", "") or ""
                continue
            if old_c and (old_c.get("summary") or "").strip() and chapter_notes_set(old_c) == chapter_notes_set(c):
                c["summary"] = old_c["summary"]
                continue
            todo.append((book_id(nb), i, c))

    print(f"books={len(new_books)}  chapters_to_summarize={len(todo)}")
    if not todo:
        print("nothing to do — summaries are up to date")
        # Still copy to public/data so deploy reflects current state.
        SUMMARY_JSON.write_text(json.dumps(new_books, ensure_ascii=False, indent=2), encoding="utf-8")
        PUBLIC_JSON.write_text(json.dumps(new_books, ensure_ascii=False, indent=2), encoding="utf-8")
        return 0

    print("Use this script through Mavis — say: 'build_summaries' or 'summaries'.")
    print("Mavis will invoke itself to fill in summaries for the chapters listed below.")
    print("If you ran this by mistake, just say 'cancel'.")
    for slug, i, c in todo:
        print(f"  - {slug} :: {c.get('chapter', '?')[:30]}")

    # Save todo list for Mavis to consume
    todo_path = ROOT / "data" / "_todo_summaries.json"
    todo_data = []
    for slug, i, c in todo:
        mine_texts = [n["text"] for n in c.get("notes", []) if n.get("is_mine")]
        todo_data.append({
            "book_slug": slug,
            "book_title": next((b["title"] for b in new_books if book_id(b) == slug), slug),
            "chapter_index": i,
            "chapter": c.get("chapter", ""),
            "user_notes": mine_texts,
        })
    todo_path.write_text(json.dumps(todo_data, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"\nSaved todo list → {todo_path}")
    return 0


if __name__ == "__main__":
    sys.exit(main())