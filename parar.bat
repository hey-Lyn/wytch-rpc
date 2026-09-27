@echo off
taskkill /IM wytch-rpc.exe /F >nul 2>nul
if errorlevel 1 (
  echo Wytch RPC nao estava rodando ^(ou foi iniciado via Node^).
) else (
  echo Wytch RPC encerrado.
)
timeout /t 2 >nul
