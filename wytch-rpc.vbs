Option Explicit
Dim fso, sh, dir, ps1
Set fso = CreateObject("Scripting.FileSystemObject")
Set sh = CreateObject("WScript.Shell")
dir = fso.GetParentFolderName(WScript.ScriptFullName)
ps1 = dir & "\tray.ps1"
If Not fso.FileExists(ps1) Then
  MsgBox "tray.ps1 nao encontrado nesta pasta.", 48, "Wytch RPC"
  WScript.Quit
End If
sh.CurrentDirectory = dir
sh.Run "powershell -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File """ & ps1 & """", 0, False
