param(
    [Parameter(Mandatory = $true)][string]$CoordinatorPath,
    [string]$ExpectedRemote = 'https://github.com/ersssz/smartcity-ai.git',
    [switch]$DryRun,
    [switch]$Retry
)
$ErrorActionPreference = 'Stop'
$PSNativeCommandUseErrorActionPreference = $false
$env:GIT_TERMINAL_PROMPT = '0'
$env:GCM_INTERACTIVE = 'never'
$env:GIT_MERGE_AUTOEDIT = 'no'
$lock = $null
$runPath = $null
$signature = $null
$statePath = $null

function Invoke-Git([string]$At, [string[]]$Arguments) {
    $output = @(& git -C $At @Arguments 2>&1 | ForEach-Object { "$_" })
    if ($LASTEXITCODE -ne 0) { throw "git $($Arguments -join ' ') failed: $($output -join [Environment]::NewLine)" }
    return $output
}
function Emit-Result($Value) { $Value | ConvertTo-Json -Depth 8 -Compress | Write-Output }

try {
    $CoordinatorPath = (Resolve-Path -LiteralPath $CoordinatorPath).Path
    $top = (Invoke-Git $CoordinatorPath @('rev-parse', '--show-toplevel') | Select-Object -Last 1)
    if ([IO.Path]::GetFullPath($top) -ne [IO.Path]::GetFullPath($CoordinatorPath)) { throw 'Coordinator must be its own repository root.' }
    $remote = (Invoke-Git $CoordinatorPath @('remote', 'get-url', 'origin') | Select-Object -Last 1)
    if ($remote -ne $ExpectedRemote) { throw 'Unexpected origin; no changes made.' }
    $gitDir = (Invoke-Git $CoordinatorPath @('rev-parse', '--absolute-git-dir') | Select-Object -Last 1)
    $statePath = Join-Path $gitDir 'smartcity-integration-state.json'
    try {
        $lock = [IO.File]::Open((Join-Path $gitDir 'smartcity-integration.lock'), [IO.FileMode]::OpenOrCreate, [IO.FileAccess]::ReadWrite, [IO.FileShare]::None)
    } catch [IO.IOException] {
        Emit-Result @{ status = 'busy'; message = 'Another integration run holds the lock.' }
        exit 0
    }
    $null = Invoke-Git $CoordinatorPath @('fetch', '--prune', 'origin')
    $base = (Invoke-Git $CoordinatorPath @('rev-parse', 'origin/main') | Select-Object -Last 1)
    $tips = @()
    foreach ($branch in @('codex/backend', 'codex/frontend')) {
        $tip = @(& git -C $CoordinatorPath rev-parse --verify --quiet "refs/remotes/origin/$branch" 2>$null)
        if ($LASTEXITCODE -ne 0) { continue }
        $sha = "$($tip[-1])"
        & git -C $CoordinatorPath merge-base --is-ancestor $sha $base 2>$null
        if ($LASTEXITCODE -eq 1) { $tips += @{ branch = $branch; sha = $sha } }
        elseif ($LASTEXITCODE -ne 0) { throw "Cannot compare $branch with main." }
    }
    if ($tips.Count -eq 0) {
        Emit-Result @{ status = 'up_to_date'; main = $base }
        exit 0
    }
    $signature = "$base|$(($tips | ForEach-Object { "$($_.branch):$($_.sha)" }) -join '|')"
    if ((Test-Path -LiteralPath $statePath) -and -not $Retry) {
        $previous = Get-Content -Raw -LiteralPath $statePath | ConvertFrom-Json
        if ($previous.signature -eq $signature -and $previous.status -eq 'blocked') {
            Emit-Result @{ status = 'unchanged_block'; message = $previous.message; worktree = $previous.worktree }
            exit 0
        }
    }
    $runRoot = Join-Path (Split-Path -Parent $CoordinatorPath) 'runs'
    $null = New-Item -ItemType Directory -Force -Path $runRoot
    $runPath = Join-Path $runRoot ([Guid]::NewGuid().ToString('N'))
    $null = Invoke-Git $CoordinatorPath @('worktree', 'add', '--detach', $runPath, $base)
    foreach ($tip in $tips) {
        $null = Invoke-Git $runPath @('-c', 'core.hooksPath=NUL', 'merge', '--no-ff', '--no-edit', $tip.sha)
    }
    $null = Invoke-Git $runPath @('diff', '--check', $base, 'HEAD')
    $changed = @(Invoke-Git $runPath @('diff', '--name-only', $base, 'HEAD'))
    foreach ($file in $changed) {
        $leaf = Split-Path -Leaf $file
        if (($leaf -match '^\.env($|\.)' -and $leaf -notmatch '\.(example|sample|template)$') -or $leaf -match '\.(pem|key|p12|pfx)$|^id_(rsa|ed25519)$') {
            throw "Potential secret file requires manual review: $file"
        }
    }
    $checkFile = Join-Path $runPath '.codex/integration-checks.json'
    $checks = @()
    if (Test-Path -LiteralPath $checkFile) {
        $checkConfig = Get-Content -Raw -LiteralPath $checkFile | ConvertFrom-Json
        $checks = @($checkConfig.checks | Where-Object { $null -ne $_ })
    }
    $codeFiles = @($changed | Where-Object { $_ -notmatch '(?i)\.md$|(^|/)LICENSE$|(^|/)\.gitignore$|(^|/)\.gitattributes$' })
    if ($codeFiles.Count -gt 0 -and $checks.Count -eq 0) {
        throw 'Code/config changes need real checks in .codex/integration-checks.json. Documentation-only merges remain allowed.'
    }
    $candidate = (Invoke-Git $runPath @('rev-parse', 'HEAD') | Select-Object -Last 1)
    $checkNames = @()
    foreach ($check in $checks) {
        if (-not $check.command -or -not $check.name) { throw 'Each integration check needs name and command.' }
        $relative = '.'
        if ($check.workingDirectory) { $relative = [string]$check.workingDirectory }
        $checkCwd = [IO.Path]::GetFullPath((Join-Path $runPath $relative))
        $runFull = [IO.Path]::GetFullPath($runPath)
        if ($checkCwd -ne $runFull -and -not $checkCwd.StartsWith($runFull + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) { throw 'Check directory must stay inside the worktree.' }
        Push-Location -LiteralPath $checkCwd
        try {
            $global:LASTEXITCODE = 0
            $checkArgs = @($check.arguments)
            $checkOutput = @(& $check.command @checkArgs 2>&1 | ForEach-Object { "$_" })
            $checkOk = $?
            $checkExit = $LASTEXITCODE
            if (-not $checkOk -or $checkExit -ne 0) { throw "Check '$($check.name)' failed ($checkExit): $($checkOutput -join [Environment]::NewLine)" }
            $checkNames += [string]$check.name
        } finally { Pop-Location }
    }
    $afterChecks = (Invoke-Git $runPath @('rev-parse', 'HEAD') | Select-Object -Last 1)
    if ($afterChecks -ne $candidate) { throw 'Validation commands must not create commits or switch revisions.' }
    $null = Invoke-Git $runPath @('diff', '--exit-code', 'HEAD')
    $live = (Invoke-Git $CoordinatorPath @('ls-remote', 'origin', 'refs/heads/main') | Select-Object -Last 1) -split '\s+'
    if ($live[0] -ne $base) { throw 'Remote main changed during verification; retry against the new main.' }
    if (-not $DryRun) {
        $null = Invoke-Git $runPath @('-c', 'core.hooksPath=NUL', 'push', 'origin', 'HEAD:refs/heads/main')
    }
    $state = @{ signature = $signature; status = 'merged'; main = $candidate; branches = @($tips.branch); checks = $checkNames; dryRun = [bool]$DryRun }
    try {
        $null = Invoke-Git $CoordinatorPath @('worktree', 'remove', $runPath)
        $runPath = $null
    } catch {
        $state.cleanupWarning = $_.Exception.Message
        $state.worktree = $runPath
    }
    if (-not $DryRun) { $state | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $statePath -Encoding UTF8 }
    Emit-Result $state
} catch {
    $state = @{ signature = $signature; status = 'blocked'; message = $_.Exception.Message; worktree = $runPath }
    if ($statePath -and $signature -and $lock -and -not $DryRun) {
        $state | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath $statePath -Encoding UTF8
    }
    Emit-Result $state
    exit 1
} finally {
    if ($lock) { $lock.Dispose() }
}
