@echo off
REM Runs the app (API + built frontend) on port 8199 in production mode. No --reload: that is for dev only.
REM Ctrl+C to stop. If it stops by itself the window stays open (when double-clicked)
REM so the error can be read.
setlocal
for %%I in ("%~dp0..") do set "WEBAPP=%%~fI"
set "BACKEND=%WEBAPP%\backend"
if not defined PORT set "PORT=8199"
set "APP_ENV=production"
call "%~dp0_lib.bat" require_venv || goto :fail
if not exist "%BACKEND%\.env" echo WARNING: backend\.env not found. Copy .env.example to .env and fill it in.
if not exist "%WEBAPP%\frontend\dist\index.html" echo WARNING: frontend\dist is missing. The API will run but there is no web UI. Run build-frontend.bat.
netstat -ano | findstr /r /c:":%PORT% .*LISTENING" >nul
if not errorlevel 1 goto :portbusy

"%PY%" --version
echo Starting on http://0.0.0.0:%PORT%  (Ctrl+C to stop)
pushd "%BACKEND%"
"%PY%" -m uvicorn app.main:app --host 0.0.0.0 --port %PORT%
set "RC=%ERRORLEVEL%"
popd
echo.
echo Server stopped (exit code %RC%).
if "%RC%"=="0" exit /b 0
echo If you did not stop it yourself, read the error above. Common causes: a missing package
echo (run setup.bat), bad database settings in backend\.env, or a Python error at startup.
call "%~dp0_lib.bat" pause_if_dblclick
exit /b %RC%

:portbusy
echo.
echo ERROR: port %PORT% is already in use, probably by an already-running copy of this server.
echo Find the process:  netstat -ano ^| findstr :%PORT%   then stop that PID in Task Manager.
goto :fail

:fail
echo.
echo START FAILED.
call "%~dp0_lib.bat" pause_if_dblclick
exit /b 1
