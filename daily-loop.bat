@echo off
rem daily-loop.bat — long-running daemon that calls daily_sync every 24h.
rem
rem Best as a Windows scheduled task that runs at logon:
rem   Action: daily-loop.bat
rem   Trigger: At logon
rem   Run as: your Windows user
rem
rem The window stays open. Close it to stop.

cd /d "%~dp0"
echo === daily-loop: every 24h, runs daily_sync once ===
echo === press Ctrl+C to stop ===
echo.
python scripts\daily_loop.py
pause