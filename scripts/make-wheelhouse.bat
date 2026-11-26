@echo off
REM Run on the DEV machine (needs internet). Builds RetailSync-wheels-py<ver>-win_amd64.zip: every Python
REM package the app needs, as files, for a server that cannot reach PyPI. Extract it into the app folder
REM on the server (so "wheels" sits next to "backend"); install.bat then installs from it, offline.
REM Usage: make-wheelhouse.bat [python-version]     default 3.14, e.g. make-wheelhouse.bat 3.12
REM The version must match "python --version" on the SERVER, which must be 64-bit Windows.
setlocal
where python >nul 2>&1
if errorlevel 1 goto :nopython
set "VER=%~1"
if "%VER%"=="" set "VER=3.14"
python --version
echo Building the offline bundle for the server's Python %VER% ...
python "%~dp0make_wheelhouse.py" --python %VER%
if errorlevel 1 goto :fail
exit /b 0

:nopython
echo ERROR: python not found on PATH.
goto :fail

:fail
echo.
echo MAKE-WHEELHOUSE FAILED -- read the first error above.
call "%~dp0_lib.bat" pause_if_dblclick
exit /b 1
