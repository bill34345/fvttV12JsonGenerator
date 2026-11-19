import { sha256 } from '@fvtt-json-generator/contracts/hash';
import { verifySavedSpellArtifact, type SpellArtifact } from '@fvtt-json-generator/forge-browser-runtime/spell';
import { ForgeTemporaryItemCleanupError, type ForgeItemGameLike, type ForgeItemLike } from './itemRuntime';
import { assertExactRuntime, assertGm, MODULE_ID } from './runtime';
import type { IconChoice } from './itemIcon';
import { ensureForgeAsset } from './forgeAsset';
import { resolveForgeWorldFolder } from './worldFolder';

export type ForgeSpellDocument = ForgeItemLike & { sheet?: { render(force: boolean): unknown } };

export async function createVerifiedForgeSpell(game: ForgeItemGameLike, artifact: SpellArtifact, icon: IconChoice, foundry: unknown) {
  assertGm(game);
  assertExactRuntime(game);
  if (artifact.verification.status === 'failed') throw new Error('法术预览未通过检查。');

  const identifier = artifact.source.identifier;
  const id = sha256('forge-spell:' + identifier).slice(0, 16);
  if (icon.png && icon.path !== `fvtt-json-forge/items/${sha256(icon.png)}.png`) throw new Error('法术图标与预览不一致。');
  const selected = { ...artifact, item: { ...artifact.item, img: icon.path } };
  const hash = sha256(JSON.stringify(selected.item));
  const documentClass = game.items?.documentClass;
  if (!documentClass?.create) throw new Error('Foundry 当前无法创建世界法术。');

  const existing = game.items?.get?.(id) ?? game.items?.contents?.find(item => item.id === id);
  if (existing) return { item: verifyWorldSpell(existing, selected, id, hash), status: 'existing' as const };
  const folder = await resolveForgeWorldFolder(game, 'Spell');
  if (icon.png) await ensureForgeAsset(foundry, icon.path, icon.png, 'image/png', () => {
    assertGm(game);
    assertExactRuntime(game);
  });

  const item = await documentClass.create({
    ...structuredClone(selected.item),
    folder,
    _id: id,
    flags: { [MODULE_ID]: { spellArtifactHash: hash } },
  }, { keepId: true, renderSheet: false });
  if (!item) throw new Error('Foundry 未返回新建的法术。');
  try {
    return { item: verifyWorldSpell(item, selected, id, hash), status: 'created' as const };
  } catch (error) {
    try { await item.delete(); }
    catch (cause) { throw new ForgeTemporaryItemCleanupError(item.uuid ?? id, cause); }
    throw error;
  }
}

function verifyWorldSpell(item: ForgeSpellDocument, artifact: SpellArtifact, id: string, hash: string): ForgeSpellDocument {
  // Match the preview's JSON boundary: a saved native model can own unset optional fields.
  const source = JSON.parse(JSON.stringify(item.toObject())) as { img?: string; flags?: Record<string, { spellArtifactHash?: string }> };
  if (item.id !== id || item.uuid !== 'Item.' + id || source.flags?.[MODULE_ID]?.spellArtifactHash !== hash) {
    throw new Error('此法术标识已被其他内容占用，或保存后的身份与预览不一致。');
  }
  if (source.img !== artifact.item.img) throw new Error('法术保存后的图标与预览不一致。');
  const findings = verifySavedSpellArtifact(artifact, source).diagnostics.filter(entry => entry.severity === 'error');
  if (findings.length) throw new Error('法术保存后与预览不一致：' + findings.map(entry => entry.path).join('、'));
  return item;
}
