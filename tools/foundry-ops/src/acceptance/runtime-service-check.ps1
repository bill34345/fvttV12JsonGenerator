param(
 [Parameter(Mandatory=$true)][string]$ServiceReceipt,
 [Parameter(Mandatory=$true)][string]$SourceContract,
 [Parameter(Mandatory=$true)][string]$ParentThreadId,
 [Parameter(Mandatory=$true)][string]$ExecutorThreadId
)
$ErrorActionPreference='Stop'
$receipt=Get-Content -LiteralPath $ServiceReceipt -Raw | ConvertFrom-Json
$source=Get-Content -LiteralPath $SourceContract -Raw | ConvertFrom-Json
$target=$source.target
if ($target.origin -ne 'http://127.0.0.1:30002' -or $target.dataPath.Replace('/','\').TrimEnd('\') -ne 'F:\FoundryLab\foundry-v14\data\server-next' -or $target.world -ne 'cor-cotn' -or $target.foundry -ne '14.368' -or $target.system -ne 'dnd5e' -or $target.systemVersion -ne '6.0.2') {throw 'Only the exact existing local ServerNext target is supported'}
if ($receipt.parentThreadId -ne $ParentThreadId -or $receipt.executorThreadId -ne $ExecutorThreadId) {throw 'Service responsibility belongs to another batch'}
$listeners=@(Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | Where-Object LocalPort -eq 30002)
if ($listeners.Count -ne 1 -or $listeners[0].LocalAddress -ne '127.0.0.1' -or $listeners[0].OwningProcess -ne $receipt.pid) {throw 'Listener or PID changed'}
$live=Get-CimInstance Win32_Process -Filter "ProcessId=$($listeners[0].OwningProcess)"
if (-not $live -or $live.CommandLine -ne $receipt.commandLine) {throw 'Service command line changed'}
if ($live.CreationDate.ToUniversalTime().Ticks -ne ([datetime]$receipt.processCreationDate).ToUniversalTime().Ticks) {throw 'Service creation time changed'}
$node='F:\FoundryLab\foundry-v14\runtime\node-v24.17.0-win-x64\node.exe'
$app='F:\FoundryLab\foundry-v14\app\14.368\main.js'
if ($live.ExecutablePath -ne $node -or $live.CommandLine -notmatch [regex]::Escape($app) -or $live.CommandLine -notmatch [regex]::Escape("--dataPath=$($target.dataPath.Replace('/','\'))") -or $live.CommandLine -notmatch '--port=30002(?:\s|$)' -or $live.CommandLine -notmatch '--noBackups(?:\s|$)') {throw 'Exact application/data/port/no-backup process identity required'}
$owner=Invoke-CimMethod -InputObject $live -MethodName GetOwner
if ($owner.ReturnValue -ne 0 -or "$($owner.Domain)\$($owner.User)" -ne $receipt.processOwner) {throw 'Process owner changed'}
$appPackage=Get-Content -LiteralPath 'F:\FoundryLab\foundry-v14\app\14.368\package.json' -Raw | ConvertFrom-Json
$world=Get-Content -LiteralPath (Join-Path $target.dataPath "Data\worlds\$($target.world)\world.json") -Raw | ConvertFrom-Json
$system=Get-Content -LiteralPath (Join-Path $target.dataPath "Data\systems\$($target.system)\system.json") -Raw | ConvertFrom-Json
if ($target.foundry -ne '14.368' -or $appPackage.version -ne '14.368.0' -or $world.id -ne $target.world -or $world.system -ne $target.system -or $system.id -ne $target.system -or $system.version -ne $target.systemVersion) {throw 'Exact version/world/system identity changed'}
$status=Invoke-RestMethod -Uri "$($target.origin)/api/status" -TimeoutSec 5
if ($status.active -ne $true -or $status.version -ne $target.foundry -or $status.world -ne $target.world -or $status.system -ne $target.system -or $status.systemVersion -ne $target.systemVersion) {throw 'Live HTTP world/system/version identity mismatch'}
$mirror=@(Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | Where-Object LocalPort -eq 30001 | Select-Object LocalAddress,LocalPort,OwningProcess)
if (($mirror | ConvertTo-Json -Compress) -ne (@($receipt.mirrorBefore) | ConvertTo-Json -Compress)) {throw 'Mirror service changed since startup; coordinate before dispatch'}
[ordered]@{ok=$true;pid=$live.ProcessId;processOwner=$receipt.processOwner;target=$target;status=$status;checkedAt=(Get-Date -Format o)} | ConvertTo-Json -Depth 7
