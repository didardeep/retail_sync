@echo off
REM One command for a FIRST install: packages, settings, database, tables, first admin.
REM Usage: install.bat <login> [<email>] [<login> [<email>] ...]     e.g. install.bat alice alice@kpmg.com
REM Safe to run again: it never overwrites an existing backend\.env, existing tables or existing admins.
REM Then start the server with start-server.bat. Every step is checked and the failing step is named.
setlocal
for %%I in ("%~dp0..") do set "WEBAPP=%%~fI"
set "BACKEND=%WEBAPP%\backend"
if "%~1"=="" goto :usage

echo ==== [1/4] Python packages and website ====
call "%~dp0setup.bat" || goto :fail
call "%~dp0_lib.bat" require_venv || goto :fail

echo.
echo ==== [2/4] Settings (backend\.env) ====
pushd "%BACKEND%"
"%PY%" make_env.py
if errorlevel 1 goto :envfail
popd

echo.
echo ==== [3/4] Database and tables ====
call "%~dp0db-migrate.bat" || goto :fail

echo.
echo ==== [4/4] First admin account ====
call "%~dp0create-admin.bat" %* || goto :fail

echo.
echo ============================================================
echo Install finished. Next:
echo   1. Open the firewall: inbound TCP 8199, limited to the intranet.
echo   2. Run start-server.bat and leave its window open.
echo   3. From another machine open http://^<this-server^>:8199 and sign in
echo      with the login and temporary password printed above.
echo Settings are in backend\.env. By default the database is a file in the
echo backend folder; to use PostgreSQL see docs\DEPLOYMENT.md section 4.
echo ============================================================
exit /b 0

:usage
echo Usage: install.bat ^<login^> [^<email^>] [^<login^> [^<email^>] ...]
echo   e.g. install.bat alice alice@kpmg.com
echo The login is what the person types on the sign-in page. The email is optional.
goto :fail

:envfail
popd
echo.
echo ERROR: could not create backend\.env. Copy backend\.env.example to backend\.env by hand,
echo set JWT_SECRET and DATABASE_URL in it, and run install.bat again.
goto :fail

:fail
echo.
echo INSTALL FAILED -- read the first error above, not the last line.
call "%~dp0_lib.bat" pause_if_dblclick
exit /b 1
