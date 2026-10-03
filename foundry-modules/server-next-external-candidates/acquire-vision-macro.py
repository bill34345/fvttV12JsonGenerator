"""Public exact candidate inputs for the next independent source-review batch."""
import concurrent.futures
import json
from pathlib import Path
import subprocess
import acquire

root=Path(__file__).resolve().parent/'vision-macro'
root.mkdir(exist_ok=True);acquire.ROOT=root
lock=root/'upstream-lock.json'
acquire.LOCKED={row['id']:row for row in json.loads(lock.read_text(encoding='utf-8'))} if lock.exists() else {}
repos={'vision-5e':'dev7355608/vision-5e','item-macro':'Foundry-Workshop/Item-Macro'}
def run(pair):
    module_id,repo=pair
    record=acquire.acquire(module_id,repo)
    ref=json.loads(subprocess.check_output(['gh','api',f'repos/{repo}/commits/{record["tag"]}'],encoding='utf-8'))
    url=f'https://codeload.github.com/{repo}/zip/{ref["sha"]}'
    archive=root/'upstream'/module_id/'source.zip'
    record['source']={'commit':ref['sha'],'url':url,'sha256':acquire.download(url,archive)}
    target=root/'sources'/('vision' if module_id=='vision-5e' else 'macro')
    if not target.exists():acquire.extract(archive,target,strip_root=True)
    package=next((root/'upstream'/module_id/'package').rglob('module.json'))
    manifest=json.loads(package.read_text(encoding='utf-8'))
    record['packageId']=manifest['id'];record['packageVersion']=manifest['version']
    return record
with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:records=list(pool.map(run,repos.items()))
lock.write_text(json.dumps(records,indent=2)+'\n',encoding='utf-8')
for row in records:print(row['packageId'],row['packageVersion'],row['source']['commit'],row['releaseBody'])
