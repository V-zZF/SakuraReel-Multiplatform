$ErrorActionPreference = 'Stop'
$repo = Split-Path -Parent $PSScriptRoot
Set-Location (Join-Path $repo 'ui')

npm ci
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

npm run tauri -- build --bundles nsis
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

Write-Host "NSIS installer: $repo\src-tauri\target\release\bundle\nsis\"
