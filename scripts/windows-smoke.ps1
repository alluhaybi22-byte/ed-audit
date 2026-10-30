$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root
$package = Get-Content package.json -Raw | ConvertFrom-Json
$version = $package.version
$setup = Join-Path $root "release/ED-Audit-$version-win-x64-Setup.exe"
$portable = Join-Path $root "release/ED-Audit-$version-win-x64-Portable.exe"
$scratch = Join-Path ([IO.Path]::GetTempPath()) ('EDAudit-Smoke-' + [guid]::NewGuid())
$installDir = Join-Path $scratch 'Installed'
$profile = Join-Path $scratch 'Profile'
New-Item -ItemType Directory -Path $scratch | Out-Null

function Install-Audit {
    $process = Start-Process -FilePath $setup -ArgumentList @('/S', "/D=$installDir") -Wait -PassThru
    if ($process.ExitCode -ne 0) { throw "Installer failed: $($process.ExitCode)" }
    if (!(Test-Path (Join-Path $installDir 'ED-Audit.exe'))) { throw 'Installed executable not found' }
}

try {
    Install-Audit
    $installed = Join-Path $installDir 'ED-Audit.exe'
    $env:ED_AUDIT_EXECUTABLE = $installed
    npx --no-install playwright test -c desktop-tests/playwright.config.mjs desktop.spec.mjs
    if ($LASTEXITCODE -ne 0) { throw 'Installed application tests failed' }

    $env:ED_AUDIT_MIGRATION_PROFILE = $profile
    $env:ED_AUDIT_MIGRATION_EXECUTABLES = ConvertTo-Json -InputObject @($installed, $portable, $installed) -Compress
    npx --no-install playwright test -c desktop-tests/playwright.config.mjs migration.spec.mjs
    if ($LASTEXITCODE -ne 0) { throw 'Installed/portable profile migration failed' }

    Install-Audit
    $env:ED_AUDIT_MIGRATION_EXECUTABLES = ConvertTo-Json -InputObject @($installed) -Compress
    npx --no-install playwright test -c desktop-tests/playwright.config.mjs migration.spec.mjs
    if ($LASTEXITCODE -ne 0) { throw 'Reinstallation did not retain saved work' }
} finally {
    Remove-Item Env:ED_AUDIT_EXECUTABLE -ErrorAction SilentlyContinue
    Remove-Item Env:ED_AUDIT_MIGRATION_PROFILE -ErrorAction SilentlyContinue
    Remove-Item Env:ED_AUDIT_MIGRATION_EXECUTABLES -ErrorAction SilentlyContinue
}
