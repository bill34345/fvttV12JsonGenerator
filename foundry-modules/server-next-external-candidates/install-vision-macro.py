import json
from pathlib import Path
import runpy
import shutil
import sys
from assemble import ROOT,RUNTIME,inventory,validate

shared=runpy.run_path(str(ROOT/'install-next.py'))
evidence=Path('F:/FoundryLab/foundry-v14/evidence/server-next-migration/vision-macro-20260929')
records=json.loads((ROOT/'vision-macro/candidate-inventory.json').read_text(encoding='utf-8'))
assert {r['id']:r['version'] for r in records}=={'vision-5e':'3.2.2+servernext.1','itemacro':'3.0.1+servernext.1'}
shared['no_reparse'](RUNTIME)
for record in records:
    source=Path(record['source']);shared['no_reparse'](source)
    assert source.resolve()==(ROOT/'vision-macro/dist'/record['id']).resolve()
    assert inventory(source)==record['files']
    assert not (RUNTIME/record['id']).exists(),'Refusing overwrite; inspect actual module state'
    validate(source)
if '--verify-only' in sys.argv:
    print('PASS: two exact candidate trees/resources; destinations absent; runtime unchanged');sys.exit(0)
if '--apply' not in sys.argv:raise ValueError('Use --verify-only or --apply')
receipt={'dispatchId':'NEXT-VM-20260929-03','before':shared['gate'](),'installed':[]}
evidence.mkdir(parents=True,exist_ok=True)
for record in records:
    shared['gate']();target=RUNTIME/record['id'];shutil.copytree(record['source'],target)
    actual=inventory(target);assert actual==record['files'],'Mismatch; preserve partial installation and report'
    receipt['installed'].append({'id':record['id'],'version':record['version'],'files':actual})
    (evidence/'install-receipt.json').write_text(json.dumps(receipt,indent=2),encoding='utf-8')
receipt['after']=shared['gate']()
(evidence/'install-receipt.json').write_text(json.dumps(receipt,indent=2),encoding='utf-8')
print('PASS: two installed packages match exact candidate inventory')
