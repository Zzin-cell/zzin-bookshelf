@echo off
rem watcher.bat — start the Obsidian → books.json watcher in a console window.
rem
rem Double-click to start. The window stays open and shows real-time logs.
rem Close the window (or Ctrl+C) to stop.

cd /d "%~dp0"
echo.
echo === Obsidian → books.json watcher ===
echo Source: C:\Users\MR\Documents\Obsidian Vault\*.md
echo Output: %CD%\public\data\books.json
echo.
echo Closing this window stops the watcher. Press Ctrl+C first if you want a clean shutdown.
echo.

python scripts\watcher.py
if errorlevel 1 (
    echo.
    echo [error] python not on PATH. Try "py scripts\watcher.py" or install Python from python.org.
    pause
)