param([string]$Destination = 'raw-data/kazakhstan-latest.osm.pbf')
# One public extract, no credentials, no retries or certificate-check bypass.
$ErrorActionPreference = 'Stop'
$target = [System.IO.Path]::GetFullPath($Destination)
$metadata = ($target -replace '\.osm\.pbf$', '') + '.metadata.json'
if ((Test-Path -LiteralPath $target) -or (Test-Path -LiteralPath $metadata)) {
    throw 'Refusing to overwrite an existing raw snapshot or metadata. Choose a new destination.'
}
New-Item -ItemType Directory -Path ([System.IO.Path]::GetDirectoryName($target)) -Force | Out-Null
$url = 'https://download.geofabrik.de/asia/kazakhstan-latest.osm.pbf'
$clock = [System.Diagnostics.Stopwatch]::StartNew()
Invoke-WebRequest -UseBasicParsing -Uri $url -UserAgent 'AstanaAI-T02-research/0.1' -OutFile $target -TimeoutSec 300
$clock.Stop()
$file = Get-Item -LiteralPath $target
@{
    url = $url
    fetched_at = [DateTime]::UtcNow.ToString('o')
    sha256 = (Get-FileHash -LiteralPath $target -Algorithm SHA256).Hash.ToLowerInvariant()
    bytes = $file.Length
    duration_seconds = $clock.Elapsed.TotalSeconds
    license = 'ODbL-1.0'
} | ConvertTo-Json | Set-Content -LiteralPath $metadata -Encoding UTF8
Get-Content -LiteralPath $metadata
