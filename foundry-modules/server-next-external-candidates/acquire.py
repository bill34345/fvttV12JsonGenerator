"""Acquire public release inputs only; never touches a Foundry installation."""
import concurrent.futures
import hashlib
import json
from pathlib import Path
import subprocess
import urllib.request
import zipfile

ROOT = Path(__file__).resolve().parent
LOCK_PATH = ROOT / 'upstream-lock.json'
LOCKED = {item['id']: item for item in json.loads(LOCK_PATH.read_text(encoding='utf-8'))} if LOCK_PATH.exists() else {}
REPOS = {
    'dfreds-convenient-effects': 'DFreds/dfreds-convenient-effects',
    'dfreds-droppables': 'DFreds/dfreds-droppables',
    'global-progress-clocks': 'CarlosFdez/global-progress-clocks',
    'socketlib': 'farling42/foundryvtt-socketlib',
    'lib-dfreds-ui-extender': 'DFreds/lib-dfreds-ui-extender',
    'lib-dfreds-migrations': 'DFreds/lib-dfreds-migrations',
}

def download(url, path, digest=None):
    path.parent.mkdir(parents=True, exist_ok=True)
    if not path.exists():
        with urllib.request.urlopen(url, timeout=90) as response:
            data = response.read()
        path.write_bytes(data)
    actual = hashlib.sha256(path.read_bytes()).hexdigest()
    if digest and digest != 'sha256:' + actual:
        raise ValueError(f'Digest mismatch: {path}')
    return actual

def extract(path, target, strip_root=False):
    if target.exists():
        raise ValueError(f'Refusing to overwrite extracted tree: {target}')
    with zipfile.ZipFile(path) as archive:
        for info in archive.infolist():
            parts = info.filename.replace('\\', '/').split('/')
            if '..' in parts or ':' in info.filename or info.filename.startswith('/'):
                raise ValueError(f'Unsafe ZIP member: {info.filename}')
            if (info.external_attr >> 16) & 0o170000 == 0o120000:
                raise ValueError(f'Symlink ZIP member: {info.filename}')
        for info in archive.infolist():
            parts = info.filename.split('/')[1:] if strip_root else info.filename.split('/')
            if not any(parts):
                continue
            output = target.joinpath(*parts)
            if info.is_dir():
                output.mkdir(parents=True, exist_ok=True)
            else:
                output.parent.mkdir(parents=True, exist_ok=True)
                output.write_bytes(archive.read(info))

def acquire(module_id, repo):
    endpoint = f'tags/{LOCKED[module_id]["tag"]}' if module_id in LOCKED else 'latest'
    release = json.loads(subprocess.check_output(
        ['gh', 'api', f'repos/{repo}/releases/{endpoint}'], text=True, encoding='utf-8'))
    assert not release['draft'] and not release['prerelease']
    folder = ROOT / 'upstream' / module_id
    folder.mkdir(parents=True, exist_ok=True)
    assets = []
    for asset in release['assets']:
        if asset['name'].endswith('.zip') or asset['name'] == 'module.json':
            path = folder / asset['name']
            sha = download(asset['browser_download_url'], path, asset.get('digest'))
            assets.append({'name': asset['name'], 'url': asset['browser_download_url'], 'sha256': sha})
            if path.suffix == '.zip':
                destination = folder / 'package'
                if not destination.exists():
                    extract(path, destination)
    source = None
    if module_id in ('dfreds-droppables', 'global-progress-clocks'):
        tag = release['tag_name']
        ref = json.loads(subprocess.check_output(
            ['gh', 'api', f'repos/{repo}/commits/{tag}'], text=True, encoding='utf-8'))
        url = f'https://codeload.github.com/{repo}/zip/{ref["sha"]}'
        source_zip = folder / 'source.zip'
        source = {'commit': ref['sha'], 'url': url, 'sha256': download(url, source_zip)}
        if module_id in LOCKED and source != LOCKED[module_id]['source']:
            raise ValueError(f'Locked upstream source drift: {module_id}')
        target = ROOT / 'sources' / ('drop' if module_id == 'dfreds-droppables' else 'clocks')
        if not target.exists():
            extract(source_zip, target, strip_root=True)
    record = {'id': module_id, 'repo': repo, 'tag': release['tag_name'],
              'publishedAt': release['published_at'], 'releaseUrl': release['html_url'],
              'releaseBody': release['body'], 'assets': assets, 'source': source}
    (folder / 'release.json').write_text(json.dumps(record, indent=2), encoding='utf-8')
    return record

if __name__ == '__main__':
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as executor:
        results = list(executor.map(lambda pair: acquire(*pair), REPOS.items()))
    (ROOT / 'upstream-lock.json').write_text(json.dumps(results, indent=2) + '\n', encoding='utf-8')
    for result in results:
        print(result['id'], result['tag'], result['releaseBody'])
