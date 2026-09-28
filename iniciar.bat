@echo off
cd /d "%~dp0"
if not exist "wytch-rpc.vbs" (
  echo wytch-rpc.vbs nao encontrado nesta pasta.
  pause
  exit /b 1
)
start "" wscript.exe "%~dp0wytch-rpc.vbs"
