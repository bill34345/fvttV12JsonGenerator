import json
from pathlib import Path
import runpy
import shutil
import sys
from assemble import ROOT,RUNTIME,inventory,validate

shared=runpy.run_path(str(ROOT/'install-next.py'))
evidence=Path('F:/FoundryLab/foundry-v14/evidence/server-next-migration/item-piles-20260929')
records=json.loads((ROOT/'item-piles/candidate-inventory.json').read_text(encoding='utf-8'))
assert {r['id']:r['version'] for r in records}=={'item-piles':'3.3.4+servernext.1','itempilesdnd5e':'1.1.0+servernext.1'}
shared['no_reparse'](RUNTIME)
for record in records:
    source=Path(record['source']);shared['no_reparse'](source)
    assert source.resolve()==(ROOT/'item-piles/dist-local1'/record['id']).resolve()
    assert inventory(source)==record['files']
    assert not (RUNTIME/record['id']).exists(),'Refusing to replace existing module; inspect actual state'
    validate(source)
socket=next(r for r in json.loads((ROOT/'candidate-inventory.json').read_text(encoding='utf-8'))['dependencies'] if r['id']=='socketlib')
wrapper=json.loads((ROOT/'item-piles/dependency-receipt.json').read_text(encoding='utf-8'))
assert inventory(RUNTIME/'socketlib')==socket['files']
assert inventory(RUNTIME/'lib-wrapper')==wrapper['installedFiles']
if '--verify-only' in sys.argv:
    print('PASS: exact candidates/dependencies/absent destinations; runtime unchanged')
    sys.exit(0)
if '--apply' not in sys.argv:raise ValueError('Use --verify-only or --apply')
receipt={'dispatchId':'NEXT-PILES-20260929-02','before':shared['gate'](),'installed':[]}
evidence.mkdir(parents=True,exist_ok=True)
for record in records:
    shared['gate']()
    target=RUNTIME/record['id']
    shutil.copytree(record['source'],target)
    actual=inventory(target)
    assert actual==record['files'],'Postinstall mismatch; preserve partial state and report'
    receipt['installed'].append({'id':record['id'],'version':record['version'],'files':actual})
    (evidence/'install-receipt.json').write_text(json.dumps(receipt,indent=2),encoding='utf-8')
receipt['after']=shared['gate']()
(evidence/'install-receipt.json').write_text(json.dumps(receipt,indent=2),encoding='utf-8')
print('PASS: installed two exact local candidates; file hashes match')
