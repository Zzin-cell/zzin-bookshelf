#!/usr/bin/env python3
# -*- coding: utf-8 -*-
r"""
daily_sync.py — run once: re-parse Obsidian vault, refresh public data, and
write the deploy trigger so Mavis pushes the public site on the next turn.

Use this from Windows Task Scheduler (e.g. daily at 02:00) to guarantee that
edits made while watcher.py is not running still get picked up. The watcher
itself is real-time but only runs while the window is open; this script is
the safety net.

Run interactively:    python scripts\daily_sync.py
Run once (same):      python scripts\watcher.py --once

This script:
  1. Runs parse_books.py to rebuild data/books.json
  2. Merges existing AI summaries into the new books.json
  3. Copies data/books.json to public/data/books.json
  4. Writes data/_todo_summaries.json (chapters still needing AI summary)
  5. Writes .deploy_pending in project root (Mavis will deploy on next turn)
  6. Logs a single line to data/watcher.log

It does NOT itself push to the public website — that's still Mavis's job,
triggered the next time the user talks to Mavis. This keeps the deploy
publish action a deliberate, confirmable human step.
"""
import json
import shutil
import subprocess
import sys
import time
from datetime import datetime
from pathlib import Path

HERE = Path(__file__).parent
ROOT = HERE.parent
PARSE_SCRIPT = HERE / "parse_books.py"
DATA_JSON = ROOT / "data" / "books.json"
SUMMARY_JSON = ROOT / "data" / "books_with_summaries.json"
TODO_JSON = ROOT / "data" / "_todo_summaries.json"
PUBLIC_JSON = ROOT / "public" / "data" / "books.json"
TRIGGER = ROOT / ".deploy_pending"
LOG = ROOT / "data" / "watcher.log"


def log(msg: str) -> None:
    line = f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] [daily_sync] {msg}"
    print(line, flush=True)
    try:
        with LOG.open("a", encoding="utf-8") as f:
            f.write(line + "\n")
    except Exception:
        pass


def merge_summaries() -> tuple[int, int]:
    if not SUMMARY_JSON.exists():
        return 0, 0
    books = json.loads(DATA_JSON.read_text(encoding="utf-8"))
    sums = json.loads(SUMMARY_JSON.read_text(encoding="utf-8"))
    def key(b): return b.get("slug") or b.get("id")
    def ckey(c): return f"{c.get('chapterUid','')}|{c.get('chapter','')}"
    by_slug = {key(b): b for b in sums}
    total = with_sum = 0
    for b in books:
        sb = by_slug.get(key(b))
        if not sb: continue
        sm = {ckey(c): c.get("summary", "") for c in sb.get("chapters", [])}
        for c in b.get("chapters", []):
            total += 1
            s = sm.get(ckey(c), "")
            c["summary"] = s
            if s.strip(): with_sum += 1
    DATA_JSON.write_text(json.dumps(books, ensure_ascii=False, indent=2), encoding="utf-8")
    return total, with_sum


def find_pending_summaries() -> list:
    books = json.loads(DATA_JSON.read_text(encoding="utf-8"))
    todo = []
    for b in books:
        for c in b.get("chapters", []):
            mine = [n for n in c.get("notes", []) if n.get("is_mine")]
            if mine and not (c.get("summary") or "").strip():
                todo.append({
                    "book_slug": b.get("slug"),
                    "book_title": b.get("title"),
                    "chapter_index": c.get("index"),
                    "chapter": c.get("chapter"),
                    "notes": [n.get("text", "") for n in mine],
                })
    return todo


def main() -> int:
    log("daily sync starting")

    # 1) re-parse
    log("  parsing vault → data/books.json")
    res = subprocess.run(
        [sys.executable, str(PARSE_SCRIPT)],
        capture_output=True, text=True, encoding="utf-8", errors="replace",
        cwd=str(ROOT), timeout=60,
    )
    if res.returncode != 0:
        log(f"  parse FAILED: {res.stderr.strip()[:200]}")
        return 1

    # 2) merge AI summaries
    total, with_sum = merge_summaries()
    log(f"  summaries: {with_sum}/{total}")

    # 3) copy to public
    PUBLIC_JSON.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy(DATA_JSON, PUBLIC_JSON)
    size_kb = PUBLIC_JSON.stat().st_size // 1024
    log(f"  copied to public/data/books.json ({size_kb} KB)")

    # 4) write todo list for Mavis
    todo = find_pending_summaries()
    TODO_JSON.write_text(json.dumps(todo, ensure_ascii=False, indent=2), encoding="utf-8")
    if todo:
        log(f"  {len(todo)} chapter(s) waiting for AI summary → {TODO_JSON.name}")
    else:
        log("  no new chapter needs AI summary")

    # 5) write deploy trigger
    TRIGGER.write_text(
        json.dumps({"ts": time.time(), "size_kb": size_kb, "src": "daily-sync"}, ensure_ascii=False),
        encoding="utf-8",
    )
    log(f"  deploy trigger written → {TRIGGER.name}")

    log("done. Mavis will deploy on the next turn (or run 'deploy' to push now).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
