@echo off
rem NAVER Mail MCP one-click installer. Keep this file ASCII-only: cmd.exe misreads UTF-8 batch files.
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 goto nonode
node scripts\setup.mjs
echo.
pause
exit /b 0

:nonode
echo.
echo  Node.js is not installed.
echo  Install the LTS version from https://nodejs.org and run this file again.
echo.
pause
exit /b 1
