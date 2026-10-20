param(
    [Parameter(Mandatory = $true)][string]$JdkRoot,
    [Parameter(Mandatory = $true)][string]$GradleCache
)
$ErrorActionPreference = 'Stop'
$moduleRoot = Split-Path -Parent $PSScriptRoot
$jarRoot = Join-Path $GradleCache 'caches/modules-2/files-2.1'
function Find-CachedJar([string]$Group, [string]$Artifact, [string]$Version) {
    $folder = Join-Path $jarRoot "$Group/$Artifact/$Version"
    $matches = @(Get-ChildItem -LiteralPath $folder -Recurse -File -Filter "$Artifact-$Version.jar")
    if ($matches.Count -ne 1) { throw "Expected one existing cached JAR: $Artifact $Version" }
    return $matches[0].FullName
}
$stdlib = Find-CachedJar 'org.jetbrains.kotlin' 'kotlin-stdlib' '2.2.10'
$annotations = Find-CachedJar 'org.jetbrains' 'annotations' '13.0'
$compilerJars = @(
    (Find-CachedJar 'org.jetbrains.kotlin' 'kotlin-compiler-embeddable' '2.2.10'),
    $stdlib,
    (Find-CachedJar 'org.jetbrains.kotlin' 'kotlin-script-runtime' '2.2.10'),
    (Find-CachedJar 'org.jetbrains.kotlin' 'kotlin-reflect' '1.6.10'),
    (Find-CachedJar 'org.jetbrains.kotlin' 'kotlin-daemon-embeddable' '2.2.10'),
    (Find-CachedJar 'org.jetbrains.kotlinx' 'kotlinx-coroutines-core-jvm' '1.8.0'),
    $annotations
)
$java = Join-Path $JdkRoot 'bin/java.exe'
$outDir = Join-Path $moduleRoot 'android/build/session-tests'
[void](New-Item -ItemType Directory -Path $outDir -Force)
$jar = Join-Path $outDir 'session-tests.jar'
$sources = @(
    (Join-Path $moduleRoot 'android/src/main/java/kz/astanaai/activewalk/WalkSession.kt'),
    (Join-Path $moduleRoot 'android/src/test/java/kz/astanaai/activewalk/WalkSessionTest.kt')
)
& $java '-Xmx384m' '-cp' ($compilerJars -join ';') 'org.jetbrains.kotlin.cli.jvm.K2JVMCompiler' '-no-stdlib' '-no-reflect' '-classpath' "$stdlib;$annotations" '-jvm-target' '17' '-d' $jar @sources
if ($LASTEXITCODE -ne 0) { throw 'Native session test compilation failed' }
& $java '-cp' "$jar;$stdlib" 'kz.astanaai.activewalk.WalkSessionTestKt'
if ($LASTEXITCODE -ne 0) { throw 'Native session tests failed' }
