@echo off
REM Restores a dump file into the database named in backend\.env (REPLACES its tables).
REM Usage: db-restore.bat path\to\file.dump
REM Needs pg_restore on PATH, or PG_BIN set to the PostgreSQL bin folder.
setlocal
for %%I in ("%~dp0..") do set "WEBAPP=%%~fI"
set "BACKEND=%WEBAPP%\backend"
if "%~1"=="" goto :usage
if not exist "%~f1" goto :nofile
call "%~dp0_lib.bat" require_venv || goto :fail
pushd "%BACKEND%"
"%PY%" db_transfer.py restore "%~f1"
if errorlevel 1 goto :restorefail
popd
exit /b 0

:usage
echo Usage: db-restore.bat path\to\file.dump
goto :fail

:nofile
echo ERROR: file not found: %~f1
goto :fail

:restorefail
popd
echo.
echo ERROR: the restore failed. Common causes: pg_restore not on PATH (install the PostgreSQL
echo client tools or set PG_BIN), Postgres not running, the target database does not exist,
echo or wrong settings in backend\.env.
goto :fail

:fail
echo.
echo RESTORE FAILED -- read the first error above.
call "%~dp0_lib.bat" pause_if_dblclick
exit /b 1
