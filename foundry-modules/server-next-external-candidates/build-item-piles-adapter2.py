import difflib
import hashlib
import json
from pathlib import Path
import shutil
import zipfile
from assemble import inventory,validate

ROOT=Path(__file__).resolve().parent/'item-piles'
source=ROOT/'dist-local1/itempilesdnd5e'
target=ROOT/'dist-local2/itempilesdnd5e'
if target.exists():raise ValueError('Refusing overwrite of existing adapter2 candidate')
shutil.copytree(source,target)
script=(source/'dist/module.js').read_text(encoding='utf-8')
anchor='\tfor (const [version, data] of Object.entries(VERSIONS)) {'
assert script.count(anchor)==1
snippet=(ROOT/'register-target-first.js').read_text(encoding='utf-8')
patched=script.replace(anchor,snippet+anchor)
(target/'dist/module.js').write_text(patched,encoding='utf-8')
(ROOT/'adapter-registration.patch').write_text(''.join(difflib.unified_diff(script.splitlines(True),patched.splitlines(True),fromfile='local1/dist/module.js',tofile='local2/dist/module.js')),encoding='utf-8')
manifest=json.loads((target/'module.json').read_text(encoding='utf-8'))
manifest['version']='1.1.0+servernext.2';manifest['title']='Item Piles: D&D 5e (ServerNext local 2)'
(target/'module.json').write_text(json.dumps(manifest,indent=2)+'\n',encoding='utf-8')
validate(target)
archive=target.parent/'itempilesdnd5e.zip'
files=inventory(target)
with zipfile.ZipFile(archive,'w',zipfile.ZIP_DEFLATED) as z:
    for file in files:z.write(target/file['path'],file['path'])
current=json.loads((ROOT/'candidate-inventory.json').read_text(encoding='utf-8'))
current=[row for row in current if row['id']!='itempilesdnd5e']
current.append({'id':'itempilesdnd5e','version':manifest['version'],'kind':'local-release-source-adaptation','source':str(target),'archiveSha256':hashlib.sha256(archive.read_bytes()).hexdigest(),'files':files})
(ROOT/'candidate-inventory.json').write_text(json.dumps(current,indent=2)+'\n',encoding='utf-8')
print(json.dumps({k:v for k,v in current[-1].items() if k!='files'},indent=2))
