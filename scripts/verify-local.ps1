param(
  [Parameter(Mandatory=$true)][string]$PythonPath,
  [string]$NodePath = 'node'
)
# Local tests only: no downloads, credentials, provider requests or deployment.
$ErrorActionPreference = 'Stop'
$repoRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$pythonCommand = Get-Command $PythonPath -ErrorAction Stop
$nodeCommand = Get-Command $NodePath -ErrorAction Stop
if ($pythonCommand.Source -like '*\WindowsApps\*') {
  throw 'Provide a real Python executable, not the Windows Store alias.'
}
$tscPath = Join-Path $repoRoot 'apps/mobile/node_modules/typescript/bin/tsc'
if (-not (Test-Path -LiteralPath $tscPath)) {
  throw 'Mobile dependencies are missing. Follow apps/mobile/README.md before verification; this script installs nothing.'
}

function Invoke-LocalCheck {
  param([string]$Label, [string]$Directory, [string]$Executable, [string[]]$Arguments)
  Write-Host "Running: $Label"
  Push-Location -LiteralPath $Directory
  try {
    & $Executable @Arguments
    if ($LASTEXITCODE -ne 0) { throw "$Label failed with exit code $LASTEXITCODE" }
  } finally { Pop-Location }
}

Invoke-LocalCheck 'Data and recorded OSM replay tests' $repoRoot $pythonCommand.Source @('-B', '-m', 'unittest', 'discover', '-s', 'tests/data', '-v')
Invoke-LocalCheck 'No-charge policy tests' (Join-Path $repoRoot 'packages/spend-policy') $nodeCommand.Source @('--experimental-strip-types', '--test', 'test/spend-policy.test.ts')
Invoke-LocalCheck 'No-charge policy strict types' (Join-Path $repoRoot 'packages/spend-policy') $nodeCommand.Source @($tscPath, '--noEmit', '--strict', '--target', 'es2022', '--module', 'nodenext', '--moduleResolution', 'nodenext', 'src/index.ts')
Invoke-LocalCheck 'Mobile strict types' (Join-Path $repoRoot 'apps/mobile') $nodeCommand.Source @($tscPath, '--noEmit')
Invoke-LocalCheck 'Mobile lifecycle regression with simulated OS adapters' (Join-Path $repoRoot 'apps/mobile') $nodeCommand.Source @('--test', 'tests/walkDiagnostic.test.cjs')
Invoke-LocalCheck 'Editorial progression, actual SQLite persistence and priority Stop' (Join-Path $repoRoot 'apps/mobile') $nodeCommand.Source @('--experimental-sqlite', '--test', 'tests/walkEngine.test.cjs', 'tests/walkRepository.test.cjs', 'tests/priorityStop.test.cjs', 'tests/preparedWalk.test.cjs')
Invoke-LocalCheck 'Editorial catalog malformed-input checks (synthetic, in memory only)' $repoRoot $pythonCommand.Source @('-B', 'tools/first_walk/build_catalog.py', '--self-test')
Write-Host 'Available local checks passed. This does not accept Android runtime, GPS, offline assets, live RAG or field gates.'
