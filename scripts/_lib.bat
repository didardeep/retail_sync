@echo off
REM Shared helpers for the other scripts. Usage: call "%~dp0_lib.bat" <label>
REM Not meant to be run on its own.
goto %1

:require_venv
REM Caller must set BACKEND. Sets PY to the venv's python.exe, or fails with a clear message.
set "PY=%BACKEND%\venv\Scripts\python.exe"
if exist "%PY%" exit /b 0
echo.
echo ERROR: virtual environment not found at:
echo   %BACKEND%\venv
echo Run setup.bat first. If you already did, read its output for the first error.
exit /b 1

:pause_if_dblclick
REM Keeps the window open after a failure when the script was double-clicked,
REM so the error can be read. Set NOPAUSE=1 to disable (automation, CI).
if defined NOPAUSE exit /b 0
echo %cmdcmdline% | find /i "/c" >nul && pause
exit /b 0
