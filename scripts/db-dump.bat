@echo off
REM Dumps the database named in backend\.env to backend\backups\.
REM Needs the PostgreSQL client tools (pg_dump) on PATH, or PG_BIN set to their folder.
setlocal
for %%I in ("%~dp0..") do set "WEBAPP=%%~fI"
set "BACKEND=%WEBAPP%\backend"
call "%~dp0_lib.bat" require_venv || goto :fail
pushd "%BACKEND%"
"%PY%" db_transfer.py dump
if errorlevel 1 goto :dumpfail
popd
exit /b 0

:dumpfail
popd
echo.
echo ERROR: the dump failed. Common causes: pg_dump not on PATH (install the PostgreSQL client
echo tools or set PG_BIN), Postgres not running, or wrong settings in backend\.env.
goto :fail

:fail
echo.
echo DUMP FAILED -- read the first error above.
call "%~dp0_lib.bat" pause_if_dblclick
exit /b 1
