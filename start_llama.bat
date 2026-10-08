@echo off
setlocal enabledelayedexpansion

echo ========================================================
echo Starting Llama Server with Gemma 4 E2B + mmproj
echo Target: Port 8080 on GPU / Vulkan / CPU
echo ========================================================

:: Allow overriding through environment variable LLAMA_SERVER_DIR
set "LLAMA_DIR=%LLAMA_SERVER_DIR%"

:: Check standard local directory fallback
if "%LLAMA_DIR%"=="" if exist "E:\AI\llamaCP" set "LLAMA_DIR=E:\AI\llamaCP"
if "%LLAMA_DIR%"=="" set "LLAMA_DIR=."

if exist "%LLAMA_DIR%" (
    cd /d "%LLAMA_DIR%"
)

echo Working directory: %CD%
llama-server.exe -m .\gemma-4-E2B-it-Q4_K_M.gguf --mmproj .\mmproj-F16.gguf -ngl 99 -c 8192 --port 8080
pause
