<#
 * Copyright (c) 2026 Криницин Вячеслав Александрович - Oladievic.
 * Все права сохранены.
 *
 * Автор: Криницин Вячеслав Александрович
#>
param([switch]$NoBrowser,[switch]$Offline,[ValidateRange(1024,65535)][int]$Port=5190)
$ErrorActionPreference='Stop'
$taskRoot=Split-Path -Parent $PSScriptRoot
$designPath=Join-Path $taskRoot 'design'
$serverPath=Join-Path $taskRoot 'platform/scripts/start-redesign.mjs'
$nodePath=Join-Path $PSScriptRoot 'runtime/node.exe'
foreach($required in @($designPath,$serverPath)){
 if(!(Test-Path -LiteralPath $required)){throw "Required file is missing: $required. Download and unpack the complete repository again."}
}
if(!(Test-Path -LiteralPath $nodePath)){
 $globalNode=Get-Command node.exe -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
 if($globalNode){$nodePath=$globalNode.Source}else{throw "Install Node.js 24 LTS, then run Setup-Profectium.cmd once and reopen Start-Profectium.cmd."}
}
$nodeVersionText = & $nodePath -p 'process.versions.node'
if ($LASTEXITCODE -ne 0 -or [version]$nodeVersionText -lt [version]'22.16.0') {
 throw 'Node.js 22.16 or newer is required; Node.js 24 LTS is recommended.'
}
$launchArgs=@($serverPath,'--port',[string]$Port)
if($NoBrowser){$launchArgs+='--no-browser'}
if($Offline){$launchArgs+='--offline'}
Push-Location -LiteralPath $taskRoot
try{
 & $nodePath @launchArgs
 if($LASTEXITCODE -ne 0){throw "Profectium server stopped with error $LASTEXITCODE. See the message above."}
}finally{Pop-Location}
