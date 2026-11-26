@echo off
REM Shows WHY pip cannot download packages on this machine. Run it in the same window you run install.bat from.
REM It prints the proxy and pip settings in effect, then tests the two hosts pip needs:
REM   1. the package index (pypi.org: the list of versions)   2. the file host (files.pythonhosted.org)
REM Send the whole output to whoever is helping. Safe to run any time; it changes nothing.
setlocal
where python >nul 2>&1
if errorlevel 1 goto :nopython

echo ==== Python ====
python --version
python -c "import struct; print('64-bit' if struct.calcsize('P')*8==64 else '32-bit (the offline bundle needs 64-bit)')"
echo.
echo ==== Proxy and mirror settings in THIS window (blank = not set) ====
echo HTTP_PROXY=%HTTP_PROXY%
echo HTTPS_PROXY=%HTTPS_PROXY%
echo NO_PROXY=%NO_PROXY%
echo PIP_INDEX_URL=%PIP_INDEX_URL%
echo PIP_PROXY=%PIP_PROXY%
echo.
echo ==== pip settings from pip.ini (index-url, proxy, trusted-host...) ====
python -m pip config list
echo (nothing listed above means pip talks to pypi.org directly)
echo.

set "TESTDIR=%TEMP%\retailsync_nettest"
if exist "%TESTDIR%" rmdir /s /q "%TESTDIR%"
mkdir "%TESTDIR%"

echo ==== Test 1: reach the package index (up to 10 seconds) ====
python -m pip index versions fastapi --retries 0 --timeout 10 >nul 2>&1
if errorlevel 1 goto :index_failed
echo OK: the package index answers.
set "T1=OK"
goto :test2
:index_failed
echo FAILED: cannot reach the package index.
set "T1=FAILED"

:test2
echo.
echo ==== Test 2: download one small package file (up to 10 seconds) ====
python -m pip download six==1.16.0 --no-deps -d "%TESTDIR%" --retries 0 --timeout 10 >nul 2>&1
if errorlevel 1 goto :file_failed
echo OK: package files download.
set "T2=OK"
goto :verdict
:file_failed
echo FAILED: cannot download package files.
set "T2=FAILED"

:verdict
rmdir /s /q "%TESTDIR%" >nul 2>&1
echo.
echo ==== What this means ====
if "%T1%%T2%"=="OKOK" goto :allok
if "%T1%"=="OK" goto :fileshostblocked
if "%T2%"=="OK" goto :indexblocked
echo Neither the index nor the file host answers from this window.
echo - Other installs that worked may have gone through a proxy or an internal mirror that is
echo   NOT active here. Find how they did it (a proxy address, or a pip.ini / PIP_INDEX_URL),
echo   set the same in this window, and run this again. Example:
echo       set HTTPS_PROXY=http://proxy-host:port
echo       set PIP_INDEX_URL=https://your-mirror/simple
echo - If there really is no route out: use the offline bundle instead (docs\DEPLOYMENT.md).
goto :end

:allok
echo pip can download packages from here. If install.bat still stalls, send this output.
goto :end

:fileshostblocked
echo The index answers but package FILES do not download: files.pythonhosted.org is probably
echo blocked by the firewall or proxy while pypi.org is allowed. Ask for it to be allowed, or use
echo the offline bundle (docs\DEPLOYMENT.md).
goto :end

:indexblocked
echo Files download but the index does not: unusual. Send this output.
goto :end

:nopython
echo ERROR: python not found on PATH.
echo Install Python and tick "Add to PATH", then open a NEW command prompt.
call "%~dp0_lib.bat" pause_if_dblclick
exit /b 1

:end
call "%~dp0_lib.bat" pause_if_dblclick
exit /b 0
