@echo off
REM Creates the database named in backend\.env if it is missing (PostgreSQL; SQLite makes its file by itself),
REM then brings it to the latest schema (alembic migrations: creates every table).
REM Safe to re-run. The server does the same automatically when it starts; run this first
REM to see any error on its own, for example before a first start or after a patch.
REM There is no "seed" option on purpose: seed.py creates demo users that all share the
REM password "pass" and must never be run on a real server.
setlocal
for %%I in ("%~dp0..") do set "WEBAPP=%%~fI"
set "BACKEND=%WEBAPP%\backend"
call "%~dp0_lib.bat" require_venv || goto :fail
if not exist "%BACKEND%\.env" echo WARNING: backend\.env not found - DATABASE_URL will not be set.
pushd "%BACKEND%"
"%PY%" create_database.py
"%PY%" -c "from app.db import init_db; init_db(); print('Database is at the latest schema.')"
if errorlevel 1 goto :migratefail
popd
exit /b 0

:migratefail
popd
echo.
echo ERROR: the migration above failed. Common causes: Postgres is not running, the database
echo has not been created yet, wrong DATABASE_URL or password in backend\.env, a missing
echo package (run setup.bat), or a database created by hand that does not match the migrations.
goto :fail

:fail
echo.
echo MIGRATION FAILED -- read the first error above.
call "%~dp0_lib.bat" pause_if_dblclick
exit /b 1
