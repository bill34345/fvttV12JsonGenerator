"""Install only three absent, hash-locked packages into offline ServerNext."""
import json
from pathlib import Path
import shutil
import subprocess
from assemble import ROOT, RUNTIME, inventory, validate

EVIDENCE = Path('F:/FoundryLab/foundry-v14/evidence/server-next-migration/external-first-20260929')
ALLOW = {'dfreds-convenient-effects','dfreds-droppables','global-progress-clocks'}

def no_reparse(path):
    for item in (path, *path.parents):
        if item.is_symlink() or item.is_junction():
            raise ValueError(f'Reparse path forbidden: {item}')

def gate():
    script = r'''
$ErrorActionPreference='Stop'
$listeners=@(Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | Where-Object LocalPort -eq 30002)
$processes=@(Get-CimInstance Win32_Process | Where-Object { $_.Name -match '^(node|Foundry Virtual Tabletop|FoundryVTT).*' -and $_.CommandLine -match 'server-next' })
if ($listeners.Count -or $processes.Count) { throw 'ServerNext is running; offline install refused' }
$root='F:\FoundryLab\foundry-v14\data\server-next\Data\worlds\cor-cotn'
$world=Get-Content -LiteralPath (Join-Path $root 'world.json') | ConvertFrom-Json
$system=Get-Content -LiteralPath 'F:\FoundryLab\foundry-v14\data\server-next\Data\systems\dnd5e\system.json' | ConvertFrom-Json
if ($world.id -ne 'cor-cotn' -or $world.coreVersion -ne '14.368' -or $world.system -ne 'dnd5e' -or $system.version -ne '6.0.2') { throw 'Exact target mismatch' }
Get-ChildItem -LiteralPath $root -Directory | ForEach-Object {
 $lockPath=Join-Path $_.FullName 'LOCK'
 if (Test-Path -LiteralPath $lockPath -PathType Leaf) {
  $handle=[System.IO.File]::Open($lockPath,[System.IO.FileMode]::Open,[System.IO.FileAccess]::Read,[System.IO.FileShare]::None)
  $handle.Dispose()
 }
}
[ordered]@{time=(Get-Date -Format o);nextListenerCount=$listeners.Count;nextProcessCount=$processes.Count;world=$world.id;core=$world.coreVersion;system=$system.version;worldLocks='exclusive-read-open passed';mirror=@(Get-NetTCPConnection -State Listen -ErrorAction SilentlyContinue | Where-Object LocalPort -eq 30001 | Select-Object LocalAddress,LocalPort,OwningProcess)} | ConvertTo-Json -Depth 4
'''
    return json.loads(subprocess.check_output(['pwsh','-NoProfile','-Command',script],encoding='utf-8'))

if __name__ == '__main__':
    no_reparse(RUNTIME)
    receipt=json.loads((ROOT/'candidate-inventory.json').read_text(encoding='utf-8'))
    if {c['id'] for c in receipt['candidates']} != ALLOW: raise ValueError('Unexpected allowlist')
    for c in receipt['candidates']:
        source=Path(c['source']); no_reparse(source)
        if source.resolve() != (ROOT/'dist'/c['id']).resolve(): raise ValueError('Unexpected source')
        if inventory(source) != c['files']: raise ValueError('Candidate hash drift')
        if (RUNTIME/c['id']).exists(): raise ValueError(f'Refusing overwrite: {c["id"]}')
        validate(source)
    for dependency in receipt['dependencies']:
        if dependency['mismatches'] or inventory(RUNTIME/dependency['id']) != dependency['files']:
            raise ValueError('Dependency mismatch or drift')
    EVIDENCE.mkdir(parents=True,exist_ok=True)
    result={'before':gate(),'installed':[]}
    for c in receipt['candidates']:
        gate()
        destination=RUNTIME/c['id']
        shutil.copytree(c['source'],destination)
        actual=inventory(destination)
        if actual!=c['files']: raise ValueError(f'Postinstall mismatch: {c["id"]}; preserve partial target and inspect')
        result['installed'].append({'id':c['id'],'version':c['version'],'destination':str(destination),'files':actual})
        (EVIDENCE/'install-receipt.json').write_text(json.dumps(result,indent=2)+'\n',encoding='utf-8')
    result['after']=gate()
    (EVIDENCE/'install-receipt.json').write_text(json.dumps(result,indent=2)+'\n',encoding='utf-8')
    print(json.dumps({k:v for k,v in result.items() if k!='installed'},indent=2))
    print('Installed and verified:', ', '.join(c['id'] for c in result['installed']))
