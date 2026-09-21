#!/usr/bin/env python3
# -*- coding: utf-8 -*-
r"""
daily_loop.py — long-running daemon that calls daily_sync every 24 hours.

Use this when you want a fully background "no human required" loop, separate
from the realtime watcher. The realtime watcher (watcher.py) reacts to
filesystem changes; this loop is a wall-clock-driven safety net.

Run:    python scripts\daily_loop.py
Stop:   Ctrl+C (or kill the process)
"""
import sys
import time
from datetime import datetime
from pathlib import Path

HERE = Path(__file__).parent
sys.path.insert(0, str(HERE))
from daily_sync import main as run_once, log

INTERVAL_S = 24 * 60 * 60  # 24 hours


def main() -> int:
    log(f"daily_loop starting (interval {INTERVAL_S}s = 24h)")
    next_run = time.time()  # run immediately, then every 24h
    while True:
        now = time.time()
        if now >= next_run:
            log(f"scheduled run at {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
            try:
                run_once()
            except Exception as e:
                log(f"run failed: {e}")
            next_run = time.time() + INTERVAL_S
            log(f"next run at {datetime.fromtimestamp(next_run).strftime('%Y-%m-%d %H:%M:%S')}")
        # Sleep in 1-minute slices so Ctrl+C is responsive.
        time.sleep(min(60, max(1, int(next_run - time.time()))))


if __name__ == "__main__":
    try:
        sys.exit(main())
    except KeyboardInterrupt:
        log("daily_loop stopped by user")
        sys.exit(0)
