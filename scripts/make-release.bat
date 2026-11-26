@echo off
REM Run on the DEV machine. Builds RetailSync-full-<commit>.zip in the repo root: every tracked
REM file plus the prebuilt frontend\dist, for a FIRST install on a server with no node/npm.
REM Options are passed through: --no-build, --out DIR, --suffix TEXT
setlocal
where python >nul 2>&1
if errorlevel 1 goto :nopython
python --version
python "%~dp0make_patch.py" --full %*
if errorlevel 1 goto :fail
exit /b 0

:nopython
echo ERROR: python not found on PATH.
goto :fail

:fail
echo.
echo MAKE-RELEASE FAILED -- read the first error above.
call "%~dp0_lib.bat" pause_if_dblclick
exit /b 1
