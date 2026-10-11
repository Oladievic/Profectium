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
# Check support before creating any backup destination.
& $nodePath --input-type=module -e "import { backup } from 'node:sqlite'; if (typeof backup !== 'function') process.exit(1);"
if ($LASTEXITCODE -ne 0) { throw 'This Node.js version does not support SQLite backups. Install Node.js 24 LTS. No database was changed.' }
& $nodePath (Join-Path $projectPath 'scripts/backup-local.mjs')
if ($LASTEXITCODE -ne 0) { throw 'Backup failed. Existing database was not changed.' }
