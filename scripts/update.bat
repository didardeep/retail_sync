@echo off
REM Update the server from git: pull, refresh packages, rebuild frontend.
REM Then stop the running server (Ctrl+C) and run start-server.bat again.
REM Requires the server folder to be a git clone (git clone <repo-url>).
REM Optional argument: branch name, e.g. update.bat Tanmay
setlocal
for %%I in ("%~dp0..") do set "WEBAPP=%%~fI"
set "BACKEND=%WEBAPP%\backend"
call "%~dp0_lib.bat" require_venv || goto :fail
where git >nul 2>&1
if errorlevel 1 goto :nogit
pushd "%WEBAPP%"
if "%~1"=="" goto :pull
git checkout %1
if errorlevel 1 goto :gitfail
:pull
git pull
if errorlevel 1 goto :gitfail
popd

echo.
echo Refreshing backend packages...
"%PY%" --version
if not exist "%BACKEND%\logs" mkdir "%BACKEND%\logs"
if exist "%WEBAPP%\wheels\*.whl" goto :offlinepip
"%PY%" -m pip install --log "%BACKEND%\logs\pip-install.log" -r "%BACKEND%\requirements.txt"
if errorlevel 1 goto :pipfail
goto :pipdone
:offlinepip
echo Installing from wheels\ (no internet needed)...
"%PY%" -m pip install --no-index --find-links "%WEBAPP%\wheels" --log "%BACKEND%\logs\pip-install.log" -r "%BACKEND%\requirements.txt"
if errorlevel 1 goto :pipfail
:pipdone

where npm >nul 2>&1
if errorlevel 1 goto :nonpm
call "%~dp0build-frontend.bat" nopause || goto :fail
goto :done
:nonpm
echo WARNING: npm not found - the frontend was NOT rebuilt. Copy a built frontend\dist if the UI changed.

:done
echo.
echo Updated. Restart the server: Ctrl+C in its window, then start-server.bat
echo The database is brought up to date automatically when the server starts.
exit /b 0

:nogit
echo.
echo ERROR: git not found on PATH. Use a patch zip instead, or install git.
goto :fail

:gitfail
popd
echo.
echo ERROR: the git command above failed. Common causes: local uncommitted changes in the way,
echo this folder is not a git clone, no network access to the remote, or a wrong branch name.
goto :fail

:pipfail
echo.
echo ERROR: pip install failed. Scroll up to the first line that says ERROR.
echo Full pip log: %BACKEND%\logs\pip-install.log
goto :fail

:fail
echo.
echo UPDATE FAILED -- read the first error above.
call "%~dp0_lib.bat" pause_if_dblclick
exit /b 1
