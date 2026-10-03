"""Build exact official base plus a separately versioned local adapter from fixed public assets."""
import difflib
import hashlib
import json
from pathlib import Path
import shutil
import zipfile
from assemble import inventory, validate

ROOT=Path(__file__).resolve().parent/'item-piles'
DIST=ROOT/'dist-local1'
records=[]
for source_label,module_id in [('item-piles','item-piles'),('item-piles-dnd5e','itempilesdnd5e')]:
    source=ROOT/'upstream'/source_label/'package'
    manifest=json.loads((source/'module.json').read_text(encoding='utf-8'))
    assert manifest['id']==module_id
    assert manifest==json.loads((ROOT/'upstream'/source_label/'module.json').read_text(encoding='utf-8'))
    target=DIST/module_id
    if target.exists(): raise ValueError(f'Refusing overwrite: {target}')
    if module_id=='item-piles':
        built=ROOT/'sources/base'
        target.mkdir(parents=True)
        for name in ['module.json','LICENSE','dist','templates','languages']:
            origin=built/name
            if origin.is_dir():shutil.copytree(origin,target/name)
            else:shutil.copyfile(origin,target/name)
        manifest=json.loads((target/'module.json').read_text(encoding='utf-8'))
    else:
        shutil.copytree(source,target)
        script=(source/'dist/module.js').read_text(encoding='utf-8')
        anchor='\tfor (const [version, data] of Object.entries(VERSIONS)) {'
        assert script.count(anchor)==1
        snippet=(ROOT/'dnd5e6-integration.js').read_text(encoding='utf-8')
        patched=script.replace(anchor,snippet+'\n'+anchor)
        (target/'dist/module.js').write_text(patched,encoding='utf-8')
        (ROOT/'adapter.patch').write_text(''.join(difflib.unified_diff(script.splitlines(True),patched.splitlines(True),fromfile='official-1.1.0/dist/module.js',tofile='local-1.1.0+servernext.1/dist/module.js')),encoding='utf-8')
        manifest['version']='1.1.0+servernext.1'
        manifest['title']+=' (ServerNext local 1)'
        manifest.pop('manifest',None);manifest.pop('download',None)
        (target/'module.json').write_text(json.dumps(manifest,indent=2)+'\n',encoding='utf-8')
    validate(target)
    archive=DIST/(module_id+'.zip')
    with zipfile.ZipFile(archive,'w',zipfile.ZIP_DEFLATED) as z:
        for file in inventory(target):z.write(target/file['path'],file['path'])
    records.append({'id':module_id,'version':manifest['version'],'kind':'local-source-build' if module_id=='item-piles' else 'local-release-source-adaptation','source':str(target),'archiveSha256':hashlib.sha256(archive.read_bytes()).hexdigest(),'files':inventory(target)})
(ROOT/'candidate-inventory.json').write_text(json.dumps(records,indent=2)+'\n',encoding='utf-8')
print(json.dumps([{k:v for k,v in row.items() if k!='files'} for row in records],indent=2))
