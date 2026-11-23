@echo off
REM Rebuild the frontend into frontend\dist. Restart the server afterwards (start-server.bat).
REM Needs Node.js on this machine; if the server has no node, ship a built dist instead.
setlocal
for %%I in ("%~dp0..") do set "WEBAPP=%%~fI"
where node >nul 2>&1
if errorlevel 1 goto :nonode
where npm >nul 2>&1
if errorlevel 1 goto :nonode
echo Node:
node --version
pushd "%WEBAPP%\frontend"
call npm ci
if errorlevel 1 goto :npmfail
call npm run build
if errorlevel 1 goto :npmfail
popd
if not exist "%WEBAPP%\frontend\dist\index.html" goto :nodist
echo.
echo Frontend built.
exit /b 0

:nodist
echo ERROR: the build reported success but frontend\dist\index.html is missing.
goto :fail

:nonode
echo.
echo ERROR: node / npm not found on PATH. Install Node.js, or copy a built frontend\dist from the dev machine.
goto :fail

:npmfail
popd
echo.
echo ERROR: the npm step above failed. Common causes: no internet or proxy for npm
echo (set HTTPS_PROXY), a Node version that is too old, or a TypeScript error in the code.
goto :fail

:fail
echo.
echo FRONTEND BUILD FAILED -- read the first error above.
if /i not "%~1"=="nopause" call "%~dp0_lib.bat" pause_if_dblclick
exit /b 1
