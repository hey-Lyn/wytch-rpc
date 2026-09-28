Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class WytchWin {
  public delegate bool EnumProc(IntPtr hWnd, IntPtr lParam);
  [DllImport("user32.dll")] public static extern bool EnumWindows(EnumProc cb, IntPtr lParam);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint pid);
  [DllImport("user32.dll")] public static extern bool ShowWindow(IntPtr hWnd, int nCmdShow);
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
  public static IntPtr FindForPid(uint target) {
    IntPtr found = IntPtr.Zero;
    EnumWindows((h, l) => {
      uint pid; GetWindowThreadProcessId(h, out pid);
      if (pid == target) { found = h; return false; }
      return true;
    }, IntPtr.Zero);
    return found;
  }
}
"@

$dir = Split-Path -Parent $MyInvocation.MyCommand.Path

$exe = Join-Path $dir 'wytch-rpc.exe'
if (-not (Test-Path $exe)) { $exe = Join-Path $dir 'dist\wytch-rpc.exe' }

$iconPath = Join-Path $dir 'extension\icons\icon32.png'
if (-not (Test-Path $iconPath)) { $iconPath = Join-Path $dir 'icons\icon32.png' }

function Test-ServerPort {
  try {
    $c = New-Object System.Net.Sockets.TcpClient
    $c.Connect('127.0.0.1', 4444)
    $c.Close()
    return $true
  } catch { return $false }
}

$icon = $null
if (Test-Path $iconPath) {
  $bmp = [System.Drawing.Bitmap]::FromFile($iconPath)
  $icon = [System.Drawing.Icon]::FromHandle($bmp.GetHicon())
}

$script:ni = New-Object System.Windows.Forms.NotifyIcon
if ($icon) { $script:ni.Icon = $icon } else { $script:ni.Icon = [System.Drawing.SystemIcons]::Application }
$script:ni.Text = 'Wytch RPC'
$script:ni.Visible = $true

# Ja existe um servidor? Apenas avisa e some.
if (Test-ServerPort) {
  $script:ni.ShowBalloonTip(3000, 'Wytch RPC', 'Ja esta rodando.', [System.Windows.Forms.ToolTipIcon]::Info)
  $t = New-Object System.Windows.Forms.Timer
  $t.Interval = 3500
  $t.add_Tick({ $script:ni.Visible = $false; [System.Windows.Forms.Application]::Exit() })
  $t.Start()
  [System.Windows.Forms.Application]::Run()
  exit
}

# Inicia o servidor oculto (a janela do console existe, mas escondida).
if (Test-Path $exe) {
  $script:server = Start-Process -FilePath $exe -WorkingDirectory (Split-Path $exe) -WindowStyle Hidden -PassThru
} else {
  $script:server = Start-Process -FilePath 'node' -ArgumentList 'server/server.js' -WorkingDirectory $dir -WindowStyle Hidden -PassThru
}

$menu = New-Object System.Windows.Forms.ContextMenuStrip
$null = $menu.Items.Add('Mostrar terminal', $null, {
  $h = [WytchWin]::FindForPid([uint32]$script:server.Id)
  if ($h -ne [IntPtr]::Zero) {
    [void][WytchWin]::ShowWindow($h, 9)   # SW_RESTORE
    [void][WytchWin]::SetForegroundWindow($h)
  }
})
$null = $menu.Items.Add('Minimizar terminal', $null, {
  $h = [WytchWin]::FindForPid([uint32]$script:server.Id)
  if ($h -ne [IntPtr]::Zero) { [void][WytchWin]::ShowWindow($h, 0) }   # SW_HIDE
})
$null = $menu.Items.Add('-')
$null = $menu.Items.Add('Abrir YouTube', $null, { Start-Process 'https://www.youtube.com/' })
$null = $menu.Items.Add('Status do servidor', $null, { Start-Process 'http://127.0.0.1:4444/' })
$null = $menu.Items.Add('-')
$null = $menu.Items.Add('Cancelar processo', $null, {
  try { if ($script:server -and -not $script:server.HasExited) { $script:server.Kill() } } catch {}
  $script:ni.Visible = $false
  [System.Windows.Forms.Application]::Exit()
})
$script:ni.ContextMenuStrip = $menu
$script:ni.add_MouseDoubleClick({
  $h = [WytchWin]::FindForPid([uint32]$script:server.Id)
  if ($h -ne [IntPtr]::Zero) { [void][WytchWin]::ShowWindow($h, 9); [void][WytchWin]::SetForegroundWindow($h) }
})

# Se o servidor cair, remove o icone.
$timer = New-Object System.Windows.Forms.Timer
$timer.Interval = 2000
$timer.add_Tick({
  if (-not $script:server -or $script:server.HasExited) {
    $script:ni.Visible = $false
    [System.Windows.Forms.Application]::Exit()
  }
})
$timer.Start()

[System.Windows.Forms.Application]::Run()
