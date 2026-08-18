# dsh-mcp-manager uninstall.ps1 — Windows uninstaller (thin wrapper around uninstall.mjs)
#
#   .\dsh-mcp-manager\uninstall.ps1                   # default: ~/.dsh, web profile
#   .\uninstall.ps1 -DshHome D:\path\.dsh -Profile web
[CmdletBinding()]
param(
  [string]$DshHome,
  [string]$Profile = '',
  [switch]$Help
)

$ErrorActionPreference = 'Stop'

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$mjs = Join-Path $scriptDir 'uninstall.mjs'

$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) {
  Write-Error '未找到 node 命令，请先安装 Node.js 18+（https://nodejs.org）'
  exit 1
}

if ($Help) {
  & $node $mjs '--help'
  exit $LASTEXITCODE
}

$argsList = [System.Collections.Generic.List[string]]::new()
if ($DshHome) { $argsList.Add('--dsh-home'); $argsList.Add($DshHome) }
if ($Profile) { $argsList.Add('--profile');  $argsList.Add($Profile) }

& $node $mjs @argsList
exit $LASTEXITCODE
