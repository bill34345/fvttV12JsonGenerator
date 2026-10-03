import difflib
import json
from pathlib import Path

ROOT=Path(__file__).resolve().parent/'item-piles'
source=ROOT/'sources/base'
path=source/'src/helpers/utilities.js'
text=path.read_text(encoding='utf-8')
anchor='export function ensureValidIds(actor, itemsToCreate) {\n'
assert text.count(anchor)==1
snippet=(ROOT/'container-id-remap.js').read_text(encoding='utf-8')
if snippet not in text:
    patched=text.replace(anchor,anchor+snippet)
    (ROOT/'base-container-id.patch').write_text(''.join(difflib.unified_diff(text.splitlines(True),patched.splitlines(True),fromfile='upstream-3.3.4/src/helpers/utilities.js',tofile='local-3.3.4+servernext.1/src/helpers/utilities.js')),encoding='utf-8')
    path.write_text(patched,encoding='utf-8')
for name in ['module.json','package.json','package-lock.json']:
    path=source/name
    data=json.loads(path.read_text(encoding='utf-8'))
    data['version']='3.3.4+servernext.1'
    if name=='module.json':
        data['title']='Item Piles (ServerNext local 1)'
        data.pop('manifest',None);data.pop('download',None)
    if name=='package-lock.json':data['packages']['']['version']='3.3.4+servernext.1'
    path.write_text(json.dumps(data,indent=2)+'\n',encoding='utf-8')
