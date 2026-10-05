#!/usr/bin/env python3
# -*- coding: utf-8 -*-
r"""
serve.py — minimal local static-file server for the public site.

Replaces `python -m http.server 8765 -d public` for one-stop local dev:
run `python scripts\serve.py` and open http://127.0.0.1:8765/.

Public deploys at *.space.mcode.cn are pure static (GET-only); this script
mirrors that — it serves files only, no write endpoints. Editing vault
content happens in Obsidian, then `npm run build` regenerates
public/data/books.json, and a separate deploy step ships the public/ tree
to the host.
"""
import os
import sys
import http.server
import socketserver
from pathlib import Path

HERE = Path(__file__).parent
ROOT = HERE.parent
PUBLIC_DIR = ROOT / "public"

PORT = int(os.environ.get("DEV_PORT", "8765"))


def main() -> int:
    socketserver.TCPServer.allow_reuse_address = True
    class Handler(http.server.SimpleHTTPRequestHandler):
        def __init__(self, *args, **kwargs):
            super().__init__(*args, directory=str(PUBLIC_DIR), **kwargs)

        def log_message(self, fmt, *args):
            sys.stderr.write("[%s] %s\n" % (self.log_date_time_string(), fmt % args))

    with socketserver.TCPServer(("127.0.0.1", PORT), Handler) as httpd:
        print(f"[serve] public dir: {PUBLIC_DIR}")
        print(f"[serve] listening on http://127.0.0.1:{PORT}  (Ctrl+C to stop)")
        try:
            httpd.serve_forever()
        except KeyboardInterrupt:
            print("\n[serve] stopping...")
        return 0


if __name__ == "__main__":
    sys.exit(main())