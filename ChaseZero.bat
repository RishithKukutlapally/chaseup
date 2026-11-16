@echo off
setlocal EnableExtensions
title Northgate ChaseUp - RM-approved KYC document chasing

set "ROOT_DIR=%~dp0"
if "%ROOT_DIR:~-1%"=="\" set "ROOT_DIR=%ROOT_DIR:~0,-1%"
set "BACKEND_DIR=%ROOT_DIR%\backend"
set "FRONTEND_DIR=%ROOT_DIR%\frontend"
set "ENV_FILE=%ROOT_DIR%\.env"
set "ENV_EXAMPLE=%ROOT_DIR%\.env.example"

echo ====================================================================
echo   NORTHGATE CHASEUP - RM-approved KYC document chasing (synthetic data)
echo ====================================================================

if not exist "%ENV_FILE%" (
    if exist "%ENV_EXAMPLE%" (
        copy /Y "%ENV_EXAMPLE%" "%ENV_FILE%" >nul
        echo [INFO] Created .env from .env.example at: %ENV_FILE%
    )
)

echo [1/3] Syncing Python backend environment (uv)...
pushd "%BACKEND_DIR%"
uv sync --extra dev
if errorlevel 1 (
    echo [ERROR] uv sync failed. Install uv: https://docs.astral.sh/uv/
    popd
    pause
    exit /b 1
)
popd

echo [2/3] Checking React frontend bundle...
if not exist "%FRONTEND_DIR%\node_modules" (
    echo [SETUP] Installing frontend dependencies...
    pushd "%FRONTEND_DIR%"
    call npm install
    if errorlevel 1 (
        echo [ERROR] npm install failed.
        popd
        pause
        exit /b 1
    )
    popd
)
if not "%CHASEUP_SKIP_BUILD%"=="1" (
    echo [SETUP] Building frontend production bundle...
    pushd "%FRONTEND_DIR%"
    call npm run build
    if errorlevel 1 (
        echo [ERROR] Frontend build failed.
        popd
        pause
        exit /b 1
    )
    popd
)

echo [3/3] Launching ChaseUp (FastAPI + LangGraph + MCP + React UI)...
echo        LLM API Keys (.env): %ENV_FILE%
echo.

pushd "%BACKEND_DIR%"
"%BACKEND_DIR%\.venv\Scripts\python.exe" "%BACKEND_DIR%\run_exe.py" %*
set "EXIT_CODE=%ERRORLEVEL%"
popd

if not "%EXIT_CODE%"=="0" (
    echo.
    echo [ERROR] ChaseUp exited with code %EXIT_CODE%.
    pause
    exit /b %EXIT_CODE%
)
endlocal
