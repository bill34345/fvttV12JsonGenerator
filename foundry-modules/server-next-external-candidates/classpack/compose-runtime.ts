import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/** Keep the browser adapter and entrypoint in one hash-bound, self-contained module. */
export function composeClasspackRuntime(directory: string): string {
  const interop = readFileSync(join(directory, 'tcoe-source-interop.mjs'), 'utf8');
  const gate = JSON.parse(readFileSync(join(directory, 'tcoe-ranger-source-gate.json'), 'utf8'));
  const adapter = readFileSync(join(directory, 'source-safe-native-migration.mjs'), 'utf8');
  if (/^import\s/m.test(adapter) || /\b(?:require|process)\./.test(adapter)) {
    throw new Error('Classpack native adapter must remain browser-only');
  }
  return interop.replace(/^export (?=(?:async )?function )/gm, '') + '\n'
    + `const classpackSourceInterop = registerClasspackTcoeSourceInterop({Hooks,getGame:()=>game,expectedAdvancementIds:${JSON.stringify(gate.expectedAdvancementIds)}});\n`
    + adapter.replace(/^export (?=(?:async )?function )/gm, '') + '\n'
    + readFileSync(join(directory, 'next-migration.mjs'), 'utf8');
}
