@echo off
rem daily-sync.bat — run once: re-parse vault, refresh public data, and write
rem the deploy trigger. Mavis will pick it up on the next conversation turn.
rem
rem You can also schedule this via Windows Task Scheduler:
rem   Action: daily-sync.bat
rem   Trigger: Daily at 02:00
rem   Run as: your Windows user (so it can read C:\Users\MR\...)

cd /d "%~dp0"
python scripts\daily_sync.py
if errorlevel 1 (
    echo.
    echo [error] daily sync failed. See data\watcher.log for details.
    pause
)