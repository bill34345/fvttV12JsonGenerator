import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';

const root = resolve(import.meta.dir, '../..');
const output = resolve(root, 'obsidian/dnd数据转fvttjson/output/crystalbleed-v12-rework');
await mkdir(output, { recursive: true });
const build = await Bun.build({
  entrypoints: [resolve(import.meta.dir, 'battle-control.mjs')],
  target: 'browser', format: 'cjs', minify: false,
});
if (!build.success) throw new Error(build.logs.map(String).join('\n'));
const command = `const module = { exports: {} };\n${await build.outputs[0].text()}\nreturn await module.exports.installCrystalbleedRuntime({ game, canvas, Hooks, ui, ChatMessage, Combat, Roll, Dialog, CONFIG });\n`;
new (Object.getPrototypeOf(async function () {}).constructor)(command);
await writeFile(resolve(output, 'battle-control.js'), command, 'utf8');
await writeFile(resolve(output, 'battle-control.macro.json'), JSON.stringify({
  name: '晶血龙兽·战斗控制', type: 'script', scope: 'global',
  img: 'icons/svg/daze.svg', command, ownership: { default: 0 },
  _stats: { coreVersion: '12.331', systemId: 'dnd5e', systemVersion: '4.3.9' },
}, null, 2), 'utf8');
const files = ['dragon.json', 'crystal.json', 'battle-control.js', 'battle-control.macro.json'];
const manifest = {};
for (const name of files) {
  const bytes = await readFile(resolve(output, name));
  manifest[name] = { bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex') };
}
await writeFile(resolve(output, 'manifest.json'), JSON.stringify({ target: { foundry: '12.331', dnd5e: '4.3.9' }, files: manifest }, null, 2));
console.log(JSON.stringify(manifest, null, 2));
