import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';

export const dsnInitiativeUpstream = JSON.parse(await readFile(new URL('./upstream-lock.json', import.meta.url), 'utf8'));
export const pendingField = '    static _flagRenderPending = false;';
export const flagRedraw = [
  '        if (!this._flagRenderPending) {',
  '            this._flagRenderPending = true;',
  '            queueMicrotask(() => {',
  '                this._flagRenderPending = false;',
  '                ui.combat?.render();',
  '            });',
  '        }'
].join('\n');

export function patchInitiativeMask(source) {
  if (createHash('sha256').update(source).digest('hex') !== dsnInitiativeUpstream.sourceSha256) {
    throw new Error('InitiativeMask does not match the pinned official source');
  }
  return source.replace('    static _renderTimer = null;\n', `    static _renderTimer = null;\n${pendingField}\n`)
    .replace('        this._messageToCombatant.set(chatMessage.id, combatantId);\n        ui.combat?.render();',
      `        this._messageToCombatant.set(chatMessage.id, combatantId);\n${flagRedraw}`);
}

export function flagMethod(source) {
  const start = source.indexOf('static flag(');
  const end = source.indexOf('\n    /**', start);
  if (start < 0 || end < 0) throw new Error('Expected the pinned InitiativeMask flag method');
  return source.slice(start, end).trimEnd();
}
