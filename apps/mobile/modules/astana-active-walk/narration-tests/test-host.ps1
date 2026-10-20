param(
  [string]$JdkRoot=(Join-Path $PSScriptRoot '../../../../../../../work/android-toolchain/gradle-cache/jdks/eclipse_adoptium-17-amd64-windows.2'),
  [string]$GradleCache=(Join-Path $PSScriptRoot '../../../../../../../work/android-toolchain/gradle-cache')
)
$ErrorActionPreference='Stop'
$jarRoot=Join-Path $GradleCache 'caches/modules-2/files-2.1'
function Find-CachedJar([string]$Group,[string]$Artifact,[string]$Version) {
  $matches=@(Get-ChildItem -LiteralPath (Join-Path $jarRoot "$Group/$Artifact/$Version") -Recurse -File -Filter "$Artifact-$Version.jar")
  if($matches.Count -ne 1){throw "Expected one cached JAR: $Artifact $Version"}; return $matches[0].FullName
}
$stdlib=Find-CachedJar 'org.jetbrains.kotlin' 'kotlin-stdlib' '2.2.10'
$annotations=Find-CachedJar 'org.jetbrains' 'annotations' '13.0'
$compilerJars=@((Find-CachedJar 'org.jetbrains.kotlin' 'kotlin-compiler-embeddable' '2.2.10'),$stdlib,
  (Find-CachedJar 'org.jetbrains.kotlin' 'kotlin-script-runtime' '2.2.10'),
  (Find-CachedJar 'org.jetbrains.kotlin' 'kotlin-reflect' '1.6.10'),
  (Find-CachedJar 'org.jetbrains.kotlin' 'kotlin-daemon-embeddable' '2.2.10'),
  (Find-CachedJar 'org.jetbrains.kotlinx' 'kotlinx-coroutines-core-jvm' '1.8.0'),$annotations)
$outDir=Join-Path $PSScriptRoot 'build'
New-Item -ItemType Directory -Path $outDir -Force | Out-Null
$jar=Join-Path $outDir 'host-tests.jar'
$sourceRoot=Join-Path $PSScriptRoot '../android/src/main/java/kz/astanaai/activewalk/narration'
$sources=@((Join-Path $sourceRoot 'BackgroundAudioMachine.kt'),
  (Join-Path $sourceRoot 'AudioRuntimeCore.kt'),
  (Join-Path $sourceRoot 'NarrationCoordinator.kt'),(Join-Path $sourceRoot 'NarrationBridgeHelper.kt'),(Join-Path $sourceRoot 'NarrationBridgeFacade.kt'),
  (Join-Path $PSScriptRoot 'MediaSessionScopeRegressionTest.kt'),
  (Join-Path $PSScriptRoot 'NarrationCoordinatorTest.kt'))
$java=Join-Path $JdkRoot 'bin/java.exe'
& $java '-Xmx384m' '-cp' ($compilerJars -join ';') 'org.jetbrains.kotlin.cli.jvm.K2JVMCompiler' '-no-stdlib' '-no-reflect' '-classpath' "$stdlib;$annotations" '-jvm-target' '17' '-d' $jar @sources
if($LASTEXITCODE -ne 0){throw 'Host source compilation failed'}
& $java '-Xmx128m' '-cp' "$jar;$stdlib" 'kz.astanaai.activewalk.narration.NarrationCoordinatorTestKt'
if($LASTEXITCODE -ne 0){throw 'Host tests failed'}
