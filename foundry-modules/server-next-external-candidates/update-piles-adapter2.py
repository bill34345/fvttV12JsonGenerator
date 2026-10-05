import json
from pathlib import Path
import runpy
import shutil
import sys
from assemble import ROOT,RUNTIME,inventory,validate

shared=runpy.run_path(str(ROOT/'install-next.py'))
evidence=Path('F:/FoundryLab/foundry-v14/evidence/server-next-migration/item-piles-20260929/recovery3')
source=ROOT/'item-piles/dist-local2/itempilesdnd5e';target=RUNTIME/'itempilesdnd5e'
record=next(r for r in json.loads((ROOT/'item-piles/candidate-inventory.json').read_text(encoding='utf-8')) if r['id']=='itempilesdnd5e')
old=inventory(ROOT/'item-piles/dist-local1/itempilesdnd5e')
for path in [source,target]:shared['no_reparse'](path)
assert inventory(target)==old,'Installed adapter1 drift: do not overwrite'
assert inventory(source)==record['files'] and record['version']=='1.1.0+servernext.2'
assert {f['path'] for f in old}=={f['path'] for f in record['files']}
validate(source)
before={f['path']:f['sha256'] for f in old}
changed=[f['path'] for f in record['files'] if f['sha256']!=before[f['path']]]
assert set(changed)=={'module.json','dist/module.js'},changed
base=next(r for r in json.loads((ROOT/'item-piles/candidate-inventory.json').read_text(encoding='utf-8')) if r['id']=='item-piles')
assert inventory(RUNTIME/'item-piles')==base['files'],'Base package drift'
if '--verify-only' in sys.argv:print('PASS: adapter1/base1 exact; update changes only module.json and dist/module.js');sys.exit(0)
if '--apply' not in sys.argv:raise ValueError('Use --verify-only or --apply')
receipt={'dispatchId':'NEXT-PILES-20260929-02','revision':3,'before':shared['gate'](),'changed':changed,'beforeFiles':old}
evidence.mkdir(parents=True,exist_ok=True)
for relative in changed:shutil.copyfile(source/relative,target/relative)
assert inventory(target)==record['files'],'Postupdate mismatch: preserve, do not replay'
receipt['afterFiles']=inventory(target);receipt['after']=shared['gate']()
(evidence/'adapter-update-receipt.json').write_text(json.dumps(receipt,indent=2),encoding='utf-8')
print('PASS: exact adapter2 installed; no deletion or backups; base1 unchanged')
