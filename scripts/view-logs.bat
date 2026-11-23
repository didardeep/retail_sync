@echo off
REM Live-tail the app log (every write request + every 4xx/5xx with the reason).
REM Ctrl+C to stop. Log file: backend\logs\app.log
setlocal
for %%I in ("%~dp0..") do set "WEBAPP=%%~fI"
set "LOGFILE=%WEBAPP%\backend\logs\app.log"
if not exist "%LOGFILE%" goto :nolog
powershell -NoProfile -Command "Get-Content -LiteralPath '%LOGFILE%' -Tail 50 -Wait"
exit /b 0

:nolog
echo.
echo No log file yet at:
echo   %LOGFILE%
echo It is created when the server first runs. Start it with start-server.bat.
call "%~dp0_lib.bat" pause_if_dblclick
exit /b 1
