#!/usr/bin/env python3
# -*- coding: utf-8 -*-
r"""
watcher.py — Watch the Obsidian vault for book-note changes and rebuild
books.json in real time.

Pipeline:
  Obsidian vault/*.md  →  parse_books.py  →  data/books.json
                                       \→  public/data/books.json (live)

Usage:
  python scripts/watcher.py

Notes:
  - Only watches the vault root (no recursion) and ignores dotfiles.
  - Debounces bursts of file events (e.g. multi-line writes) by 2s.
  - Does NOT regenerate AI summaries. Run scripts/build_summaries.py
    separately when you want fresh summaries, then say "deploy".
  - Does NOT push to the public website. The site is rebuilt locally;
    run /deploy-website when you want to publish the new JSON.
"""
import os
import shutil
import subprocess
import sys
import time
import json
from pathlib import Path

from watchdog.events import FileSystemEventHandler
from watchdog.observers import Observer

VAULT = Path(r"C:\Users\MR\Documents\Obsidian Vault")
HERE = Path(__file__).parent
ROOT = HERE.parent
PARSE_SCRIPT = HERE / "parse_books.py"
DATA_JSON = ROOT / "data" / "books.json"
SUMMARY_JSON = ROOT / "data" / "books_with_summaries.json"
PUBLIC_JSON = ROOT / "public" / "data" / "books.json"
LOG_FILE = ROOT / "data" / "watcher.log"

DEBOUNCE_S = 2.0


def log(msg: str) -> None:
    line = f"[{time.strftime('%Y-%m-%d %H:%M:%S')}] {msg}"
    print(line, flush=True)
    try:
        with LOG_FILE.open("a", encoding="utf-8") as f:
            f.write(line + "\n")
    except Exception:
        pass


def merge_summaries() -> tuple[int, int]:
    """Merge existing AI summaries from SUMMARY_JSON into DATA_JSON in place.

    Returns (total_chapters, chapters_with_summary).
    """
    if not SUMMARY_JSON.exists():
        return 0, 0
    books = json.loads(DATA_JSON.read_text(encoding="utf-8"))
    summary_books = json.loads(SUMMARY_JSON.read_text(encoding="utf-8"))

    def _key(b): return b.get("slug") or b.get("id")
    def _ckey(c): return f"{c.get('chapterUid','')}|{c.get('chapter','')}"

    by_slug = {_key(b): b for b in summary_books}
    total = 0
    with_sum = 0
    for b in books:
        sb = by_slug.get(_key(b))
        if not sb:
            continue
        sm = {_ckey(c): c.get("summary", "") for c in sb.get("chapters", [])}
        for c in b.get("chapters", []):
            total += 1
            existing = sm.get(_ckey(c), "")
            if existing.strip():
                c["summary"] = existing
                with_sum += 1
            else:
                c["summary"] = ""
    DATA_JSON.write_text(json.dumps(books, ensure_ascii=False, indent=2), encoding="utf-8")
    return total, with_sum


def rebuild() -> None:
    log("change detected → rebuilding books.json")
    try:
        result = subprocess.run(
            [sys.executable, str(PARSE_SCRIPT)],
            capture_output=True, text=True,
            encoding="utf-8", errors="replace",
            cwd=str(ROOT), timeout=30,
        )
        if result.returncode != 0:
            log(f"  parse FAILED: {result.stderr.strip()[:200]}")
            return
        total, with_sum = merge_summaries()
        PUBLIC_JSON.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy(DATA_JSON, PUBLIC_JSON)
        size_kb = PUBLIC_JSON.stat().st_size // 1024
        log(f"  ok → public/data/books.json ({size_kb} KB, {with_sum}/{total} chapters with summary)")

        # Write "chapters that still need an AI summary" todo for Mavis to fill in.
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
        if todo:
            (DATA_JSON.parent / "_todo_summaries.json").write_text(
                json.dumps(todo, ensure_ascii=False, indent=2),
                encoding="utf-8",
            )
            log(f"  {len(todo)} chapter(s) need AI summary → _todo_summaries.json")
        else:
            # clear stale todo if everything got filled
            (DATA_JSON.parent / "_todo_summaries.json").write_text("[]", encoding="utf-8")
            log("  no new chapter needs AI summary")

        # Write deploy trigger OUTSIDE public/ so it doesn't ship to the website.
        # Mavis auto-deploy reads this and in-place updates the deployed site.
        flag = ROOT / ".deploy_pending"
        flag.write_text(
            json.dumps({
                "ts": time.time(),
                "size_kb": size_kb,
                "todo_count": len(todo),
            }, ensure_ascii=False),
            encoding="utf-8",
        )
        log(f"  deploy trigger written → {flag}")
    except Exception as e:
        log(f"  error: {e}")


class MdHandler(FileSystemEventHandler):
    def __init__(self):
        self.last_ts = 0.0
        self.pending = False

    def on_modified(self, event):
        if event.is_directory:
            return
        if not event.src_path.lower().endswith(".md"):
            return
        rel = os.path.relpath(event.src_path, str(VAULT))
        if rel.startswith(".") or os.sep in rel:
            # ignore dotfile dirs (.obsidian/.trash) and any subdir
            return
        self.pending = True
        self.last_ts = time.time()

    def on_created(self, event):
        self.on_modified(event)


def main() -> int:
    if not VAULT.exists():
        log(f"vault not found: {VAULT}")
        return 1
    log(f"watching: {VAULT}")
    log(f"output:   {PUBLIC_JSON}")
    log(f"debounce: {DEBOUNCE_S}s · Ctrl+C to stop")
    log(f"log file: {LOG_FILE}")
    log("")

    handler = MdHandler()
    observer = Observer()
    observer.schedule(handler, str(VAULT), recursive=False)
    observer.start()

    try:
        # Initial rebuild so public/data/books.json is fresh on startup.
        rebuild()
        while True:
            time.sleep(0.2)
            if handler.pending and (time.time() - handler.last_ts) > DEBOUNCE_S:
                handler.pending = False
                rebuild()
    except KeyboardInterrupt:
        log("stopping...")
    finally:
        observer.stop()
        observer.join()
    return 0


if __name__ == "__main__":
    sys.exit(main())