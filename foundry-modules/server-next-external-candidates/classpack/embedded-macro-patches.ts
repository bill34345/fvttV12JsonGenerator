import { createHash } from 'node:crypto';

import {
  patchClasspackMacroDocument,
  rewritePixiPointerEvent,
} from '../../../tools/foundry-ops/src/lab/classpackV14.ts';

// Only the pinned v4.3.4 archive and these exact embedded commands may be changed.
const commands = new Map<string, string>([
  ['extra-ability:8QWuVUvYP7CQ6ERH:flags.dae.macro.command', 'bc8a2d931cd29a300d9f3e494b0b71c1553032a61e357804228db6e33a901c44'],
  ['class-abilityphb:1Rh8WeV8qldOpE6r:flags.dae.macro.command', '8943dc7559660cf19e4e3fc6d9358262e19234e279c85db97a298a6e5ded7086'],
  ['class-abilityphb:zW2FJS83OyM5SIp0:flags.dae.macro.command', 'ce89894aefa9d5e7e3aa2590aa757156b38b59a8631caf8ddd50e991c112b058'],
  ['new-icon:Cnzcy1Tu7gt6xYHm:flags.dae.macro.command', '785b0aaa24f430f187437bce30929a90583d116eedbd412e4b5c3cec4ddde5f6'],
  ['new-icon:IkFYMlWnKZOskbxR:flags.dae.macro.command', 'bcc80d52ac04cd1f0299426a653e19ae08a1203d02e97ab9bc2e74f7e87ec312'],
  ['new-icon:UQuDHLKUVMyZIiTn:flags.dae.macro.command', '050306a9b286abe350d729d4254cbf4a40341d759ea91ed695d77e9d1077152a'],
  ['new-icon:WwLfBBYVgk3YTrJn:flags.dae.macro.command', '752ab9b1721838175578df3c3807119bc9ef5eaf40f0beaf76fb23d2b0eb33e9'],
  ['new-icon:ZGvthYJNmIv8sDqj:flags.dae.macro.command', 'bdbd37278ed5586e9bd915abfe48c238fa05a56b8d477caaa75c6bd32c9cb2d3'],
  ['new-icon:c4Rwx5li2TEEQPzf:flags.dae.macro.command', 'cba668f0619207359b44c26b30a6d438bad3a5750bca10ca6f3b205df9e20ee6'],
  ['new-icon:c7gxI1K0oOphAX76:flags.itemacro.macro.command', '5c31522932164e9ab6c2ea67b9d40ae665feedd81ec62d5419ca15580d000af0'],
  ['new-icon:c7gxI1K0oOphAX76:flags.itemacro.macro.data.command', 'e3ab18616668dc8db9401667377b314f4ca6cc99f8437a23747fa1c3f80b8875'],
  ['new-icon:f4HqyOlTVNlCFU77:flags.dae.macro.command', '86c93ebde00c5a47be4275aa7fab39b50914337e7c731390db661f8005d1f3fb'],
  ['new-icon:gqGklSk6EiHsGrlr:flags.dae.macro.command', '718cb3ad2fb5d5962b5789db782e92f08f5fd317f0edfad656c3aea8f76dc8cc'],
  ['new-icon:oLtyOvrWeLNEJDIE:flags.dae.macro.command', 'c9f26b9fa1a4959e09bd0ab1ac0bb7144696ab3fc928a5576b46f20abb4fbada'],
  ['new-icon:oxvIiEKCQhht8JrO:flags.dae.macro.command', '43ee07de872615c3776250acc3b0db5114d1ba3a882dd4403ba0e9fbd23f864c'],
]);
const matchedStandaloneMacro = new Map<string, { id: string; name: string }>([
  ['ce89894aefa9d5e7e3aa2590aa757156b38b59a8631caf8ddd50e991c112b058',
    { id: 'mECp9qfTdXNo09ka', name: '传送：以施法者为中心' }],
  ['cba668f0619207359b44c26b30a6d438bad3a5750bca10ca6f3b205df9e20ee6',
    { id: 'RrC3q1UPJx1zhuC8', name: '强制位移' }],
]);
const sha256 = (text: string) => createHash('sha256').update(text).digest('hex');
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;

function replaceExactly(source: string, from: string, to: string, expected: number, label: string): string {
  const count = source.split(from).length - 1;
  if (count !== expected) throw new Error(`${label}: expected ${expected}, found ${count}`);
  return source.replaceAll(from, to);
}

