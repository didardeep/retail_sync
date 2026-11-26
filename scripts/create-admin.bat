@echo off
REM Creates admin accounts in the .env database.
REM Usage: create-admin.bat alice alice@kpmg.com bob     (the email after a login is optional)
setlocal
for %%I in ("%~dp0..") do set "WEBAPP=%%~fI"
set "BACKEND=%WEBAPP%\backend"
if "%~1"=="" goto :usage
call "%~dp0_lib.bat" require_venv || goto :fail
pushd "%BACKEND%"
"%PY%" create_admin.py %*
if errorlevel 1 goto :adminfail
popd
exit /b 0

:usage
echo Usage: create-admin.bat login [email] [login [email] ...]
goto :fail

:adminfail
popd
echo.
echo ERROR: creating the admin failed. Common causes: the schema has not been created yet
echo (run db-schema.bat), Postgres not running, or wrong settings in backend\.env.
goto :fail

:fail
echo.
echo CREATE-ADMIN FAILED -- read the first error above.
call "%~dp0_lib.bat" pause_if_dblclick
exit /b 1
