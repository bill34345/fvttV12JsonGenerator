$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$sourceModules = "E:\CARROT\FVTTV14\data\Data\modules"
$targetModules = "E:\Bill\fvtt_v13\data\Data\modules"
$scratchRoot = "E:\Bill\fvtt_v13\scratch"
$backupRoot = "E:\Bill\fvtt_v13\backups"
$dataPath = "E:\Bill\fvtt_v13\data"
$modules = @(
    @{ Id = "foundry_chn"; ExpectedVersion = "14.364"; BackupName = "foundry_chn-14.362" },
    @{ Id = "filepicker-plus"; ExpectedVersion = "6.0.1"; BackupName = "filepicker-plus-4.0" }
)

function Get-TreeInventory {
    param([Parameter(Mandatory = $true)][string]$Root)

    $resolvedRoot = (Resolve-Path -LiteralPath $Root).Path.TrimEnd("\")
    @(Get-ChildItem -LiteralPath $resolvedRoot -Recurse -File | Sort-Object FullName | ForEach-Object {
        [pscustomobject]@{
            Path = $_.FullName.Substring($resolvedRoot.Length).TrimStart("\")
            Length = $_.Length
            Sha256 = (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash
        }
    })
}

function Assert-TreesEqual {
    param(
        [Parameter(Mandatory = $true)][string]$Expected,
        [Parameter(Mandatory = $true)][string]$Actual
    )

    $expectedJson = (Get-TreeInventory -Root $Expected | ConvertTo-Json -Depth 4 -Compress)
    $actualJson = (Get-TreeInventory -Root $Actual | ConvertTo-Json -Depth 4 -Compress)
    if ($expectedJson -cne $actualJson) {
        throw "Directory hash inventory mismatch: '$Expected' != '$Actual'."
    }
}

function Assert-ManifestVersion {
    param(
        [Parameter(Mandatory = $true)][string]$ModulePath,
        [Parameter(Mandatory = $true)][string]$ExpectedId,
        [Parameter(Mandatory = $true)][string]$ExpectedVersion
    )

    $manifestPath = Join-Path $ModulePath "module.json"
    $manifest = Get-Content -LiteralPath $manifestPath -Raw -Encoding UTF8 | ConvertFrom-Json
    if ($manifest.id -cne $ExpectedId) {
        throw "Unexpected module id '$($manifest.id)' at '$manifestPath'."
    }
    if ($manifest.version -cne $ExpectedVersion) {
        throw "Unexpected version '$($manifest.version)' for '$ExpectedId'; expected '$ExpectedVersion'."
    }
}

$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$stageRoot = Join-Path $scratchRoot "codex-$stamp-module-sync-stage"
$backupPath = Join-Path $backupRoot "codex-$stamp-module-upgrade"
New-Item -ItemType Directory -Path $stageRoot -Force | Out-Null

foreach ($module in $modules) {
    $source = Join-Path $sourceModules $module.Id
    if (-not (Test-Path -LiteralPath $source -PathType Container)) {
        throw "Source module is missing: $source"
    }
    Copy-Item -LiteralPath $source -Destination $stageRoot -Recurse -Force
    $staged = Join-Path $stageRoot $module.Id
    Assert-ManifestVersion -ModulePath $staged -ExpectedId $module.Id -ExpectedVersion $module.ExpectedVersion
    Assert-TreesEqual -Expected $source -Actual $staged
}

$listener = Get-NetTCPConnection -State Listen -LocalPort 8080 -ErrorAction SilentlyContinue | Select-Object -First 1
if ($null -eq $listener) {
    throw "No process is listening on port 8080; refusing to guess which process to stop."
}
$process = Get-CimInstance Win32_Process -Filter "ProcessId = $($listener.OwningProcess)"
$commandLine = [string]$process.CommandLine
$requiredFragments = @("E:\Bill\v14\code\main.js", "--port=8080", $dataPath)
foreach ($fragment in $requiredFragments) {
    if ($commandLine.IndexOf($fragment, [System.StringComparison]::OrdinalIgnoreCase) -lt 0) {
        throw "Port 8080 PID $($listener.OwningProcess) does not match the expected v14 launch command. Missing '$fragment'."
    }
}

Stop-Process -Id $listener.OwningProcess
$deadline = (Get-Date).AddSeconds(20)
do {
    Start-Sleep -Milliseconds 500
    $stillListening = Get-NetTCPConnection -State Listen -LocalPort 8080 -ErrorAction SilentlyContinue
} while ($stillListening -and (Get-Date) -lt $deadline)
if ($stillListening) {
    throw "Port 8080 did not close after stopping PID $($listener.OwningProcess)."
}

New-Item -ItemType Directory -Path $backupPath -Force | Out-Null
$lockPath = Join-Path $dataPath "Config\options.json.lock"
if (Test-Path -LiteralPath $lockPath) {
    Move-Item -LiteralPath $lockPath -Destination (Join-Path $backupPath "options.json.lock.stale")
}

$movedOriginals = @{}
try {
    foreach ($module in $modules) {
        $target = Join-Path $targetModules $module.Id
        if (-not (Test-Path -LiteralPath $target -PathType Container)) {
            throw "Expected existing target module is missing: $target"
        }
        $backupModule = Join-Path $backupPath $module.BackupName
        Move-Item -LiteralPath $target -Destination $backupModule
        $movedOriginals[$module.Id] = $backupModule

        $staged = Join-Path $stageRoot $module.Id
        Move-Item -LiteralPath $staged -Destination $target
    }

    foreach ($module in $modules) {
        $source = Join-Path $sourceModules $module.Id
        $target = Join-Path $targetModules $module.Id
        Assert-ManifestVersion -ModulePath $target -ExpectedId $module.Id -ExpectedVersion $module.ExpectedVersion
        Assert-TreesEqual -Expected $source -Actual $target
    }
}
catch {
    foreach ($module in $modules) {
        $target = Join-Path $targetModules $module.Id
        if (Test-Path -LiteralPath $target) {
            $failedTarget = Join-Path $backupPath ("failed-target-" + $module.Id)
            Move-Item -LiteralPath $target -Destination $failedTarget
        }
        if ($movedOriginals.ContainsKey($module.Id) -and (Test-Path -LiteralPath $movedOriginals[$module.Id])) {
            Move-Item -LiteralPath $movedOriginals[$module.Id] -Destination $target
        }
    }
    throw
}

$results = foreach ($module in $modules) {
    $source = Join-Path $sourceModules $module.Id
    $target = Join-Path $targetModules $module.Id
    $inventory = Get-TreeInventory -Root $target
    $manifest = Get-Content -LiteralPath (Join-Path $target "module.json") -Raw -Encoding UTF8 | ConvertFrom-Json
    [pscustomobject]@{
        id = $module.Id
        version = $manifest.version
        fileCount = @($inventory).Count
        totalBytes = (@($inventory) | Measure-Object -Property Length -Sum).Sum
        sourceEqualsTarget = $true
    }
}

[pscustomobject]@{
    success = $true
    stoppedPid = $listener.OwningProcess
    backupPath = $backupPath
    stageRoot = $stageRoot
    modules = @($results)
} | ConvertTo-Json -Depth 5
