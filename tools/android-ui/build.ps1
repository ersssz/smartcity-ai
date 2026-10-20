param()
$ErrorActionPreference = 'Stop'
$repoRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$taskWorkspaceRoot = Split-Path -Parent (Split-Path -Parent $repoRoot)
$toolchain = Join-Path $taskWorkspaceRoot 'work/android-toolchain'
$sdk = Join-Path $toolchain 'sdk'
$jdk = Join-Path $toolchain 'gradle-cache/jdks/eclipse_adoptium-17-amd64-windows.2'
$buildTools = Join-Path $sdk 'build-tools/37.0.0'
$androidJar = Join-Path $sdk 'platforms/android-37.0/android.jar'
$buildRoot = [IO.Path]::GetFullPath((Join-Path $taskWorkspaceRoot 'work/android-ui-build'))
$workRoot = [IO.Path]::GetFullPath((Join-Path $taskWorkspaceRoot 'work'))
if (!$buildRoot.StartsWith($workRoot + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) { throw 'Build path escapes task work directory' }
$manifestFile = Join-Path $PSScriptRoot 'AndroidManifest.xml'
[xml]$manifest = Get-Content -LiteralPath $manifestFile -Raw
$androidNs = 'http://schemas.android.com/apk/res/android'
if ($manifest.manifest.package -ne 'kz.astanaai.diagnostics.test' -or $manifest.manifest.instrumentation.GetAttribute('targetPackage', $androidNs) -ne 'kz.astanaai.diagnostics') { throw 'Unexpected instrumentation package/target' }
if ($manifest.SelectNodes('/manifest/uses-permission | /manifest/uses-permission-sdk-23 | /manifest/application/activity | /manifest/application/activity-alias | /manifest/application/service | /manifest/application/receiver | /manifest/application/provider').Count -ne 0) { throw 'Test APK must have no permissions or application endpoints' }
$runDir = Join-Path $buildRoot ('build-' + (Get-Date -Format 'yyyyMMdd-HHmmss-fff'))
foreach ($part in @('classes','dex','policy-tests')) { New-Item -ItemType Directory -Path (Join-Path $runDir $part) -Force | Out-Null }
$java = Join-Path $jdk 'bin/java.exe'
$javac = Join-Path $jdk 'bin/javac.exe'
$jar = Join-Path $jdk 'bin/jar.exe'
$aapt2 = Join-Path $buildTools 'aapt2.exe'
$zipalign = Join-Path $buildTools 'zipalign.exe'
$d8 = Join-Path $buildTools 'lib/d8.jar'
$signer = Join-Path $buildTools 'lib/apksigner.jar'
$debugKey = Join-Path $repoRoot 'apps/mobile/android/app/debug.keystore'
foreach ($inputFile in @($java,$javac,$jar,$androidJar,$aapt2,$zipalign,$d8,$signer,$debugKey)) { if (!(Test-Path -LiteralPath $inputFile -PathType Leaf)) { throw "Existing tool not found: $inputFile" } }
function Assert-Exit([string]$phase) { if ($LASTEXITCODE -ne 0) { throw "$phase failed: $LASTEXITCODE" } }
$policy = Join-Path $PSScriptRoot 'src/kz/astanaai/diagnostics/test/UiPolicy.java'
& $javac '-encoding' 'UTF-8' '-d' (Join-Path $runDir 'policy-tests') $policy (Join-Path $PSScriptRoot 'src/kz/astanaai/diagnostics/test/AndroidPolicyProbe.java') (Join-Path $PSScriptRoot 'tests/UiPolicyTest.java')
Assert-Exit 'Policy compilation'
& $java '-cp' (Join-Path $runDir 'policy-tests') 'kz.astanaai.diagnostics.test.UiPolicyTest'
Assert-Exit 'Policy Interface tests'
$sources = @((Get-ChildItem -LiteralPath (Join-Path $PSScriptRoot 'src') -Recurse -Filter '*.java' -File).FullName)
& $javac '--release' '8' '-encoding' 'UTF-8' '-classpath' $androidJar '-d' (Join-Path $runDir 'classes') @sources
Assert-Exit 'Instrumentation Java compilation'
$classFiles = @((Get-ChildItem -LiteralPath (Join-Path $runDir 'classes') -Recurse -Filter '*.class' -File).FullName)
& $java '-cp' $d8 'com.android.tools.r8.D8' '--min-api' '26' '--lib' $androidJar '--output' (Join-Path $runDir 'dex') @classFiles
Assert-Exit 'D8'
$base = Join-Path $runDir 'base.apk'
& $aapt2 'link' '--manifest' $manifestFile '-I' $androidJar '--min-sdk-version' '26' '--target-sdk-version' '37' '--version-code' '1' '--version-name' '1.0' '-o' $base
Assert-Exit 'Manifest link'
& $jar 'uf' $base '-C' (Join-Path $runDir 'dex') 'classes.dex'
Assert-Exit 'DEX package'
$aligned = Join-Path $runDir 'aligned.apk'
& $zipalign '-f' '4' $base $aligned
Assert-Exit 'ZIP alignment'
$signed = Join-Path $runDir 'astanaai-own-ui-test.apk'
# Android's standard public debug credentials only; no release/private credential loading.
& $java '-jar' $signer 'sign' '--ks' $debugKey '--ks-key-alias' 'androiddebugkey' '--ks-pass' 'pass:android' '--key-pass' 'pass:android' '--out' $signed $aligned
Assert-Exit 'Public debug signing'
& $java '-jar' $signer 'verify' '--verbose' $signed
Assert-Exit 'Signature verification'
& $zipalign '-c' '4' $signed
Assert-Exit 'Final ZIP verification'
& (Join-Path $buildTools 'aapt.exe') 'dump' 'badging' $signed
Assert-Exit 'Manifest inspection'
$stable = Join-Path $buildRoot 'astanaai-own-ui-test.apk'
Copy-Item -LiteralPath $signed -Destination $stable -Force
$hash = (Get-FileHash -LiteralPath $stable -Algorithm SHA256).Hash.ToLowerInvariant()
$sourceHashes = @(@($manifestFile) + $sources | ForEach-Object { [ordered]@{ path=$_; sha256=(Get-FileHash -LiteralPath $_ -Algorithm SHA256).Hash.ToLowerInvariant() } })
$metadata = [ordered]@{ apk=$stable; sha256=$hash; bytes=(Get-Item -LiteralPath $stable).Length; build=$runDir; targetPackage='kz.astanaai.diagnostics'; instrumentation='kz.astanaai.diagnostics.test/kz.astanaai.diagnostics.test.OwnUiInstrumentation'; permissions=@(); phoneRun=$false; sources=$sourceHashes }
$metadata | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $buildRoot 'build-result.json') -Encoding utf8
$metadata | ConvertTo-Json
