$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$port = 8080
$expectedEntry = "E:\Bill\v14\code\main.js"
$expectedDataPath = "E:\Bill\fvtt_v13\data"
$foundryRoot = "E:\Bill\v14"
$worldPath = "E:\Bill\fvtt_v13\data\Data\worlds\cor-cotn"
$optionsPath = "E:\Bill\fvtt_v13\data\Config\options.json"
$moduleDestination = "E:\Bill\fvtt_v13\data\Data\modules\3ds-atlas"
$stagedModule = "E:\Bill\fvtt_v13\scratch\codex-20260722-calendaria-stage\3ds-atlas"
$moduleArchive = "E:\Bill\fvtt_v13\scratch\codex-20260722-calendaria-stage\3ds-atlas-1.0.zip"
$expectedArchiveSha256 = "8779B8A647D656AE303DB095686F419BBBC1FEDCC4938F214CA421F5386D99BE"
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$backupPath = "E:\Bill\fvtt_v13\backups\codex-$stamp-calendaria-enable"
$stopped = $false
$installed = $false

try {
    if (-not (Test-Path -LiteralPath $stagedModule -PathType Container)) {
        throw "Staged 3DS:ATLAS directory is missing: $stagedModule"
    }
    if (-not (Test-Path -LiteralPath $moduleArchive -PathType Leaf)) {
        throw "Staged 3DS:ATLAS archive is missing: $moduleArchive"
    }
    $archiveSha256 = (Get-FileHash -LiteralPath $moduleArchive -Algorithm SHA256).Hash
    if ($archiveSha256 -cne $expectedArchiveSha256) {
        throw "3DS:ATLAS archive hash mismatch: $archiveSha256"
    }

    $stagedManifest = Get-Content -LiteralPath (Join-Path $stagedModule "module.json") -Raw -Encoding UTF8 |
        ConvertFrom-Json
    if (($stagedManifest.id -cne "3ds-atlas") -or ($stagedManifest.version -cne "1.0")) {
        throw "Unexpected staged manifest: $($stagedManifest.id) $($stagedManifest.version)"
    }
    if (($stagedManifest.compatibility.minimum -cne "14") -or
        ($stagedManifest.compatibility.verified -cne "14.364")) {
        throw "Unexpected staged Foundry compatibility declaration."
    }
    if (Test-Path -LiteralPath $moduleDestination) {
        throw "3DS:ATLAS destination unexpectedly exists: $moduleDestination"
    }

    $listener = Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction Stop |
        Select-Object -First 1
    $process = Get-CimInstance Win32_Process -Filter "ProcessId=$($listener.OwningProcess)"
    if (-not $process) {
        throw "Port 8080 owner process was not found."
    }
    $commandLine = [string]$process.CommandLine
    foreach ($fragment in @($expectedEntry, "--port=8080", $expectedDataPath)) {
        if ($commandLine.IndexOf($fragment, [System.StringComparison]::OrdinalIgnoreCase) -lt 0) {
            throw "Port 8080 owner does not match the expected v14 instance; missing '$fragment'."
        }
    }

    Stop-Process -Id $process.ProcessId -ErrorAction Stop
    $stopped = $true
    $deadline = (Get-Date).AddSeconds(20)
    do {
        Start-Sleep -Milliseconds 500
        $stillListening = Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue
    } while ($stillListening -and ((Get-Date) -lt $deadline))
    if ($stillListening) {
        throw "Port 8080 did not close after stopping the verified process."
    }

    New-Item -ItemType Directory -Path (Join-Path $backupPath "worlds") -Force | Out-Null
    New-Item -ItemType Directory -Path (Join-Path $backupPath "Config") -Force | Out-Null
    Copy-Item -LiteralPath $worldPath -Destination (Join-Path $backupPath "worlds\cor-cotn") -Recurse -Force
    Copy-Item -LiteralPath $optionsPath -Destination (Join-Path $backupPath "Config\options.json") -Force

    $lockPath = Join-Path $expectedDataPath "Config\options.json.lock"
    if (Test-Path -LiteralPath $lockPath) {
        Move-Item -LiteralPath $lockPath -Destination (Join-Path $backupPath "options.json.lock.stale")
    }

    Move-Item -LiteralPath $stagedModule -Destination $moduleDestination
    $installed = $true
    $installedManifest = Get-Content -LiteralPath (Join-Path $moduleDestination "module.json") -Raw -Encoding UTF8 |
        ConvertFrom-Json
    if (($installedManifest.id -cne "3ds-atlas") -or ($installedManifest.version -cne "1.0")) {
        throw "Installed manifest validation failed."
    }

    $backupMeasure = Get-ChildItem -LiteralPath $backupPath -Recurse -File |
        Measure-Object -Property Length -Sum
    $moduleFiles = @(Get-ChildItem -LiteralPath $moduleDestination -Recurse -File)
    [pscustomobject]@{
        success = $true
        stoppedPid = $process.ProcessId
        backupPath = $backupPath
        backupBytes = $backupMeasure.Sum
        archiveSha256 = $archiveSha256
        module = [pscustomobject]@{
            id = $installedManifest.id
            version = $installedManifest.version
            fileCount = $moduleFiles.Count
            totalBytes = ($moduleFiles | Measure-Object -Property Length -Sum).Sum
        }
    } | ConvertTo-Json -Depth 5
}
catch {
    if ($installed -and (Test-Path -LiteralPath $moduleDestination)) {
        New-Item -ItemType Directory -Path $backupPath -Force | Out-Null
        Move-Item -LiteralPath $moduleDestination -Destination (Join-Path $backupPath "failed-3ds-atlas")
    }
    throw
}
finally {
    if ($stopped) {
        $launcher = Join-Path $foundryRoot "fvtt-8080-start-v14.cmd"
        $startup = ([wmiclass]"Win32_ProcessStartup").CreateInstance()
        $startup.ShowWindow = 0
        $created = Invoke-WmiMethod -Class Win32_Process -Name Create `
            -ArgumentList "cmd.exe /c `"$launcher`"", $foundryRoot, $startup
        if ($created.ReturnValue -ne 0) {
            throw "Win32_Process.Create failed with return value $($created.ReturnValue)."
        }
        $deadline = (Get-Date).AddSeconds(45)
        do {
            Start-Sleep -Milliseconds 750
            $newListener = Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue |
                Select-Object -First 1
        } while ((-not $newListener) -and ((Get-Date) -lt $deadline))
        if (-not $newListener) {
            throw "Port 8080 did not resume listening within 45 seconds."
        }
    }
}
