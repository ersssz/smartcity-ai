param(
  [Parameter(Mandatory=$true)][string]$SdkRoot,
  [Parameter(Mandatory=$true)][string]$JdkRoot,
  [Parameter(Mandatory=$true)][string]$CacheRoot,
  [Parameter(Mandatory=$true)][string]$NativeStagingRoot,
  [Parameter(Mandatory=$true)][string]$NinjaPath,
  [ValidateSet('arm64-v8a','x86_64')][string]$Abi = 'arm64-v8a',
  [ValidateSet('Debug','Release')][string]$Variant = 'Debug',
  [ValidateSet('Assemble','ConfigureNative')][string]$BuildAction = 'Assemble'
)
$ErrorActionPreference = 'Stop'
$mobileRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '..'))
$ninjaFullPath = [IO.Path]::GetFullPath($NinjaPath)
$nativeStagingPath = [IO.Path]::GetFullPath($NativeStagingRoot).TrimEnd('\')
if ($nativeStagingPath -eq [IO.Path]::GetPathRoot($nativeStagingPath).TrimEnd('\')) {
  throw 'Native staging must be a dedicated task directory, never a drive root.'
}
foreach ($protectedPath in @($mobileRoot, $SdkRoot, $JdkRoot, $CacheRoot, (Split-Path $ninjaFullPath -Parent))) {
  $protectedFullPath = [IO.Path]::GetFullPath($protectedPath).TrimEnd('\')
  if ($nativeStagingPath.Equals($protectedFullPath, [StringComparison]::OrdinalIgnoreCase) -or
      $nativeStagingPath.StartsWith($protectedFullPath + '\', [StringComparison]::OrdinalIgnoreCase) -or
      $protectedFullPath.StartsWith($nativeStagingPath + '\', [StringComparison]::OrdinalIgnoreCase)) {
    throw 'Native staging must not overlap the source, SDK, JDK, Ninja or Gradle cache.'
  }
}
$stagingOwnerFile = Join-Path $nativeStagingPath '.astanaai-mobile-owner'
if (Test-Path -LiteralPath $nativeStagingPath) {
  if (-not (Test-Path -LiteralPath $stagingOwnerFile -PathType Leaf)) {
    if (@(Get-ChildItem -LiteralPath $nativeStagingPath -Force).Count -gt 0) {
      throw 'Native staging is not empty and has no matching owner marker; choose a new task directory.'
    }
  } elseif (([IO.File]::ReadAllText($stagingOwnerFile)).Trim() -ne $mobileRoot) {
    throw 'Native staging belongs to a different source root; choose a separate directory.'
  }
}
foreach ($requiredPath in @((Join-Path $SdkRoot 'platform-tools\adb.exe'), (Join-Path $JdkRoot 'bin\java.exe'), $ninjaFullPath)) {
  if (-not (Test-Path -LiteralPath $requiredPath)) { throw "Required free toolchain is missing: $requiredPath" }
}
$ninjaHash = (Get-FileHash -LiteralPath $ninjaFullPath -Algorithm SHA256).Hash
if ($ninjaHash -ne 'E52A7AD9538D9618C67A0BD777964E2EEC8A30F68B810A2F6ADCE1F2DAF847B8') {
  throw 'Expected the verified official Ninja 1.13.2 Windows executable; see README for the official ZIP and digest.'
}
if ((Get-ItemProperty -LiteralPath 'HKLM:\SYSTEM\CurrentControlSet\Control\FileSystem' -Name LongPathsEnabled).LongPathsEnabled -ne 1) {
  throw 'Windows long-path policy is not enabled. This script does not change system settings; native build gate is blocked on this host.'
}
$driveName = [IO.Path]::GetPathRoot($mobileRoot).TrimEnd('\')
$freeBytes = (Get-CimInstance Win32_LogicalDisk | Where-Object { $_.DeviceID -eq $driveName }).FreeSpace
if ($freeBytes -lt 8GB) { throw 'Less than 8 GiB free before build; no files will be deleted automatically.' }
New-Item -ItemType Directory -Path $nativeStagingPath -Force | Out-Null
[IO.File]::WriteAllText($stagingOwnerFile, $mobileRoot)
Write-Output "Native CMake staging: $nativeStagingPath"
Write-Output "Verified Ninja 1.13.2: $ninjaFullPath"
$oldJava = $env:JAVA_HOME
$oldAndroid = $env:ANDROID_HOME
$oldGradle = $env:GRADLE_USER_HOME
$oldPath = $env:PATH
try {
  $env:JAVA_HOME = [IO.Path]::GetFullPath($JdkRoot)
  $env:ANDROID_HOME = [IO.Path]::GetFullPath($SdkRoot)
  $env:GRADLE_USER_HOME = [IO.Path]::GetFullPath($CacheRoot)
  $env:PATH = (Join-Path $env:JAVA_HOME 'bin') + ';' + $oldPath
  $debugKeyPath = Join-Path $mobileRoot 'android\app\debug.keystore'
  if (-not (Test-Path -LiteralPath $debugKeyPath)) {
    # Public Android debug credentials, never a release signing identity.
    & (Join-Path $env:JAVA_HOME 'bin\keytool.exe') -genkeypair -v -keystore $debugKeyPath `
      -storepass android -keypass android -alias androiddebugkey -keyalg RSA -keysize 2048 `
      -validity 10000 -dname 'CN=Android Debug,O=Android,C=US'
    if ($LASTEXITCODE -ne 0) { throw 'Could not generate the local debug-only signing key.' }
  }
  Push-Location (Join-Path $mobileRoot 'android')
  try {
    $gradleTasks = @()
    if ($BuildAction -eq 'ConfigureNative') {
      $nativeBuildType = if ($Variant -eq 'Debug') { 'Debug' } else { 'RelWithDebInfo' }
      $gradleTasks = @((":app:configureCMake${nativeBuildType}[$Abi]"), (":expo-modules-core:configureCMake${nativeBuildType}[$Abi]"))
    } else { $gradleTasks = @((":app:assemble$Variant")) }
    & .\gradlew.bat @gradleTasks --no-daemon --max-workers=2 --console=plain `
      '-Dorg.gradle.parallel=false' '-Dorg.gradle.jvmargs=-Xmx1536m -XX:MaxMetaspaceSize=512m' `
      '-Pkotlin.compiler.execution.strategy=in-process' '-Pandroid.enableMinifyInReleaseBuilds=false' `
      '-Pandroid.enableShrinkResourcesInReleaseBuilds=false' "-PreactNativeArchitectures=$Abi" `
      "-PastanaNativeStagingDir=$nativeStagingPath" "-PastanaNinjaExecutable=$ninjaFullPath"
    if ($LASTEXITCODE -ne 0) { throw "Native build failed with exit code $LASTEXITCODE" }
  } finally { Pop-Location }
} finally {
  $env:JAVA_HOME = $oldJava
  $env:ANDROID_HOME = $oldAndroid
  $env:GRADLE_USER_HOME = $oldGradle
  $env:PATH = $oldPath
}
