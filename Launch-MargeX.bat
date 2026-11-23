@echo off
setlocal
title MargeX Launcher

set "SRC_DIR=%~dp0"
if "%SRC_DIR:~-1%"=="\" set "SRC_DIR=%SRC_DIR:~0,-1%"
set "RUNTIME_DIR=%LOCALAPPDATA%\MargeX-runtime"

echo [MargeX] Syncing source files to local runtime...
if not exist "%RUNTIME_DIR%" mkdir "%RUNTIME_DIR%"

robocopy "%SRC_DIR%" "%RUNTIME_DIR%" /E /XD node_modules dist dist-electron .git /XF *.bat /NFL /NDL /NJH /NJS /NC /NS >nul

cd /d "%RUNTIME_DIR%"

if exist "%RUNTIME_DIR%\node_modules\electron\dist\electron.exe" goto BUILD_APP

echo [MargeX] Installing dependencies on local drive - first run only...
call npm install --no-audit --no-fund
if errorlevel 1 (
    echo [MargeX] ERROR: npm install failed.
    pause
    exit /b 1
)

:BUILD_APP
echo [MargeX] Building application...
call npm run build
if errorlevel 1 (
    echo [MargeX] ERROR: Build failed.
    pause
    exit /b 1
)

echo [MargeX] Launching MargeX Studio...
set "ELECTRON_RUN_AS_NODE="
start "" "%RUNTIME_DIR%\node_modules\electron\dist\electron.exe" "%RUNTIME_DIR%"
endlocal
