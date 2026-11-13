import { readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

export async function expectedForgePdfAssets(): Promise<Array<{ name: string; source: string }>> {
  const root = resolve(Bun.resolveSync('pdfjs-dist/package.json', resolve('packages/forge-browser-runtime')), '..');
  const manifest = JSON.parse(await readFile(resolve(root, 'package.json'), 'utf8'));
  if (manifest.version !== '6.4.299') throw Error('Test expects the reviewed PDF.js version.');
  const files = ['build/pdf.mjs', 'build/pdf.worker.mjs', 'LICENSE'];
  for (const directory of ['cmaps', 'standard_fonts']) {
    const entries = await readdir(resolve(root, directory), { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile()) throw Error(`Unexpected nested PDF.js asset: ${entry.name}`);
      files.push(`${directory}/${entry.name}`);
    }
  }
  return files.map(file => ({ name: `vendor/pdfjs/${file.replace(/^build\//u, '')}`, source: resolve(root, file) }))
    .sort((a, b) => a.name.localeCompare(b.name, 'en'));
}
