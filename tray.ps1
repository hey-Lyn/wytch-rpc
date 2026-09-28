Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

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

# Inicia o servidor sem janela.
if (Test-Path $exe) {
  $script:server = Start-Process -FilePath $exe -WorkingDirectory (Split-Path $exe) -WindowStyle Hidden -PassThru
} else {
  $script:server = Start-Process -FilePath 'node' -ArgumentList 'server/server.js' -WorkingDirectory $dir -WindowStyle Hidden -PassThru
}

$menu = New-Object System.Windows.Forms.ContextMenuStrip
$null = $menu.Items.Add('Abrir YouTube', $null, { Start-Process 'https://www.youtube.com/' })
$null = $menu.Items.Add('Status do servidor', $null, { Start-Process 'http://127.0.0.1:4444/' })
$null = $menu.Items.Add('-')
$null = $menu.Items.Add('Sair', $null, {
  try { if ($script:server -and -not $script:server.HasExited) { $script:server.Kill() } } catch {}
  $script:ni.Visible = $false
  [System.Windows.Forms.Application]::Exit()
})
$script:ni.ContextMenuStrip = $menu
$script:ni.add_MouseDoubleClick({ Start-Process 'https://www.youtube.com/' })

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
