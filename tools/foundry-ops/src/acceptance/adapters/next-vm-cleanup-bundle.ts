import { resolve } from 'node:path';
import { runInNewContext } from 'node:vm';

/** Explicit local CJS binding: a syntax-valid IIFE alone need not expose its exports. */
export async function buildNextVmCleanupGuard(): Promise<string> {
  const build = await Bun.build({ entrypoints: [resolve(import.meta.dir, 'next-vm-cleanup.ts')],
    target: 'browser', format: 'cjs', minify: false });
  if (!build.success || build.outputs.length !== 1) throw new Error(`Cleanup guard build failed: ${build.logs}`);
  const body = await build.outputs[0]!.text();
  const bundle = `const NextVmCleanup = (() => {\nconst module = { exports: {} };\nconst exports = module.exports;\n${body}\nreturn module.exports;\n})();\n`;
  const kind = runInNewContext(`${bundle}\ntypeof NextVmCleanup.requireNextVmCleanupOwnership`, {}, { timeout: 1000 });
  if (kind !== 'function') throw new Error('Compiled cleanup guard does not expose the required local function.');
  return bundle;
}
