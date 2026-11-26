# Tests install.ps1 against a fake release served on 127.0.0.1: a good
# download installs, a wrong SHA-256 is refused. Needs python on PATH.
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$work = Join-Path ([IO.Path]::GetTempPath()) ("wmpy-test-" + [Guid]::NewGuid())
New-Item -ItemType Directory -Path $work | Out-Null
python (Join-Path $root 'scripts/fake_release.py') (Join-Path $work 'rel') 9.9.9 | Out-Null
$server = Start-Process python -ArgumentList '-m', 'http.server', '8765', '--bind', '127.0.0.1', '--directory', (Join-Path $work 'rel') -PassThru -WindowStyle Hidden
Start-Sleep -Seconds 2
try {
    $env:WMPY_DOWNLOAD_BASE = 'http://127.0.0.1:8765'
    $env:WMPY_INSTALL_DIR = Join-Path $work 'bin'
    $env:WMPY_NO_MODIFY_PATH = '1'
    & (Join-Path $root 'install.ps1')
    if (-not (Test-Path (Join-Path $work 'bin\wmpy.exe'))) { throw 'FAIL: wmpy.exe was not installed' }
    Write-Host 'ok   a good release installs'

    $cpu = if ($env:PROCESSOR_ARCHITECTURE -eq 'ARM64') { 'aarch64' } else { 'x86_64' }
    $asset = "wmpy-$cpu-pc-windows-msvc.zip"
    Set-Content -Path (Join-Path $work "rel\$asset.sha256") -Value ('0' * 64 + "  $asset")
    $env:WMPY_INSTALL_DIR = Join-Path $work 'bin2'
    $failed = $false
    try { & (Join-Path $root 'install.ps1') } catch { $failed = $_.Exception.Message -match 'does not match its SHA-256' }
    if (-not $failed) { throw 'FAIL: a wrong SHA-256 was not refused' }
    if (Test-Path (Join-Path $work 'bin2\wmpy.exe')) { throw 'FAIL: wmpy.exe was left behind' }
    Write-Host 'ok   a wrong SHA-256 is refused'
} finally {
    Stop-Process -Id $server.Id -Force -ErrorAction SilentlyContinue
    Remove-Item -Recurse -Force $work -ErrorAction SilentlyContinue
}
