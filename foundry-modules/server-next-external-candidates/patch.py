"""Apply guarded source patches to the fixed public inputs, preserving MIT licenses."""
import difflib
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent

def replace_once(path, old, new):
    text = path.read_text(encoding='utf-8')
    if new in text and old not in text:
        return
    if text.count(old) != 1:
        raise ValueError(f'Patch preimage mismatch: {path}')
    updated = text.replace(old, new)
    diff = ''.join(difflib.unified_diff(text.splitlines(True), updated.splitlines(True),
                    fromfile=str(path.relative_to(ROOT)), tofile=str(path.relative_to(ROOT))))
    (ROOT / (path.stem + '.patch')).write_text(diff, encoding='utf-8')
    path.write_text(updated, encoding='utf-8')

def local_manifest(path, version):
    manifest = json.loads(path.read_text(encoding='utf-8'))
    manifest['version'] = version
    manifest['title'] = manifest['title'].split(' (ServerNext local')[0] + ' (ServerNext local 1)'
    manifest.pop('manifest', None)
    manifest.pop('download', None)
    if manifest['id'] == 'global-progress-clocks':
        assert manifest['scripts'] in ([], ['greensock/dist/gsap.min.js'])
        manifest['scripts'] = []
    path.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + '\n', encoding='utf-8')

if __name__ == '__main__':
    replace_once(ROOT / 'sources/drop/src/ts/constants.ts',
                 'import moduleData from "@static/module.json" with { type: "json" };\n\nexport const MODULE_ID = moduleData.id;',
                 '// Fixed namespace: the upstream release bundled the JSON object as MODULE_ID.\nexport const MODULE_ID = "dfreds-droppables";')
    replace_once(ROOT / 'sources/clocks/module/clock-panel.mjs',
                 'gsap.fromTo(html.querySelector(`[data-id="${newId}"]`), { opacity: 0 }, { opacity: 1, duration: 0.25 });',
                 'html.querySelector(`[data-id="${newId}"]`).animate(\n                [{ opacity: 0 }, { opacity: 1 }],\n                { duration: 250, easing: "ease-out" }\n            );')
    local_manifest(ROOT / 'sources/drop/static/module.json', '6.2.1+servernext.1')
    local_manifest(ROOT / 'sources/clocks/module.json', '1.3.3+servernext.1')
    package = ROOT / 'sources/drop/package.json'
    data = json.loads(package.read_text(encoding='utf-8'))
    data['version'] = '6.2.1+servernext.1'
    package.write_text(json.dumps(data, indent=2) + '\n', encoding='utf-8')
    # npm ci checks dependency resolution; keep root identity consistent in the lock too.
    lock = ROOT / 'sources/drop/package-lock.json'
    data = json.loads(lock.read_text(encoding='utf-8'))
    data['version'] = data['packages']['']['version'] = '6.2.1+servernext.1'
    lock.write_text(json.dumps(data, indent=2) + '\n', encoding='utf-8')
