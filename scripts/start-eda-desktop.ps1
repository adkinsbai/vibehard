param([string]$Distro = 'Ubuntu', [int]$Port = 6081, [string]$DataRoot = '')
$ErrorActionPreference = 'Stop'
$repo = Split-Path $PSScriptRoot -Parent
$data = Join-Path $repo '.eda-data'
New-Item -ItemType Directory -Force -Path $data | Out-Null
$rootSetting = Join-Path $data 'desktop-data-root'
if ($DataRoot) { [IO.File]::WriteAllText($rootSetting, $DataRoot, [Text.UTF8Encoding]::new($false)) }
elseif (Test-Path -LiteralPath $rootSetting) { $DataRoot = [IO.File]::ReadAllText($rootSetting).Trim() }
$tokenPath = Join-Path $data 'desktop-token'
if (-not (Test-Path -LiteralPath $tokenPath)) {
    $bytes = New-Object byte[] 48
    $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    $rng.GetBytes($bytes)
    $rng.Dispose()
    [IO.File]::WriteAllText($tokenPath, [Convert]::ToBase64String($bytes), [Text.UTF8Encoding]::new($false))
}
$envPath = Join-Path $repo '.env.local'
$settings = if (Test-Path -LiteralPath $envPath) { [IO.File]::ReadAllLines($envPath) } else { @() }
$settings = @($settings | Where-Object { $_ -notmatch '^EDA_DESKTOP_(URL|TOKEN_FILE)=' })
$settings += "EDA_DESKTOP_URL=http://127.0.0.1:$Port"
$settings += 'EDA_DESKTOP_TOKEN_FILE="' + $tokenPath.Replace('\', '/') + '"'
[IO.File]::WriteAllLines($envPath, $settings, [Text.UTF8Encoding]::new($false))
$script = Join-Path $repo 'services\eda-desktop\server.py'
$linuxScript = (& wsl.exe -d $Distro --exec wslpath -u $script.Replace('\', '/'))
if ($LASTEXITCODE -ne 0) { throw 'Cannot resolve WSL script path' }
$linuxScript = $linuxScript.Trim()
$linuxToken = (& wsl.exe -d $Distro --exec wslpath -u $tokenPath.Replace('\', '/'))
if ($LASTEXITCODE -ne 0) { throw 'Cannot resolve WSL token path' }
$linuxToken = $linuxToken.Trim()
Write-Host "Starting local KiCad desktop broker on 127.0.0.1:$Port. Keep this terminal running."
Write-Host 'The token is stored in ignored .eda-data; existing environment settings were preserved.'
$arguments = @('-d', $Distro, '--exec', 'env', "EDA_DESKTOP_TOKEN_FILE=$linuxToken", "EDA_DESKTOP_PORT=$Port")
if ($DataRoot) { $arguments += "EDA_DESKTOP_DATA=$DataRoot" }
$arguments += @('python3', $linuxScript)
& wsl.exe @arguments
exit $LASTEXITCODE
