param([Parameter(Mandatory=$true)][string]$ExecutorThreadId,
 [string]$EvidenceRoot='F:\FoundryLab\foundry-v14\evidence\server-next-migration\external-first-20260929',
 [string]$DispatchId='NEXT-EXT-20260929-01',
 [ValidateRange(10,300)][int]$ReadyTimeoutSeconds=180)
$ErrorActionPreference='Stop'
if ($EvidenceRoot -notin @('F:\FoundryLab\foundry-v14\evidence\server-next-migration\external-first-20260929','F:\FoundryLab\foundry-v14\evidence\server-next-migration\item-piles-20260929','F:\FoundryLab\foundry-v14\evidence\server-next-migration\item-piles-20260929\recovery3','F:\FoundryLab\foundry-v14\evidence\server-next-migration\vision-macro-20260929')) {throw 'Evidence path not allowed'}
$permission=Get-Content -LiteralPath (Join-Path $evidenceRoot 'executor-permissions.json') | ConvertFrom-Json
if ($permission.threadId -ne $ExecutorThreadId -or $permission.sandboxMode -ne 'danger-full-access' -or $permission.approvalPolicy -ne 'never' -or $permission.verifiedFromActualHostContext -ne $true) {throw 'Executor actual Full Access receipt required before service startup'}
$listeners=@(Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | Where-Object LocalPort -eq 30002)
$processes=@(Get-CimInstance Win32_Process | Where-Object {$_.Name -match '^node' -and $_.CommandLine -match 'server-next'})
if ($listeners.Count -or $processes.Count) {throw 'Unexpected existing Next service; read back and coordinate, do not replace it'}
$node='F:\FoundryLab\foundry-v14\runtime\node-v24.17.0-win-x64\node.exe'
$app='F:\FoundryLab\foundry-v14\app\14.368\main.js'
$data='F:\FoundryLab\foundry-v14\data\server-next'
$preload='F:\FoundryLab\foundry-v14\evidence\server-next-migration\loopback-preload.cjs'
$appVersion=(Get-Content -LiteralPath 'F:\FoundryLab\foundry-v14\app\14.368\package.json' | ConvertFrom-Json).version
$system=Get-Content -LiteralPath (Join-Path $data 'Data\systems\dnd5e\system.json') | ConvertFrom-Json
$world=Get-Content -LiteralPath (Join-Path $data 'Data\worlds\cor-cotn\world.json') | ConvertFrom-Json
if ($appVersion -ne '14.368.0' -or $system.version -ne '6.0.2' -or $world.id -ne 'cor-cotn') {throw 'Target version/world drift'}
$mirrorBefore=@(Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | Where-Object LocalPort -eq 30001 | Select-Object LocalAddress,LocalPort,OwningProcess)
$arguments=@('--require',$preload,$app,"--dataPath=$data",'--hostname=127.0.0.1','--port=30002','--world=cor-cotn','--noupnp','--noupdate','--noBackups','--noipdiscovery')
$launched=Start-Process -FilePath $node -ArgumentList $arguments -WorkingDirectory 'F:\FoundryLab\foundry-v14\app\14.368' -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $evidenceRoot 'server-stdout.log') -RedirectStandardError (Join-Path $evidenceRoot 'server-stderr.log')
$startedReceipt=[ordered]@{dispatchId=$DispatchId;parentThreadId='01a0ec3b-9fad-72a0-9869-c6f58a0220b6';executorThreadId=$ExecutorThreadId;time=(Get-Date -Format o);pid=$launched.Id;dataPath=$data;stage='STARTED_NOT_YET_VERIFIED';readyTimeoutSeconds=$ReadyTimeoutSeconds;recovery='If readiness times out, inspect this same process; do not launch a second service or clear locks.'}
$startedReceipt | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $evidenceRoot 'service-started.json') -Encoding utf8
# Bounded startup, not a long-running monitor. Never clear a lock or kill a foreign PID.
$deadline=(Get-Date).AddSeconds($ReadyTimeoutSeconds)
$status=$null
do {
  Start-Sleep -Seconds 2
  if (-not (Get-Process -Id $launched.Id -ErrorAction SilentlyContinue)) {throw 'Next exited; preserve logs and return blocker; do not clear locks or retry unchanged'}
  try {$status=Invoke-RestMethod -Uri 'http://127.0.0.1:30002/api/status' -TimeoutSec 3} catch {}
} until ($status -or (Get-Date) -gt $deadline)
$live=Get-CimInstance Win32_Process -Filter "ProcessId=$($launched.Id)"
$bound=@(Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | Where-Object LocalPort -eq 30002)
if (-not $status -or $bound.Count -ne 1 -or $bound[0].OwningProcess -ne $launched.Id -or $bound[0].LocalAddress -ne '127.0.0.1' -or $live.CommandLine -notmatch [regex]::Escape($data)) {throw 'Service identity/ready gate failed; read back exact retained process and report'}
$owner=Invoke-CimMethod -InputObject $live -MethodName GetOwner
$receipt=[ordered]@{dispatchId=$DispatchId;parentThreadId='01a0ec3b-9fad-72a0-9869-c6f58a0220b6';executorThreadId=$ExecutorThreadId;time=(Get-Date -Format o);pid=$launched.Id;processOwner="$($owner.Domain)\$($owner.User)";commandLine=$live.CommandLine;listener=@($bound | Select-Object LocalAddress,LocalPort,OwningProcess);status=$status;mirrorBefore=$mirrorBefore;mirrorAfter=@(Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | Where-Object LocalPort -eq 30001 | Select-Object LocalAddress,LocalPort,OwningProcess);serviceResponsibility='Parent owns Next; executor may leave verified service running after batch. No stop/restart without a new concrete reason.'}
$receipt | ConvertTo-Json -Depth 8 | Set-Content -LiteralPath (Join-Path $evidenceRoot 'service-receipt.json') -Encoding utf8
$receipt | ConvertTo-Json -Depth 8
