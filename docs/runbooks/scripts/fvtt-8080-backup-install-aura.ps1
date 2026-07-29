$ErrorActionPreference = "Stop"

# Run this script locally on the Foundry host or through an unbounded remote
# session. Interrupting it during the stopped-server copy can leave port 8080
# offline until the audited launcher is invoked separately.

$port = 8080
$expectedDataPath = "E:\Bill\fvtt_v13\data"
$foundryRoot = "E:\Bill\v14"
$worldPath = "E:\Bill\fvtt_v13\data\Data\worlds\cor-cotn"
$optionsPath = "E:\Bill\fvtt_v13\data\Config\options.json"
$moduleDestination = "E:\Bill\fvtt_v13\data\Data\modules\auraeffects"
$moduleArchive = "E:\Bill\fvtt_v13\scratch\codex-20260722-auraeffects-2.1.1\module.zip"
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$backupPath = "E:\Bill\fvtt_v13\backups\codex-$stamp-8080-maintenance"
$stopped = $false

try {
    $listener = Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction Stop |
        Select-Object -First 1
    $process = Get-CimInstance Win32_Process -Filter "ProcessId=$($listener.OwningProcess)"

    if (-not $process) {
        throw "Port 8080 owner process was not found."
    }
    if (($process.CommandLine -notmatch "--port=8080") -or
        ($process.CommandLine -notmatch [regex]::Escape($expectedDataPath))) {
        throw "Port 8080 owner does not match the expected Foundry instance: $($process.CommandLine)"
    }

    Write-Output "VERIFIED_PID=$($process.ProcessId)"
    Write-Output "VERIFIED_COMMAND=$($process.CommandLine)"

    New-Item -ItemType Directory -Path (Join-Path $backupPath "worlds") -Force | Out-Null
    New-Item -ItemType Directory -Path (Join-Path $backupPath "Config") -Force | Out-Null

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
    Write-Output "PORT_8080_STOPPED=true"

    Copy-Item -LiteralPath $worldPath -Destination (Join-Path $backupPath "worlds\cor-cotn") -Recurse -Force
    Copy-Item -LiteralPath $optionsPath -Destination (Join-Path $backupPath "Config\options.json") -Force

    $backupMeasure = Get-ChildItem -LiteralPath $backupPath -Recurse -File |
        Measure-Object -Property Length -Sum
    Write-Output "BACKUP_PATH=$backupPath"
    Write-Output "BACKUP_BYTES=$($backupMeasure.Sum)"

    if (Test-Path -LiteralPath $moduleDestination) {
        throw "Aura Effects destination unexpectedly exists: $moduleDestination"
    }

    Expand-Archive -LiteralPath $moduleArchive -DestinationPath $moduleDestination
    $manifest = Get-Content -LiteralPath (Join-Path $moduleDestination "module.json") -Raw |
        ConvertFrom-Json
    if (($manifest.id -ne "auraeffects") -or ($manifest.version -ne "2.1.1")) {
        throw "Unexpected Aura Effects manifest: $($manifest.id) $($manifest.version)"
    }
    Write-Output "AURA_INSTALLED=$($manifest.id)@$($manifest.version)"
}
finally {
    if ($stopped) {
        $launcher = Join-Path $foundryRoot "fvtt-8080-start-v14.cmd"
        $startup = ([wmiclass]"Win32_ProcessStartup").CreateInstance()
        $startup.ShowWindow = 0
        $created = Invoke-WmiMethod -Class Win32_Process `
            -Name Create `
            -ArgumentList "cmd.exe /c `"$launcher`"", $foundryRoot, $startup
        if ($created.ReturnValue -ne 0) {
            throw "Win32_Process.Create failed with return value $($created.ReturnValue)."
        }
        Write-Output "RESTART_PID=$($created.ProcessId)"

        $deadline = (Get-Date).AddSeconds(45)
        do {
            Start-Sleep -Seconds 1
            $newListener = Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue
        } while ((-not $newListener) -and ((Get-Date) -lt $deadline))

        if ($newListener) {
            Write-Output "PORT_8080_LISTENING=true OWNER=$($newListener.OwningProcess)"
        }
        else {
            Write-Output "PORT_8080_LISTENING=false"
        }
    }
}
