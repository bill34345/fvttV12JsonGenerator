import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

export const tooltipUpstream = JSON.parse(await readFile(new URL('./upstream-lock.json', import.meta.url), 'utf8'));

export async function readPinnedTooltipSource(sourceRoot) {
  return readFile(join(sourceRoot, tooltipUpstream.sourcePath), 'utf8');
}

export function patchTooltipLifecycle(source) {
  source = source.replaceAll('\r\n', '\n');
  if (createHash('sha256').update(source).digest('hex') !== tooltipUpstream.sourceSha256Lf) {
    throw new Error('Tooltip source does not match the pinned dnd5e 6.0.6 source');
  }

  return source
    .replace(
      '    const { element } = game.tooltip;\n    const { dataset } = element;',
      '    const { element } = game.tooltip;\n    if ( !element ) return;\n    const { dataset } = element;'
    )
    .replace(
      '      const doc = await fromUuid(game.tooltip.element.dataset.uuid);\n      return this._onHoverContentLink(doc, { extras });',
      '      const doc = await fromUuid(element.dataset.uuid);\n      if ( game.tooltip.element !== element ) return;\n      return this._onHoverContentLink(doc, { extras });'
    )
    .replace(
      '      const doc = await fromUuid(loading.dataset.uuid);\n      if ( doc instanceof dnd5e.documents.Actor5e )',
      '      const doc = await fromUuid(loading.dataset.uuid);\n      if ( game.tooltip.element !== element ) return;\n      if ( doc instanceof dnd5e.documents.Actor5e )'
    )
    .replace(
      '  async _onHoverContentLink(doc, { extras }={}) {\n',
      '  async _onHoverContentLink(doc, { extras }={}) {\n    const { element } = game.tooltip;\n    if ( !element ) return;\n'
    )
    .replace(
      '    if ( !content ) return;\n    this.tooltip.innerHTML = content;',
      '    if ( !content || (game.tooltip.element !== element) ) return;\n    this.tooltip.innerHTML = content;'
    )
    .replace(
      '    const { tooltipDirection } = game.tooltip.element.dataset;\n    requestAnimationFrame(() => this._positionItemTooltip(tooltipDirection));',
      '    const { tooltipDirection } = element.dataset;\n    requestAnimationFrame(() => {\n      if ( game.tooltip.element === element ) this._positionItemTooltip(tooltipDirection);\n    });'
    );
}
