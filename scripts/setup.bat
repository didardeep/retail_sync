@echo off
REM One-time setup on a fresh server: Python venv + backend packages + frontend build.
REM Run from anywhere. Afterwards: copy backend\.env.example to backend\.env, fill it in,
REM then run db-migrate.bat (or restore a dump with db-restore.bat), create-admin.bat, then start-server.bat.
REM Every step is checked and the failing step is named. Full pip log: backend\logs\pip-install.log
setlocal
for %%I in ("%~dp0..") do set "WEBAPP=%%~fI"
set "BACKEND=%WEBAPP%\backend"
set "PYLOG=%BACKEND%\logs\pip-install.log"
if not exist "%BACKEND%\logs" mkdir "%BACKEND%\logs"

echo [1/5] Checking system Python...
where python >nul 2>&1
if errorlevel 1 goto :nopython
python -c "import sys; print('Using ' + sys.executable + ' (Python ' + sys.version.split()[0] + ')'); sys.exit(0 if sys.version_info >= (3, 11) else 1)"
if errorlevel 1 goto :oldpython

echo [2/5] Creating virtual environment...
set "PY=%BACKEND%\venv\Scripts\python.exe"
if exist "%PY%" goto :venvok
python -m venv "%BACKEND%\venv"
if errorlevel 1 goto :fail
:venvok
call "%~dp0_lib.bat" require_venv || goto :fail
"%PY%" --version
if errorlevel 1 goto :badvenv

REM Offline packages: a folder of .whl files (named wheels, made by make-wheelhouse.bat) means
REM "install from it, with no internet". Windows Explorer's "Extract All" puts a zip's files in a
REM folder named after the zip, so the wheels folder can end up one level too deep: look there too.
set "WHEELS="
if exist "%WEBAPP%\wheels\*.whl" set "WHEELS=%WEBAPP%\wheels"
if not defined WHEELS call :findwheels
set "OFFLINE="
if defined WHEELS set "OFFLINE=1"

if defined OFFLINE goto :skippipupgrade
echo No offline packages (a wheels folder of .whl files) found next to backend.
echo Checking that pypi.org can be reached (8 seconds)...
"%PY%" -m pip index versions pip --retries 0 --timeout 8 >nul 2>&1
if errorlevel 1 goto :nopypi
echo [3/5] Upgrading pip...
"%PY%" -m pip install --upgrade pip
if errorlevel 1 echo WARNING: pip upgrade failed, continuing with the bundled pip.
goto :installpackages
:skippipupgrade
echo [3/5] Offline packages found in %WHEELS% - skipping the pip upgrade.

:installpackages
echo [4/5] Installing backend packages...
if defined OFFLINE goto :offlineinstall
"%PY%" -m pip install --log "%PYLOG%" -r "%BACKEND%\requirements.txt"
if errorlevel 1 goto :pipfail
goto :packagesdone
:offlineinstall
echo Installing from %WHEELS% (no internet needed)...
"%PY%" -m pip install --no-index --find-links "%WHEELS%" --log "%PYLOG%" -r "%BACKEND%\requirements.txt"
if errorlevel 1 goto :pipfail
:packagesdone

echo [5/5] Checking the packages import...
"%PY%" -c "import fastapi, uvicorn, sqlalchemy, psycopg2, jwt, werkzeug, dotenv, openpyxl, multipart, alembic; print('Imports OK')"
if errorlevel 1 goto :importfail

echo.
echo Frontend...
where npm >nul 2>&1
if errorlevel 1 goto :nonpm
call "%~dp0build-frontend.bat" nopause || goto :fail
goto :done
:nonpm
if exist "%WEBAPP%\frontend\dist\index.html" goto :usedist
echo ERROR: npm not found and there is no frontend\dist folder.
echo Either install Node.js and re-run, or copy a built frontend\dist from the dev machine.
goto :fail
:usedist
echo npm not found - using the shipped frontend\dist.

:done
echo.
echo Setup done. Next: copy backend\.env.example to backend\.env and fill it in,
echo then db-migrate.bat, create-admin.bat, start-server.bat
exit /b 0

:nopython
echo.
echo ERROR: python was not found on PATH.
echo Install Python 3.11 or newer (the office server uses 3.14) and tick "Add to PATH",
echo then open a NEW terminal and re-run setup.bat.
echo If Windows opens the Microsoft Store instead, turn off the python.exe App execution alias.
goto :fail

:oldpython
echo.
echo ERROR: this Python is older than 3.11. Install a newer Python and re-run.
goto :fail

:badvenv
echo.
echo ERROR: backend\venv exists but its Python does not run (it was probably created on another
echo machine or with a Python that has since been removed). Delete the backend\venv folder
echo and re-run setup.bat.
goto :fail

:pipfail
echo.
echo ==== PIP INSTALL FAILED ====
"%PY%" --version
echo Scroll up to the first line that says ERROR. Common causes:
echo  - "Failed building wheel" or "pg_config executable not found": a package has no
echo    prebuilt wheel for this Python version and pip tried to compile it. Note the
echo    package name, then pin a release that has a wheel in backend\requirements.txt.
echo  - "Could not find a version that satisfies the requirement": no release for this
echo    Python version, or pip cannot reach the internet.
echo  - Connection, SSL or proxy errors: the server cannot reach PyPI. Either set a proxy and
echo    re-run (set HTTPS_PROXY=http://proxy-host:port) or use the offline bundle: build it
echo    with make-wheelhouse.bat on a machine with internet and extract it into this folder.
echo  - With the offline bundle: "No matching distribution" or "not a supported wheel" means
echo    the bundle was built for another Python version or a 32-bit Python. Compare
echo    "python --version" here with the bundle's name (py314 = Python 3.14, 64-bit).
echo Full pip log: %PYLOG%
goto :fail

:importfail
echo.
echo ==== PACKAGES INSTALLED BUT FAILED TO IMPORT ====
echo See the error above. Often a version clash between two packages.
echo Check:  "%PY%" -m pip check
goto :fail

:fail
echo.
echo SETUP FAILED -- read the first error above, not the last line.
call "%~dp0_lib.bat" pause_if_dblclick
exit /b 1

:nopypi
echo.
echo ==== CANNOT REACH THE PYTHON PACKAGE SERVER (pypi.org) ====
echo This server cannot reach pypi.org, and no offline packages were found.
echo Looked for .whl files in:  %WEBAPP%\wheels  and in the folders directly inside %WEBAPP%
echo.
echo If you have the offline bundle (RetailSync-wheels-py314-win_amd64.zip): extract it so that
echo   %WEBAPP%\wheels\   contains the .whl files. Check with:  dir "%WEBAPP%\wheels\*.whl"
echo Explorer's "Extract All" adds an extra folder named after the zip: move the "wheels" folder
echo out of it, next to "backend" and "scripts". Then run this again.
echo.
echo If the server has a proxy instead:  set HTTPS_PROXY=http://proxy-host:port   then run this again.
goto :fail

:findwheels
if exist "%WEBAPP%\*.whl" set "WHEELS=%WEBAPP%"
for /d %%D in ("%WEBAPP%\*") do call :checkdir "%%~fD"
exit /b 0

:checkdir
if exist "%~1\wheels\*.whl" set "WHEELS=%~1\wheels"
if exist "%~1\*.whl" set "WHEELS=%~1"
exit /b 0
