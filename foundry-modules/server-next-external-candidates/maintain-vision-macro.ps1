param([Parameter(Mandatory=$true)][string]$ExecutorThreadId)
$ErrorActionPreference='Stop'
$evidenceRoot='F:\FoundryLab\foundry-v14\evidence\server-next-migration\vision-macro-20260929'
$permission=Get-Content -LiteralPath (Join-Path $evidenceRoot 'executor-permissions.json') | ConvertFrom-Json
if($permission.threadId -ne $ExecutorThreadId -or $permission.sandboxMode -ne 'danger-full-access' -or $permission.approvalPolicy -ne 'never' -or !$permission.verifiedFromActualHostContext){throw 'Actual current executor permission receipt required'}
$env:PYTHONUTF8='1'
python (Join-Path $PSScriptRoot 'install-vision-macro.py') --verify-only
if($LASTEXITCODE -ne 0){throw 'Candidate preflight failed before service changes'}
$status=Invoke-RestMethod 'http://127.0.0.1:30002/api/status' -TimeoutSec 5
if($status.active -ne $false){throw 'Normal Return to Setup and inactive world required'}
$listeners=@(Get-NetTCPConnection -State Listen|Where-Object LocalPort -eq 30002)
if($listeners.Count -ne 1 -or $listeners[0].LocalAddress -ne '127.0.0.1'){throw 'Unexpected listener'}
$live=Get-CimInstance Win32_Process -Filter "ProcessId=$($listeners[0].OwningProcess)"
$prior=Get-Content -LiteralPath 'F:\FoundryLab\foundry-v14\evidence\server-next-migration\item-piles-20260929\recovery3\service-receipt.json'|ConvertFrom-Json
$owner=Invoke-CimMethod -InputObject $live -MethodName GetOwner
if($live.ProcessId -ne $prior.pid -or $live.CommandLine -ne $prior.commandLine -or "$($owner.Domain)\$($owner.User)" -ne $prior.processOwner){throw 'Owned service identity changed; preserve and coordinate'}
@{dispatchId='NEXT-VM-20260929-03';time=(Get-Date -Format o);pid=$live.ProcessId;creationDate=$live.CreationDate;commandLine=$live.CommandLine;apiStatus=$status;mirror=@(Get-NetTCPConnection -State Listen|Where-Object LocalPort -eq 30001|Select-Object LocalAddress,LocalPort,OwningProcess)}|ConvertTo-Json -Depth 6|Set-Content -LiteralPath (Join-Path $evidenceRoot 'pre-maintenance-service.json') -Encoding utf8
Stop-Process -Id $live.ProcessId
Wait-Process -Id $live.ProcessId -Timeout 15 -ErrorAction SilentlyContinue
if(Get-Process -Id $live.ProcessId -ErrorAction SilentlyContinue){throw 'Owned service did not stop; no force'}
python (Join-Path $PSScriptRoot 'install-vision-macro.py') --apply
if($LASTEXITCODE -ne 0){throw 'Partial installation; preserve and callback, do not replay'}
& (Join-Path $PSScriptRoot 'launch-next.ps1') -ExecutorThreadId $ExecutorThreadId -EvidenceRoot $evidenceRoot -DispatchId 'NEXT-VM-20260929-03'
