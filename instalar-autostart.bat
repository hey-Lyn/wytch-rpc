@echo off
setlocal
cd /d "%~dp0"

if not exist "%~dp0wytch-rpc.vbs" (
  echo Arquivo wytch-rpc.vbs nao encontrado nesta pasta.
  pause
  exit /b 1
)

powershell -NoProfile -ExecutionPolicy Bypass -Command "$s=[Environment]::GetFolderPath('Startup'); $ws=New-Object -ComObject WScript.Shell; $lnk=$ws.CreateShortcut((Join-Path $s 'Wytch RPC.lnk')); $lnk.TargetPath='%~dp0wytch-rpc.vbs'; $lnk.WorkingDirectory='%~dp0'; $lnk.Description='Wytch RPC'; $lnk.Save(); Write-Host ''; Write-Host 'OK! Atalho criado em:' $s"

echo.
echo Pronto! O Wytch RPC vai iniciar junto com o Windows.
echo (Para remover, apague o atalho "Wytch RPC" na pasta Inicializar.)
pause
