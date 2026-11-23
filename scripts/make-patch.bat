@echo off
REM Run on the DEV machine. Builds RetailSync-patch-<base>-to-<head>.zip in the repo root:
REM changed + untracked files since <base>, the prebuilt frontend dist (if frontend
REM changed), a manifest, and APPLY.txt with the exact server steps.
REM Usage: make-patch.bat <base-commit>   e.g. make-patch.bat b0f35f4
REM Options are passed through: --no-build, --no-dist, --out DIR
setlocal
if "%~1"=="" goto :usage
where python >nul 2>&1
if errorlevel 1 goto :nopython
python --version
python "%~dp0make_patch.py" %*
if errorlevel 1 goto :fail
exit /b 0

:usage
echo Usage: make-patch.bat ^<base-commit^>   e.g. make-patch.bat b0f35f4
goto :fail

:nopython
echo ERROR: python not found on PATH.
goto :fail

:fail
echo.
echo MAKE-PATCH FAILED -- read the first error above.
call "%~dp0_lib.bat" pause_if_dblclick
exit /b 1
