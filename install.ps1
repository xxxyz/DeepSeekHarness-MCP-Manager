# dsh-mcp-manager install.ps1 — Windows installer (thin wrapper around install.mjs)
#
#   .\dsh-mcp-manager\install.ps1                      # default: ~/.dsh, web profile
#   .\install.ps1 -DshHome D:\path\.dsh -Profile web
#   .\install.ps1 -Repair -Port 3080
#
# See install.mjs for the full cross-platform logic and options.
[CmdletBinding()]
param(
  [string]$DshHome,
  [string]$Profile = '',
  [int]$Port = 0,
  [switch]$Repair,
  [switch]$SkipPatch,
  [switch]$Help
)

$ErrorActionPreference = 'Stop'

$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$mjs = Join-Path $scriptDir 'install.mjs'

$node = Get-Command node -ErrorAction SilentlyContinue
if (-not $node) {
  Write-Error '未找到 node 命令，请先安装 Node.js 18+（https://nodejs.org）'
  exit 1
}

if ($Help) {
  & $node $mjs '--help'
  exit $LASTEXITCODE
}

# Build the argument list as separate elements so paths with spaces survive.
$argsList = [System.Collections.Generic.List[string]]::new()
if ($DshHome)  { $argsList.Add('--dsh-home'); $argsList.Add($DshHome) }
if ($Profile)  { $argsList.Add('--profile');  $argsList.Add($Profile) }
if ($Port -gt 0) { $argsList.Add('--port');   $argsList.Add([string]$Port) }
if ($Repair)   { $argsList.Add('--repair') }
if ($SkipPatch){ $argsList.Add('--skip-patch') }

& $node $mjs @argsList
exit $LASTEXITCODE
