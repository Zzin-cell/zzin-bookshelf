#!/usr/bin/env python3
# -*- coding: utf-8 -*-
r"""
serve.py — local dev server with static + write API for the "更多" module.

Replaces `python -m http.server 8765` when you want to add new articles
via the public web UI. Edits write to the obsidian vault (single source
of truth), then re-parse more.json, then return fresh data.

Endpoints:
  GET  /                       static files (public/)
  POST /api/more/articles      create or overwrite a note
       JSON body: { category, title, body, tags?, slug? }

The server is **dev only** — never expose to the public deploy. The
public site at mcode.cn is static (read-only) and gets updates via
"deploy" after you push the obsidian content through watcher +
git + deploy.
"""
import json
import os
import re
import sys
import http.server
import socketserver
import urllib.parse
from pathlib import Path
from datetime import datetime

HERE = Path(__file__).parent
ROOT = HERE.parent
PUBLIC_DIR = ROOT / "public"
VAULT_MORE = Path(r"C:\Users\MR\Documents\Obsidian Vault\more")
PARSE_MORE = HERE / "parse_more.py"

PORT = int(os.environ.get("DEV_PORT", "8765"))


def slugify(s: str) -> str:
    s = s.strip()
    s = re.sub(r"[\\/:*?\"<>|]+", "-", s)
    s = re.sub(r"\s+", "-", s)
    s = re.sub(r"-+", "-", s)
    return s.strip("-") or "untitled"


def now_iso_date() -> str:
    return datetime.now().strftime("%Y-%m-%d")


def write_obsidian_note(category: str, title: str, body: str, tags: list[str]) -> dict:
    """Write a markdown note to obsidian/more/<category>/<title>.md.

    Returns the relative path of the created file. Creates the
    category directory if missing. Auto-injects YAML frontmatter
    (title, date, tags) so the parser can read them.
    """
    cat = category.strip()
    if not cat:
        raise ValueError("category is required")
    cat_dir = VAULT_MORE / cat
    cat_dir.mkdir(parents=True, exist_ok=True)
    slug = slugify(title)
    md_path = cat_dir / f"{slug}.md"
    fm_lines = ["---", f"title: {title}", f"date: {now_iso_date()}"]
    if tags:
        fm_lines.append(f"tags: {', '.join(tags)}")
    fm_lines.append("---")
    fm_lines.append("")
    full = "\n".join(fm_lines) + "\n" + body.rstrip() + "\n"
    md_path.write_text(full, encoding="utf-8")
    return {"path": str(md_path), "category": cat, "slug": slug}


def rebuild_more() -> dict:
    import subprocess
    res = subprocess.run(
        [sys.executable, str(PARSE_MORE)],
        capture_output=True, text=True,
        encoding="utf-8", errors="replace",
        cwd=str(ROOT), timeout=30,
    )
    if res.returncode != 0:
        raise RuntimeError(f"parse_more failed: {res.stderr.strip()[:300]}")
    out = json.loads((ROOT / "data" / "more.json").read_text(encoding="utf-8"))
    return {"categories": out, "stdout": res.stdout.strip()}


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(PUBLIC_DIR), **kwargs)

    def log_message(self, fmt, *args):
        sys.stderr.write("[%s] %s\n" % (self.log_date_time_string(), fmt % args))

    def _json(self, status: int, payload: dict) -> None:
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self) -> None:
        if self.path.startswith("/api/more/articles/delete"):
            self.handle_delete_article()
            return
        if self.path.startswith("/api/more/articles"):
            self.handle_create_article()
            return
        if self.path.startswith("/api/more/categories"):
            self.handle_create_category()
            return
        self.send_error(404, "not found")

    def do_OPTIONS(self) -> None:
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def _read_json_body(self) -> dict:
        length = int(self.headers.get("Content-Length", "0") or "0")
        if length == 0:
            return {}
        raw = self.rfile.read(length)
        try:
            return json.loads(raw.decode("utf-8"))
        except Exception as e:
            raise ValueError(f"invalid JSON: {e}")

    def handle_create_article(self) -> None:
        try:
            data = self._read_json_body()
            category = (data.get("category") or "").strip()
            title = (data.get("title") or "").strip()
            body = (data.get("body") or "").strip()
            tags = data.get("tags") or []
            if not isinstance(tags, list):
                tags = [str(tags)]
            if not category or not title or not body:
                self._json(400, {"ok": False, "error": "category/title/body 不能为空"})
                return
            info = write_obsidian_note(category, title, body, tags)
            rebuild = rebuild_more()
            self._json(200, {
                "ok": True,
                "path": info["path"],
                "category": info["category"],
                "slug": info["slug"],
                "data": rebuild["categories"],
            })
        except Exception as e:
            self._json(500, {"ok": False, "error": str(e)})

    def handle_create_category(self) -> None:
        try:
            data = self._read_json_body()
            name = (data.get("name") or "").strip()
            if not name:
                self._json(400, {"ok": False, "error": "name is required"})
                return
            (VAULT_MORE / name).mkdir(parents=True, exist_ok=True)
            self._json(200, {"ok": True, "category": name})
        except Exception as e:
            self._json(500, {"ok": False, "error": str(e)})

    def handle_delete_article(self) -> None:
        try:
            data = self._read_json_body()
            category = (data.get("category") or "").strip()
            slug = (data.get("slug") or "").strip()
            if not category or not slug:
                self._json(400, {"ok": False, "error": "category/slug required"})
                return
            md_path = VAULT_MORE / category / f"{slugify(slug)}.md"
            if not md_path.exists():
                self._json(404, {"ok": False, "error": f"not found: {md_path}"})
                return
            # Refuse to delete anything outside VAULT_MORE — safety net.
            if not str(md_path.resolve()).startswith(str(VAULT_MORE.resolve())):
                self._json(403, {"ok": False, "error": "refusing to delete outside vault more/"})
                return
            md_path.unlink()
            rebuild = rebuild_more()
            self._json(200, {"ok": True, "deleted": str(md_path), "data": rebuild["categories"]})
        except Exception as e:
            self._json(500, {"ok": False, "error": str(e)})


def main() -> int:
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer(("127.0.0.1", PORT), Handler) as httpd:
        print(f"[serve] public dir: {PUBLIC_DIR}")
        print(f"[serve] vault more: {VAULT_MORE}")
        print(f"[serve] POST /api/more/articles  (body: { '{ category, title, body, tags? }' })")
        print(f"[serve] POST /api/more/categories (body: { '{ name }' })")
        print(f"[serve] listening on http://127.0.0.1:{PORT}  (Ctrl+C to stop)")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\n[serve] stopping...")
        return 0


if __name__ == "__main__":
    sys.exit(main())