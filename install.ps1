# Installs wmpy, the command-line tool for WM Keyboard's Python plugins, on Windows.
#
#   powershell -ExecutionPolicy Bypass -c "irm https://raw.githubusercontent.com/wasi-master/wmpy/main/install.ps1 | iex"
#
# Downloads the release build for this computer from GitHub, checks it against
# the release's SHA-256, puts wmpy.exe in %LOCALAPPDATA%\Programs\wmpy\bin (or
# $env:WMPY_INSTALL_DIR) and adds that folder to your user PATH. Set
# $env:WMPY_VERSION to pick a release, and $env:WMPY_NO_MODIFY_PATH=1 to leave
# PATH alone.

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

$repo = 'https://github.com/wasi-master/wmpy'
$version = if ($env:WMPY_VERSION) { $env:WMPY_VERSION.TrimStart('v') } else { '' }
$dir = if ($env:WMPY_INSTALL_DIR) { $env:WMPY_INSTALL_DIR } else { Join-Path $env:LOCALAPPDATA 'Programs\wmpy\bin' }

$arch = if ($env:PROCESSOR_ARCHITEW6432) { $env:PROCESSOR_ARCHITEW6432 } else { $env:PROCESSOR_ARCHITECTURE }
switch ($arch) {
    'AMD64' { $cpu = 'x86_64' }
    'ARM64' { $cpu = 'aarch64' }
    default { throw "wmpy install: no wmpy build for $arch. Install it with: cargo install --git https://github.com/wasi-master/wmkeyboard wmpy" }
}

$asset = "wmpy-$cpu-pc-windows-msvc.zip"
$base = if ($env:WMPY_DOWNLOAD_BASE) { $env:WMPY_DOWNLOAD_BASE }
        elseif ($version) { "$repo/releases/download/v$version" }
        else { "$repo/releases/latest/download" }

$tmp = Join-Path ([IO.Path]::GetTempPath()) ("wmpy-" + [Guid]::NewGuid())
New-Item -ItemType Directory -Path $tmp | Out-Null
try {
    Write-Host "wmpy install: downloading $base/$asset"
    [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
    Invoke-WebRequest -UseBasicParsing -Uri "$base/$asset" -OutFile (Join-Path $tmp $asset)
    Invoke-WebRequest -UseBasicParsing -Uri "$base/$asset.sha256" -OutFile (Join-Path $tmp "$asset.sha256")

    $line = (Get-Content (Join-Path $tmp "$asset.sha256") | Select-Object -First 1)
    if ($line -notmatch '^\s*([0-9a-fA-F]{64})') { throw "wmpy install: $asset.sha256 holds no SHA-256" }
    $want = $Matches[1].ToLowerInvariant()
    $got = (Get-FileHash -Algorithm SHA256 (Join-Path $tmp $asset)).Hash.ToLowerInvariant()
    if ($want -ne $got) { throw "wmpy install: $asset does not match its SHA-256 (expected $want, got $got)" }

    Expand-Archive -Path (Join-Path $tmp $asset) -DestinationPath (Join-Path $tmp 'out') -Force
    $exe = Join-Path $tmp 'out\wmpy.exe'
    if (-not (Test-Path $exe)) { throw "wmpy install: $asset has no wmpy.exe in it" }

    New-Item -ItemType Directory -Force -Path $dir | Out-Null
    $dest = Join-Path $dir 'wmpy.exe'
    # A running wmpy.exe (an editor's language server) cannot be overwritten, but it can be renamed.
    if (Test-Path $dest) { Move-Item -Force $dest "$dest.old" -ErrorAction SilentlyContinue }
    Copy-Item $exe $dest -Force
    Remove-Item "$dest.old" -Force -ErrorAction SilentlyContinue
    $installed = try { & $dest --version 2>$null } catch { 'wmpy' }
    Write-Host "wmpy install: installed $installed to $dest"

    $userPath = [Environment]::GetEnvironmentVariable('Path', 'User')
    $parts = if ($userPath) { $userPath.Split(';') } else { @() }
    if ($parts -notcontains $dir) {
        if ($env:WMPY_NO_MODIFY_PATH) {
            Write-Host "wmpy install: $dir is not on your PATH."
        } else {
            [Environment]::SetEnvironmentVariable('Path', (($parts + $dir) | Where-Object { $_ }) -join ';', 'User')
            Write-Host "wmpy install: added $dir to your user PATH. Open a new terminal to use wmpy."
        }
    }
} finally {
    Remove-Item -Recurse -Force $tmp -ErrorAction SilentlyContinue
}
