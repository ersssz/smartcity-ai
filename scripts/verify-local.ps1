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
Invoke-LocalCheck 'Canonical bundle and parent-aware revision regressions' (Join-Path $repoRoot 'packages/contracts') $nodeCommand.Source @('--test', 'test/bundle.test.cjs', 'test/review-probes.test.cjs')
Invoke-LocalCheck 'Canonical contract strict types' (Join-Path $repoRoot 'packages/contracts') $nodeCommand.Source @($tscPath, '--noEmit', '--strict', '--noUncheckedIndexedAccess', '--target', 'es2022', '--module', 'nodenext', '--moduleResolution', 'nodenext', 'src/index.ts')
Invoke-LocalCheck 'Generated contract schema and fixtures' (Join-Path $repoRoot 'packages/contracts') $nodeCommand.Source @('scripts/generate-artifacts.cjs', '--check')
Invoke-LocalCheck 'CityEvidence actual-catalog retrieval regressions' (Join-Path $repoRoot 'packages/city-evidence') $nodeCommand.Source @('--test', 'test/*.test.cjs')
Invoke-LocalCheck 'CityEvidence catalog reproducibility' $repoRoot $pythonCommand.Source @('-X', 'utf8', '-B', 'packages/city-evidence/tools/build_catalog.py', '--check')
Invoke-LocalCheck 'Recorded-graph planner and revision regressions' (Join-Path $repoRoot 'packages/walk-planner') $nodeCommand.Source @('--test', 'test/*.test.cjs')
Invoke-LocalCheck 'Recorded planner catalog reproducibility' $repoRoot $pythonCommand.Source @('-X', 'utf8', '-B', 'tools/planner/build_replay_catalog.py', '--check')
Invoke-LocalCheck 'Offline pack real filesystem and SQLite boundaries' (Join-Path $repoRoot 'packages/offline-pack') $nodeCommand.Source @('--experimental-sqlite', '--test', 'test/*.test.mjs')
Invoke-LocalCheck 'Public collection real SQLite and trusted catalog boundaries' (Join-Path $repoRoot 'packages/public-collection') $nodeCommand.Source @('--experimental-sqlite', '--test', 'test/*.test.mjs')
Invoke-LocalCheck 'Private Node workspace strict build' $repoRoot $nodeCommand.Source @('scripts/build-node.cjs')
Invoke-LocalCheck 'Normal Node package export integration' $repoRoot $nodeCommand.Source @('--experimental-sqlite', '--test', 'tests/runtime/*.test.mjs')
Invoke-LocalCheck 'Prepared audio input/model integrity' $repoRoot $pythonCommand.Source @('-X', 'utf8', '-B', '-m', 'unittest', 'discover', '-s', 'tools/audio', '-p', 'test_*.py', '-v')
Invoke-LocalCheck 'APK narration manifest and DEX audit boundaries' $repoRoot $pythonCommand.Source @('-X', 'utf8', '-B', '-m', 'unittest', 'discover', '-s', 'tools/apk', '-p', 'test_audit_narration.py', '-v')
Invoke-LocalCheck 'Canonical narration export and prepared asset binding' $repoRoot $nodeCommand.Source @('--test', 'tools/audio/test_canonical_audio.cjs')
Invoke-LocalCheck 'Mobile strict types' (Join-Path $repoRoot 'apps/mobile') $nodeCommand.Source @($tscPath, '--noEmit')
Invoke-LocalCheck 'Discovery weather, holiday and hook boundaries' (Join-Path $repoRoot 'apps/mobile') $nodeCommand.Source @('--test', 'tests/discoveryContext.test.cjs', 'tests/discoveryContextHook.test.cjs')
Invoke-LocalCheck 'Mobile lifecycle regression with simulated OS adapters' (Join-Path $repoRoot 'apps/mobile') $nodeCommand.Source @('--test', 'tests/walkDiagnostic.test.cjs')
Invoke-LocalCheck 'Editorial progression, actual SQLite persistence and priority Stop' (Join-Path $repoRoot 'apps/mobile') $nodeCommand.Source @('--experimental-sqlite', '--test', 'tests/walkEngine.test.cjs', 'tests/walkRepository.test.cjs', 'tests/priorityStop.test.cjs', 'tests/preparedWalk.test.cjs')
Invoke-LocalCheck 'Canonical mobile session, presentation and prepared audio wrapper' (Join-Path $repoRoot 'apps/mobile') $nodeCommand.Source @('--experimental-sqlite', '--test', 'src/canonical/session.test.cjs', 'tests/canonicalPresentation.test.cjs', 'modules/astana-active-walk/src/preparedAudio.test.cjs')
Invoke-LocalCheck 'Native narration command scope bridge' (Join-Path $repoRoot 'apps/mobile') $nodeCommand.Source @('--test', 'modules/astana-active-walk/src/narration.test.cjs')
Invoke-LocalCheck 'Canonical narration actual React callsite lifecycle' (Join-Path $repoRoot 'apps/mobile') $nodeCommand.Source @('--test', 'tests/canonicalNarrationLifecycle.test.cjs')
Invoke-LocalCheck 'Story progression and persistent finish controls' (Join-Path $repoRoot 'apps/mobile') $nodeCommand.Source @('--test', 'tests/storyProgressAction.test.cjs', 'tests/walkFinishFooter.test.cjs')
Invoke-LocalCheck 'Prepared APK narration packaging identity' $repoRoot $nodeCommand.Source @('tools/audio/package_mobile_audio.cjs', '--check')
Invoke-LocalCheck 'Editorial catalog malformed-input checks (synthetic, in memory only)' $repoRoot $pythonCommand.Source @('-B', 'tools/first_walk/build_catalog.py', '--self-test')
Invoke-LocalCheck 'City guide, actual SQLite preferences and progress priority' (Join-Path $repoRoot 'apps/mobile') $nodeCommand.Source @('--experimental-sqlite', '--test', 'tests/cityPreferences.test.cjs', 'tests/cityCatalog.test.cjs')
Invoke-LocalCheck 'City geometry malformed-input checks (synthetic)' $repoRoot $pythonCommand.Source @('-B', '-m', 'unittest', 'discover', '-s', 'tools/city_intro', '-p', 'test_geometry.py', '-v')
Write-Host 'Available local checks passed. This does not accept Android runtime, GPS, offline assets, live RAG or field gates.'
