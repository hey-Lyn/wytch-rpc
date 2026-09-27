Option Explicit
Dim fso, sh, dir, exe
Set fso = CreateObject("Scripting.FileSystemObject")
Set sh = CreateObject("WScript.Shell")
dir = fso.GetParentFolderName(WScript.ScriptFullName)
exe = dir & "\wytch-rpc.exe"
If Not fso.FileExists(exe) Then exe = dir & "\dist\wytch-rpc.exe"
If Not fso.FileExists(exe) Then
  MsgBox "wytch-rpc.exe nao encontrado. Rode iniciar.bat ou baixe das Releases.", 48, "Wytch RPC"
  WScript.Quit
End If
sh.CurrentDirectory = fso.GetParentFolderName(exe)
sh.Run """" & exe & """", 0, False
