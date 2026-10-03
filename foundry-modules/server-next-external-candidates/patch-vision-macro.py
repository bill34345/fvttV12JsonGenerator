import difflib
import json
from pathlib import Path

ROOT=Path(__file__).resolve().parent/'vision-macro'
def patch(path,old,new,name):
    text=path.read_text(encoding='utf-8')
    if new in text and old not in text:return
    assert text.count(old)==1,f'Preimage mismatch: {path}'
    updated=text.replace(old,new)
    (ROOT/name).write_text(''.join(difflib.unified_diff(text.splitlines(True),updated.splitlines(True),fromfile=str(path.relative_to(ROOT)),tofile=str(path.relative_to(ROOT)))),encoding='utf-8')
    path.write_text(updated,encoding='utf-8')

patch(ROOT/'sources/vision/scripts/actor.mjs',
      '|| /\\[\\s*poison\\s*\\]/i.test(activity.damage.critical));',
      '|| /\\[\\s*poison\\s*\\]/i.test(activity.damage.critical?.bonus ?? activity.damage.critical));','vision-critical.patch')
patch(ROOT/'sources/macro/scripts/ItemMacroConfig.mjs',
      'this.#item.executeMacro(event);','return await this.#item.executeMacro({event});','macro-event.patch')
patch(ROOT/'sources/macro/scripts/ItemMacroConfig.mjs',
      'this.object = newMacro;','this.document.updateSource(newMacro.toObject());','macro-document.patch')
for sub,version in [('vision','3.2.2+servernext.1'),('macro','3.0.1+servernext.1')]:
    path=ROOT/'sources'/sub/'module.json'
    data=json.loads(path.read_text(encoding='utf-8'))
    data['version']=version
    if not data['title'].endswith(' (ServerNext local 1)'):data['title']+=' (ServerNext local 1)'
    data.pop('manifest',None);data.pop('download',None)
    path.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
