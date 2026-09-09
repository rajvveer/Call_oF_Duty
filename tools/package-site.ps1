param([string]$Archive = 'work/ashvector-site.tar.gz')
$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$entry = Join-Path $projectRoot 'dist/server/index.js'
if (-not (Test-Path -LiteralPath $entry)) { throw 'Build dist/server/index.js before packaging.' }
$metadata = Join-Path $projectRoot 'dist/.openai'
New-Item -ItemType Directory -Force -Path $metadata | Out-Null
Copy-Item -LiteralPath (Join-Path $projectRoot '.openai/hosting.json') -Destination (Join-Path $metadata 'hosting.json')
$archivePath = [System.IO.Path]::GetFullPath((Join-Path $projectRoot $Archive))
if (-not $archivePath.StartsWith($projectRoot + [System.IO.Path]::DirectorySeparatorChar)) { throw 'Archive must remain in project workspace.' }
New-Item -ItemType Directory -Force -Path (Split-Path $archivePath) | Out-Null
tar -czf $archivePath -C $projectRoot dist
if ($LASTEXITCODE -ne 0) { throw 'Packaging failed.' }
$entries = tar -tzf $archivePath
if ('dist/server/index.js' -notin $entries -or 'dist/.openai/hosting.json' -notin $entries) { throw 'Invalid deployment archive.' }
Write-Output $archivePath
