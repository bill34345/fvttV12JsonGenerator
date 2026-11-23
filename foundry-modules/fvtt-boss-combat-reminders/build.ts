import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';

const moduleId = 'fvtt-boss-combat-reminders';
const root = import.meta.dir;
const source = join(root, 'src');
const installRoot = join(root, 'dist', 'module');
const files = ['module.json', 'scripts/index.js', 'styles/reminders.css', 'lang/en.json', 'lang/zh-CN.json'];
const archivePath = join(root, 'dist', `${moduleId}.zip`);

const manifest = JSON.parse(await readFile(join(source, 'module.json'), 'utf8'));
const metadata = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
if (manifest.id !== moduleId || manifest.version !== metadata.version) {
  throw new Error('Package and manifest identity must match');
}

const build = await Bun.build({
  entrypoints: [join(source, 'index.ts')],
  outdir: join(installRoot, 'scripts'),
  naming: 'index.js',
  target: 'browser',
  format: 'esm',
});
if (!build.success) throw new AggregateError(build.logs, 'Boss Combat Reminders browser build failed');

for (const name of files.filter(file => file !== 'scripts/index.js')) {
  const target = join(installRoot, name);
  await mkdir(dirname(target), { recursive: true });
  await copyFile(join(source, name), target);
}

const data = await Promise.all(files.map(async name => ({
  name: Buffer.from(name, 'utf8'),
  contents: await readFile(join(installRoot, name)),
})));
const local: Buffer[] = [];
const central: Buffer[] = [];
let offset = 0;
for (const { name, contents } of data) {
  // The package is a small, deterministic ZIP with stored entries.
  const crc = Bun.hash.crc32(contents);
  const entry = Buffer.alloc(30);
  entry.writeUInt32LE(0x04034b50);
  entry.writeUInt16LE(20, 4);
  entry.writeUInt32LE(crc, 14);
  entry.writeUInt32LE(contents.length, 18);
  entry.writeUInt32LE(contents.length, 22);
  entry.writeUInt16LE(name.length, 26);
  const record = Buffer.alloc(46);
  record.writeUInt32LE(0x02014b50);
  record.writeUInt16LE(20, 4);
  record.writeUInt16LE(20, 6);
  record.writeUInt32LE(crc, 16);
  record.writeUInt32LE(contents.length, 20);
  record.writeUInt32LE(contents.length, 24);
  record.writeUInt16LE(name.length, 28);
  record.writeUInt32LE(offset, 42);

  local.push(entry, name, contents);
  central.push(record, name);
  offset += entry.length + name.length + contents.length;
}
const directory = Buffer.concat(central);
const end = Buffer.alloc(22);
end.writeUInt32LE(0x06054b50);
end.writeUInt16LE(files.length, 8);
end.writeUInt16LE(files.length, 10);
end.writeUInt32LE(directory.length, 12);
end.writeUInt32LE(offset, 16);
await writeFile(archivePath, Buffer.concat([...local, directory, end]));
console.log(JSON.stringify({ version: manifest.version, installRoot, archivePath, files }, null, 2));