function patchCommand(source: string, identity: string, hash: string): string {
  const known = matchedStandaloneMacro.get(hash);
  if (known) {
    return patchClasspackMacroDocument({ _id: known.id, name: known.name, type: 'script', command: source }).document.command as string;
  }
  let result = source;
  const pointerCount = result.split('.data.getLocalPosition(canvas.app.stage)').length - 1;
  if (pointerCount) result = rewritePixiPointerEvent(result, pointerCount);
  result = result.replace(/\b(?:foundry\.utils\.)?duplicate\(/g, 'foundry.utils.deepClone(');
  result = result.replace(/await MidiQOL\.moveToken\(([^;\n]+),\s*(false|true|Boolean\(animate\))\)/g,
    (_whole, preceding: string, animate: string) => `await MidiQOL.moveToken(${preceding}, ${animate === 'false'
      ? '{ teleport: true }' : animate === 'true' ? '{ animate: true }' : '{ animate: Boolean(animate) }'})`);
  result = result.replace(/(?<![\w.])mergeObject\(/g, 'foundry.utils.mergeObject(');
  result = result.replaceAll('sourceItem.data', 'sourceItem.toObject()');

  if (identity.startsWith('extra-ability:8QWuVUvYP7CQ6ERH:')) {
    result = replaceExactly(result,
      'const roll = await tgt.actor.rollAbilitySave("wis", { chatMessage: false, fastForward: true });',
      'const [roll] = (await tgt.actor.rollSavingThrow({ ability: "wis" }, { configure: false }, { create: false })) ?? [];\n  if (!roll) throw new Error("Abjure The Extraplanar: saving throw cancelled");',
      1, identity);
  }
  if (identity.startsWith('new-icon:oLtyOvrWeLNEJDIE:')) {
    result = replaceExactly(result,
      'const roll = await actor.rollAbilitySave("con", { flavor: `Stone Save DC ${dc}` });',
      'const [roll] = (await actor.rollSavingThrow({ ability: "con" }, {}, { data: { flavor: `Stone Save DC ${dc}` } })) ?? [];\n      if (!roll) return;',
      1, identity);
  }
  if (identity.startsWith('new-icon:gqGklSk6EiHsGrlr:')) {
    result = replaceExactly(result,
      'if (typeof targetActor.rollSavingThrow === "function") save = await targetActor.rollSavingThrow("dex", { fastForward: false, chatMessage: true });\n            else if (typeof targetActor.rollAbilitySave === "function") save = await targetActor.rollAbilitySave("dex", { fastForward: false, chatMessage: true });',
      'if (typeof targetActor.rollSavingThrow === "function") save = (await targetActor.rollSavingThrow({ ability: "dex" }, {}, { create: true }))?.[0];',
      1, identity);
    result = result.replace(/^\s*itemCardId: effect\?\.origin \?\? null,\r?\n/m, '\n');
  }
  if (identity.startsWith('new-icon:oxvIiEKCQhht8JrO:')) {
    result = replaceExactly(result,
      'if (typeof actorTarget.rollSavingThrow === "function") return await actorTarget.rollSavingThrow("dex", { fastForward: false, chatMessage: true });\n      if (typeof actorTarget.rollAbilitySave === "function") return await actorTarget.rollAbilitySave("dex", { fastForward: false, chatMessage: true });',
      'if (typeof actorTarget.rollSavingThrow === "function") return (await actorTarget.rollSavingThrow({ ability: "dex" }, {}, { create: true }))?.[0] ?? null;',
      1, identity);
    result = result.replace(/^\s*itemCardId: a\.itemCardId \?\? a\.itemCardUUID \?\? null,\r?\n/m, '\n');
    result = result.replace('foundry.utils.deepClone(item) ?? {}', 'item?.toObject?.() ?? {}');
  }
  if (identity.endsWith(':flags.itemacro.macro.data.command')) {
    result = result.replaceAll('data: {', 'system: {').replaceAll('itemData.data.', 'itemData.system.');
  }
  const forbidden = [/\.rollAbilitySave\(/, /\.rollSavingThrow\("[a-z]+"/, /\.data\.getLocalPosition\(/,
    /(?<![\w.])duplicate\(/, /await MidiQOL\.moveToken\([^\n]*,\s*(?:false|true|Boolean\(animate\))\s*\)/,
    /\bitemCardId\s*:/];
  for (const pattern of forbidden) if (pattern.test(result)) throw new Error(`Unresolved legacy macro API in ${identity}: ${pattern}`);
  new AsyncFunction('args', 'actor', 'token', result);
  if (result === source) throw new Error(`Expected embedded Macro change absent: ${identity}`);
  return result;
}

export function patchEmbeddedMacroDocument(pack: string, document: Record<string, unknown>) {
  const id = String(document._id ?? '');
  const matches = [...commands].filter(([identity]) => identity.startsWith(`${pack}:${id}:`));
  if (!matches.length) return { document, reports: [] };
  const next = structuredClone(document);
  const reports: Array<{ identity: string; beforeSha256: string; afterSha256: string }> = [];
  for (const [identity, expectedHash] of matches) {
    const [knownPack, knownId, path] = identity.split(':');
    if (knownPack !== pack || knownId !== id) throw new Error(`Embedded Macro selection drift: ${identity}`);
    const segments = path.split('.');
    let owner: Record<string, unknown> = next;
    for (const segment of segments.slice(0, -1)) {
      if (!owner[segment] || typeof owner[segment] !== 'object') throw new Error(`Missing embedded Macro path: ${identity}`);
      owner = owner[segment] as Record<string, unknown>;
    }
    const command = owner.command;
    if (typeof command !== 'string' || sha256(command) !== expectedHash) throw new Error(`Embedded Macro source hash drift: ${identity}`);
    const changed = patchCommand(command, identity, expectedHash);
    owner.command = changed;
    reports.push({ identity, beforeSha256: expectedHash, afterSha256: sha256(changed) });
  }
  return { document: reports.length ? next : document, reports };
}

export const expectedEmbeddedMacroPatchCount = commands.size;
