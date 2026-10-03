param([Parameter(Mandatory=$true)][string]$ExecutorThreadId)
$ErrorActionPreference='Stop'
$evidenceRoot='F:\FoundryLab\foundry-v14\evidence\server-next-migration\item-piles-20260929'
$permission=Get-Content -LiteralPath (Join-Path $evidenceRoot 'executor-permissions.json') | ConvertFrom-Json
if($permission.threadId -ne $ExecutorThreadId -or $permission.sandboxMode -ne 'danger-full-access' -or $permission.approvalPolicy -ne 'never' -or !$permission.verifiedFromActualHostContext){throw 'Fresh executor permission receipt required'}
$env:PYTHONUTF8='1'
python (Join-Path $PSScriptRoot 'install-piles.py') --verify-only
if($LASTEXITCODE -ne 0){throw 'Candidate preflight failed before service changes'}
$status=Invoke-RestMethod 'http://127.0.0.1:30002/api/status' -TimeoutSec 5
if($status.active -ne $false){throw 'Use normal Foundry Return to Setup first; active world will not be stopped'}
$listeners=@(Get-NetTCPConnection -State Listen | Where-Object LocalPort -eq 30002)
if($listeners.Count -ne 1 -or $listeners[0].LocalAddress -ne '127.0.0.1'){throw 'Unexpected Next listener'}
$live=Get-CimInstance Win32_Process -Filter "ProcessId=$($listeners[0].OwningProcess)"
$prior=Get-Content -LiteralPath 'F:\FoundryLab\foundry-v14\evidence\server-next-migration\external-first-20260929\service-final.json' | ConvertFrom-Json
if($live.ProcessId -ne $prior.nextProcess.pid -or $live.CommandLine -ne $prior.nextProcess.commandLine -or $live.Name -ne 'node.exe'){throw 'Next identity changed since owned-service receipt; preserve and coordinate'}
$owner=Invoke-CimMethod -InputObject $live -MethodName GetOwner
if("$($owner.Domain)\$($owner.User)" -ne $prior.nextProcess.owner){throw 'Unexpected process owner'}
$receipt=[ordered]@{dispatchId='NEXT-PILES-20260929-02';checkedAt=(Get-Date -Format o);processId=$live.ProcessId;creationDate=$live.CreationDate;commandLine=$live.CommandLine;owner="$($owner.Domain)\$($owner.User)";apiStatus=$status;mirror=@(Get-NetTCPConnection -State Listen | Where-Object LocalPort -eq 30001 | Select-Object LocalAddress,LocalPort,OwningProcess)}
$receipt|ConvertTo-Json -Depth 6|Set-Content -LiteralPath (Join-Path $evidenceRoot 'pre-maintenance-service.json') -Encoding utf8
Stop-Process -Id $live.ProcessId
Wait-Process -Id $live.ProcessId -Timeout 15 -ErrorAction SilentlyContinue
if(Get-Process -Id $live.ProcessId -ErrorAction SilentlyContinue){throw 'Owned process did not stop; no forced retry'}
python (Join-Path $PSScriptRoot 'install-piles.py') --apply
if($LASTEXITCODE -ne 0){throw 'Install failed; preserve readback, do not replay or start partial candidate'}
& (Join-Path $PSScriptRoot 'launch-next.ps1') -ExecutorThreadId $ExecutorThreadId -EvidenceRoot $evidenceRoot -DispatchId 'NEXT-PILES-20260929-02'
