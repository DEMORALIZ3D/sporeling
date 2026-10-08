#!/usr/bin/env bash
set -e

echo "========================================================"
echo "Starting llama-server with Gemma 4 E2B + mmproj"
echo "Target: Port 8080 (GPU / Metal / CPU)"
echo "========================================================"

LLAMA_DIR="${LLAMA_SERVER_DIR:-.}"
if [ -d "$LLAMA_DIR" ]; then
  cd "$LLAMA_DIR"
fi

echo "Working directory: $(pwd)"
llama-server -m ./gemma-4-E2B-it-Q4_K_M.gguf --mmproj ./mmproj-F16.gguf -ngl 99 -c 8192 --port 8080
