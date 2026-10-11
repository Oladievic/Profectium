<#
 * Copyright (c) 2026 Криницин Вячеслав Александрович - Oladievic.
 * Все права сохранены.
 *
 * Автор: Криницин Вячеслав Александрович
#>
$ErrorActionPreference = 'Stop'
$taskRoot = Split-Path -Parent $PSScriptRoot
$projectPath = Join-Path $taskRoot 'platform'
$nodePath = Join-Path $PSScriptRoot 'runtime/node.exe'
if (!(Test-Path -LiteralPath $nodePath -PathType Leaf)) {
    $nodeCommand = Get-Command node.exe -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
    if (!$nodeCommand) { throw 'Install Node.js 24 LTS with npm and reopen this launcher. Nothing was downloaded. See docs/LOCAL_START.txt.' }
    $nodePath = $nodeCommand.Source
}
$nodeVersionText = & $nodePath -p 'process.versions.node'
if ($LASTEXITCODE -ne 0 -or [version]$nodeVersionText -lt [version]'22.16.0') {
    throw 'Node.js 22.16 or newer is required; Node.js 24 LTS is recommended. Nothing was installed.'
}
$env:PATH = (Split-Path -Parent $nodePath) + ';' + $env:PATH
$env:WRANGLER_SEND_METRICS = 'false'
$env:CLOUDFLARE_CF_FETCH_ENABLED = 'false'
function Invoke-ProjectNpm([string[]]$CommandArgs) {
    $npmPath = Join-Path (Split-Path -Parent $nodePath) 'npm/bin/npm-cli.js'
    if (!(Test-Path -LiteralPath $npmPath -PathType Leaf)) {
        $npmPath = Join-Path (Split-Path -Parent $nodePath) 'node_modules/npm/bin/npm-cli.js'
    }
    if (Test-Path -LiteralPath $npmPath -PathType Leaf) {
        & $nodePath $npmPath @CommandArgs
    } else {
        $npmCommand = Get-Command npm.cmd -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
        if (!$npmCommand) { throw 'npm was not found. Install Node.js with npm and reopen this launcher.' }
        & $npmCommand.Source @CommandArgs
    }
    if ($LASTEXITCODE -ne 0) { throw "Command failed: npm $CommandArgs" }
}
Push-Location -LiteralPath $projectPath
try {
    Write-Host 'Installing project dependencies from package-lock.json. Internet access may be required.'
    Invoke-ProjectNpm @('run','install:ci')
    Write-Host 'Building Profectium for local use.'
    Invoke-ProjectNpm @('run','build')
    Write-Host 'Setup complete. Open Start-Profectium.cmd in the repository root.'
    Write-Host 'It starts the redesign, API and persistent local database. Cloud credentials and deployment are not required.'
} finally {
    Pop-Location
}
