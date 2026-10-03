"""Assemble and inventory exact candidates without touching the runtime."""
import hashlib
import json
from pathlib import Path
import shutil
import zipfile

ROOT = Path(__file__).resolve().parent
RUNTIME = Path('F:/FoundryLab/foundry-v14/data/server-next/Data/modules')

def inventory(root):
    result = []
    for path in sorted(root.rglob('*')):
        if path.is_symlink():
            raise ValueError(f'Unexpected link: {path}')
        if path.is_file():
            result.append({'path': path.relative_to(root).as_posix(),
                           'sha256': hashlib.sha256(path.read_bytes()).hexdigest()})
    return result

def validate(root):
    manifest = json.loads((root / 'module.json').read_text(encoding='utf-8'))
    paths = list(manifest.get('esmodules', [])) + list(manifest.get('scripts', []))
    paths += [s if isinstance(s, str) else s['src'] for s in manifest.get('styles', [])]
    paths += [s['path'] for s in manifest.get('languages', []) + manifest.get('packs', [])]
    for rel in paths:
        target = (root / rel).resolve()
        if not target.is_relative_to(root.resolve()) or not target.exists():
            raise ValueError(f'Missing/unsafe declared resource: {manifest["id"]}: {rel}')
    return manifest

if __name__ == '__main__':
    dist = ROOT / 'dist'
    dist.mkdir(exist_ok=True)
    records = []
    for module_id in ('dfreds-convenient-effects', 'dfreds-droppables', 'global-progress-clocks'):
        target = dist / module_id
        if target.exists() and module_id != 'global-progress-clocks':
            validate(target)
        elif module_id == 'dfreds-convenient-effects':
            source = next((ROOT / 'upstream' / module_id / 'package').rglob('module.json')).parent
            released = json.loads((ROOT / 'upstream' / module_id / 'module.json').read_text(encoding='utf-8'))
            assert json.loads((source / 'module.json').read_text(encoding='utf-8')) == released
            shutil.copytree(source, target)
        elif module_id == 'dfreds-droppables':
            shutil.copytree(ROOT / 'sources/drop/dist', target)
            shutil.copyfile(ROOT / 'sources/drop/LICENSE', target / 'LICENSE')
        else:
            source = ROOT / 'sources/clocks'
            target.mkdir(exist_ok=True)
            for name in ('module.json', 'lang', 'module', 'styles', 'templates', 'LICENSE', 'Readme.md'):
                origin = source / name
                if origin.is_dir():
                    shutil.copytree(origin, target / name)
                else:
                    shutil.copyfile(origin, target / name)
        manifest = validate(target)
        files = inventory(target)
        archive_path = dist / (module_id + '.zip')
        with zipfile.ZipFile(archive_path, 'w', zipfile.ZIP_DEFLATED) as archive:
            for item in files:
                archive.write(target / item['path'], item['path'])
        records.append({'id': module_id, 'version': manifest['version'], 'source': str(target),
                        'kind': 'official' if module_id == 'dfreds-convenient-effects' else 'local-source-build',
                        'archiveSha256': hashlib.sha256(archive_path.read_bytes()).hexdigest(), 'files': files})
    deps = []
    for module_id in ('socketlib', 'lib-dfreds-ui-extender', 'lib-dfreds-migrations'):
        package = next((ROOT / 'upstream' / module_id / 'package').rglob('module.json')).parent
        expected = inventory(package)
        actual = {item['path']: item['sha256'] for item in inventory(RUNTIME / module_id)}
        mismatches = [item['path'] for item in expected if actual.get(item['path']) != item['sha256']]
        extras = sorted(set(actual) - {item['path'] for item in expected})
        manifest = validate(RUNTIME / module_id)
        deps.append({'id': module_id, 'version': manifest['version'], 'mismatches': mismatches,
                     'extraFiles': extras, 'files': inventory(RUNTIME / module_id)})
    receipt = {'target': str(RUNTIME), 'candidates': records, 'dependencies': deps}
    (ROOT / 'candidate-inventory.json').write_text(json.dumps(receipt, indent=2) + '\n', encoding='utf-8')
    print(json.dumps({'candidates': [{k:v for k,v in r.items() if k != 'files'} for r in records],
                      'dependencies': [{k:v for k,v in r.items() if k != 'files'} for r in deps]}, indent=2))
