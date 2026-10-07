@echo off
echo ========================================================
echo Starting Llama Server with Gemma 4 E2B + mmproj
echo Target: Port 8080 on NVIDIA GPU (RTX 5070 Mobile)
echo ========================================================
cd /d "E:\AI\llamaCP"
llama-server.exe -m .\gemma-4-E2B-it-Q4_K_M.gguf --mmproj .\mmproj-F16.gguf -ngl 99 -c 8192 --port 8080
pause
