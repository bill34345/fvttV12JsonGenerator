import hashlib
import json
from pathlib import Path
import shutil
import zipfile
from acquire import extract
from assemble import inventory,validate

ROOT=Path(__file__).resolve().parent/'vision-macro'
DIST=ROOT/'dist';DIST.mkdir(exist_ok=True)
records=[]
for module_id,sub in [('vision-5e','vision'),('itemacro','macro')]:
    target=DIST/module_id
    if target.exists():raise ValueError(f'Refusing overwrite: {target}')
    source=ROOT/'sources'/sub
    if sub=='vision':extract(source/'module.zip',target)
    else:
        target.mkdir()
        for name in ['module.json','scripts','lang','LICENSE','README.md','CHANGELOG.md']:
            origin=source/name
            if origin.is_dir():shutil.copytree(origin,target/name)
            else:shutil.copyfile(origin,target/name)
        for file in (source/'scripts').rglob('*.mjs'):
            assert file.read_bytes()==(target/file.relative_to(source)).read_bytes()
    manifest=validate(target)
    assert manifest['id']==module_id
    assert manifest['version'].endswith('+servernext.1')
    assert manifest==json.loads((source/'module.json').read_text(encoding='utf-8'))
    archive=DIST/(module_id+'.zip')
    with zipfile.ZipFile(archive,'w',zipfile.ZIP_DEFLATED) as z:
        for file in inventory(target):z.write(target/file['path'],file['path'])
    records.append({'id':module_id,'version':manifest['version'],'kind':'local-source-build','source':str(target),'archiveSha256':hashlib.sha256(archive.read_bytes()).hexdigest(),'files':inventory(target)})
(ROOT/'candidate-inventory.json').write_text(json.dumps(records,indent=2)+'\n',encoding='utf-8')
print(json.dumps([{k:v for k,v in row.items() if k!='files'} for row in records],indent=2))
