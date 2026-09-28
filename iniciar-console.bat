@echo off
setlocal
cd /d "%~dp0"
title Wytch RPC (console)

set "EXE="
if exist "%~dp0wytch-rpc.exe" set "EXE=%~dp0wytch-rpc.exe"
if not defined EXE if exist "%~dp0dist\wytch-rpc.exe" set "EXE=%~dp0dist\wytch-rpc.exe"

if defined EXE (
  echo Iniciando Wytch RPC em modo console...
  "%EXE%"
  goto :end
)

where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo [!] wytch-rpc.exe nao encontrado e Node.js nao esta instalado.
  echo     Baixe o wytch-rpc.exe em:
  echo     https://github.com/hey-Lyn/wytch-rpc/releases
  echo.
  pause
  goto :end
)

echo Iniciando Wytch RPC ^(via Node^)...
node "%~dp0server\server.js"

:end
echo.
echo O Wytch RPC foi encerrado.
pause
