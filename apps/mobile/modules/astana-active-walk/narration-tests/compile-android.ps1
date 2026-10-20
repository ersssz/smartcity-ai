param(
  [string]$JdkRoot=(Join-Path $PSScriptRoot '../../../../../../../work/android-toolchain/gradle-cache/jdks/eclipse_adoptium-17-amd64-windows.2'),
  [string]$GradleCache=(Join-Path $PSScriptRoot '../../../../../../../work/android-toolchain/gradle-cache'),
  [string]$AndroidJar=(Join-Path $PSScriptRoot '../../../../../../../work/android-toolchain/sdk/platforms/android-37.0/android.jar'),
  [string]$FrozenPreparedPlayerSource=(Join-Path $PSScriptRoot '../android/src/main/java/kz/astanaai/activewalk/PreparedAudioPlayer.kt')
)
$ErrorActionPreference='Stop'
$jarRoot=Join-Path $GradleCache 'caches/modules-2/files-2.1'
function Find-CachedJar([string]$Group,[string]$Artifact,[string]$Version) {
  $matches=@(Get-ChildItem -LiteralPath (Join-Path $jarRoot "$Group/$Artifact/$Version") -Recurse -File -Filter "$Artifact-$Version.jar")
  if($matches.Count -ne 1){throw "Expected one existing cached JAR: $Artifact $Version"}; return $matches[0].FullName
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
$sourceRoot=Join-Path $PSScriptRoot '../android/src/main/java/kz/astanaai/activewalk/narration'
$sources=@((Get-ChildItem -LiteralPath $sourceRoot -Filter '*.kt' -File).FullName)+@((Resolve-Path -LiteralPath $FrozenPreparedPlayerSource).Path)
$java=Join-Path $JdkRoot 'bin/java.exe'
& $java '-Xmx384m' '-cp' ($compilerJars -join ';') 'org.jetbrains.kotlin.cli.jvm.K2JVMCompiler' '-no-stdlib' '-no-reflect' '-classpath' "$stdlib;$annotations;$AndroidJar" '-jvm-target' '17' '-d' (Join-Path $outDir 'staging-android-host.jar') @sources
if($LASTEXITCODE -ne 0){throw 'Staging Android host compilation failed'}
Write-Output 'PRODUCTION NARRATION PACKAGE COMPILES; Root bindings/Manifest/adoption/device acceptance are separate'
