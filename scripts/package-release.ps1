param()
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
Set-Location -LiteralPath $root
if (-not $IsWindows -or -not [Environment]::Is64BitOperatingSystem) { throw 'Windows x64 is required.' }
$version = (Get-Content package.json -Raw | ConvertFrom-Json).version
$cargo = Get-Content Cargo.toml -Raw
if ($cargo -notmatch ('(?s)\[workspace.package\].*?version = "' + [regex]::Escape($version) + '"')) { throw 'Version mismatch.' }
$staged = 'src-tauri/resources/codex/VERSION.txt'
if (-not (Test-Path -LiteralPath $staged)) {
  node scripts/prepare-codex.mjs
  if ($LASTEXITCODE -ne 0) { throw 'CLI staging failed.' }
}
if ((Get-Content $staged -Raw) -notmatch 'Codex CLI 0\.163\.0 ') { throw 'Unexpected staged Codex version; stage the pinned CLI again.' }
bun tauri build
if ($LASTEXITCODE -ne 0) { throw 'Tauri build failed.' }
$out = Join-Path $root 'release-assets'
New-Item -ItemType Directory -Path $out -Force | Out-Null
$name = "Codex-Lemma_${version}_x64-setup.exe"
$source = Join-Path $root "target/release/bundle/nsis/Codex Lemma_${version}_x64-setup.exe"
Copy-Item -LiteralPath $source -Destination (Join-Path $out $name) -Force
$hash = (Get-FileHash -LiteralPath (Join-Path $out $name) -Algorithm SHA256).Hash.ToLowerInvariant()
Set-Content -LiteralPath (Join-Path $out 'SHA256SUMS.txt') -Value "$hash  $name" -Encoding utf8NoBOM
Write-Host "Release assets: $out"
Write-Host "SHA256: $hash"
