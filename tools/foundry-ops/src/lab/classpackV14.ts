import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  assertExactLabPath,
  assertExactRepoPath,
  assertInsideLabRoot,
  type FoundryLabConfig,
} from '../config';

export const CLASSPACK_MODULE_ID = 'dnd5e_classpack';
export const CLASSPACK_UPSTREAM_VERSION = '4.3.4';
export const CLASSPACK_PREVIOUS_V14_VERSION = '4.3.4-v14.1';
export const CLASSPACK_V14_VERSION = '4.3.4-v14.2';
export const CLASSPACK_RUNTIME_ENTRY = 'scripts/v14-migration.mjs';
export const CLASSPACK_MACRO_SENTINEL = 'DND5E_CLASSPACK_V14_COMPAT_4_3_4_V1';
export const CLASSPACK_PACK_IDENTITIES = [
  { name: 'rtable', path: 'packs/rtable', type: 'RollTable', system: 'dnd5e' },
  { name: 'moditems', path: 'packs/moditems', type: 'Item', system: 'dnd5e' },
  { name: 'loots', path: 'packs/loots', type: 'Item', system: 'dnd5e' },
  { name: 'extra-ability', path: 'packs/extra-ability', type: 'Item', system: 'dnd5e' },
  { name: 'class-table', path: 'packs/class-table', type: 'JournalEntry', system: 'dnd5e' },
  { name: 'classes-new', path: 'packs/classes-new', type: 'Item', system: 'dnd5e' },
  { name: 'class-abilityphb', path: 'packs/class-abilityphb', type: 'Item', system: 'dnd5e' },
  { name: 'new-icon', path: 'packs/new-icon', type: 'Item', system: 'dnd5e' },
  { name: 'racial-traits', path: 'packs/racial-traits', type: 'Item', system: 'dnd5e' },
  { name: 'races', path: 'packs/races', type: 'JournalEntry', system: 'dnd5e' },
  { name: 'itempack', path: 'packs/itempack', type: 'Item', system: 'dnd5e' },
  { name: 'spell-table', path: 'packs/spell-table', type: 'JournalEntry', system: 'dnd5e' },
  { name: 'feats-all', path: 'packs/feats-all', type: 'Item', system: 'dnd5e' },
  { name: 'subclass', path: 'packs/subclass', type: 'Item', system: 'dnd5e' },
  { name: 'BackgroundList', path: 'packs/BackgroundList', type: 'Item', system: 'dnd5e' },
  { name: 'BackgroundFeature', path: 'packs/BackgroundFeature', type: 'Item', system: 'dnd5e' },
  { name: 'monsterspack', path: 'packs/monsterspack', type: 'Actor', system: 'dnd5e' },
  { name: 'races-item', path: 'packs/races-item', type: 'Item', system: 'dnd5e' },
  { name: 'summons', path: 'packs/summons', type: 'Actor', system: 'dnd5e' },
  { name: 'monster', path: 'packs/monster', type: 'Actor', system: 'dnd5e' },
  { name: 'macro', path: 'packs/macro', type: 'Macro', system: 'dnd5e' },
] as const;

interface ClassicLevelDatabase {
  open(): Promise<void>;
  close(): Promise<void>;
  put(key: string, value: unknown): Promise<void>;
  iterator(): AsyncIterable<[string, unknown]>;
}

type ClassicLevelConstructor = new (
  path: string,
  options: Record<string, unknown>,
) => ClassicLevelDatabase;

interface ClasspackManifest {
  id?: unknown;
  version?: unknown;
  compatibility?: Record<string, unknown>;
  manifest?: unknown;
  download?: unknown;
  esmodules?: unknown;
  packs?: unknown;
  relationships?: unknown;
  flags?: Record<string, unknown>;
  [key: string]: unknown;
}

interface MacroDocument {
  _id?: unknown;
  name?: unknown;
  type?: unknown;
  command?: unknown;
  [key: string]: unknown;
}

interface MacroPatchSpec {
  name: string;
  upstreamSha256: string;
  patchedSha256: string;
  rewrite: (source: string) => string;
}

export interface ClasspackMacroReport {
  id: string;
  name: string;
  beforeSha256: string;
  afterSha256: string;
  changed: boolean;
}

export interface ClasspackV14Result {
  apply: boolean;
  changed: boolean;
  moduleRoot: string;
  manifestFile: string;
  runtimeFile: string;
  sourceVersion: string;
  targetVersion: string;
  packCount: number;
  macroCount: number;
  changedMacroCount: number;
  levelDbEntryCount: number;
  identityCount: number;
  identitySha256: string;
  macroReports: ClasspackMacroReport[];
  backupCreated: false;
}

export interface ClasspackWorldActivationResult {
  apply: boolean;
  changed: boolean;
  worldId: 'fvtt-v14-module-matrix';
  enabled: boolean;
  midiEnabled: boolean;
  enabledModuleCount: number;
  backupCreated: false;
}

export interface ClasspackMigrationMarkerResult {
  apply: boolean;
  changed: boolean;
  manifestFile: string;
  dataMigrationComplete: boolean;
  targetFoundry: '14.364';
  targetDnd5e: '5.3.3';
  targetDae: '14.0.12';
  backupCreated: false;
}

export interface ClasspackV14Paths {
  moduleRoot: string;
  manifestFile: string;
  macroPack: string;
  runtimeFile: string;
  classicLevelEntry: string;
  worldRoot: string;
  worldFile: string;
  settingsPath: string;
}

export function classpackV14Paths(config: FoundryLabConfig): ClasspackV14Paths {
  const moduleRoot = resolve(config.profiles.serverMirror.dataPath, 'Data/modules', CLASSPACK_MODULE_ID);
  const worldRoot = resolve(
    config.profiles.serverMirror.dataPath,
    'Data/worlds/fvtt-v14-module-matrix',
  );
  return {
    moduleRoot,
    manifestFile: resolve(moduleRoot, 'module.json'),
    macroPack: resolve(moduleRoot, 'packs/macro'),
    runtimeFile: resolve(moduleRoot, CLASSPACK_RUNTIME_ENTRY),
    classicLevelEntry: resolve(config.appRoot, 'node_modules/classic-level/index.js'),
    worldRoot,
    worldFile: resolve(worldRoot, 'world.json'),
    settingsPath: resolve(worldRoot, 'data/settings'),
  };
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function asRecord(value: unknown, label: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${label} must be an object`);
  }
  return value as Record<string, unknown>;
}

function replaceExact(
  source: string,
  search: string,
  replacement: string,
  expected: number,
  label: string,
): string {
  const count = source.split(search).length - 1;
  if (count !== expected) {
    throw new Error(`${label}: expected ${expected} occurrence(s), found ${count}`);
  }
  return source.replaceAll(search, replacement);
}

function replacePattern(
  source: string,
  pattern: RegExp,
  replacement: string | ((substring: string, ...args: string[]) => string),
  expected: number,
  label: string,
): string {
  const matches = [...source.matchAll(new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : `${pattern.flags}g`))];
  if (matches.length !== expected) {
    throw new Error(`${label}: expected ${expected} occurrence(s), found ${matches.length}`);
  }
  return source.replace(pattern, replacement as never);
}

export function rewriteLegacySavingThrow(
  source: string,
  expected = 1,
): string {
  const pattern = /^(\s*)const (\w+) = await ([\w.]+)\.(?:rollAbilitySave|rollSavingThrow)\("([a-z]+)", \{\s*flavor: ([\s\S]*?)\s*\}\);/gm;
  return replacePattern(
    source,
    pattern,
    (_whole, indent, variable, receiver, ability, flavor) => [
      `${indent}const [${variable}] = (await ${receiver}.rollSavingThrow(`,
      `${indent}  { ability: "${ability}" },`,
      `${indent}  {},`,
      `${indent}  { flavor: ${flavor.trim()} }`,
      `${indent})) ?? [];`,
      `${indent}if (!${variable}) return;`,
    ].join('\n'),
    expected,
    'dnd5e v14 saving throw rewrite',
  );
}

export function rewritePixiPointerEvent(source: string, expected = 1): string {
  return replaceExact(
    source,
    '.data.getLocalPosition(canvas.app.stage)',
    '.getLocalPosition(canvas.app.stage)',
    expected,
    'PIXI federated pointer event rewrite',
  );
}

export function rewriteMidiMoveTokenOptions(
  source: string,
  expectedAnimated: number,
  expectedTeleports: number,
): string {
  let rewritten = source;
  if (expectedAnimated > 0) {
    rewritten = replaceExact(
      rewritten,
      '}, Boolean(animate))',
      '}, { animate: Boolean(animate) })',
      expectedAnimated,
      'MIDI-QOL animated move options rewrite',
    );
  }
  if (expectedTeleports > 0) {
    rewritten = replacePattern(
      rewritten,
      /(MidiQOL\.moveToken\([\s\S]*?\}, )false(\);)/g,
      '$1{ teleport: true }$2',
      expectedTeleports,
      'MIDI-QOL teleport options rewrite',
    );
  }
  return rewritten;
}

export function rewriteRollEvaluation(source: string, expected: number): string {
  return replacePattern(
    source,
    /\.roll\(\{\s*async:\s*true\s*\}\)/g,
    '.evaluate()',
    expected,
    'Foundry Roll evaluation rewrite',
  );
}

function withSentinel(source: string): string {
  return `// ${CLASSPACK_MACRO_SENTINEL}\n${source}`;
}

function guardianOfFaith(source: string): string {
  let next = rewriteLegacySavingThrow(source);
  next = replaceExact(next, 'getProperty(caster,', 'foundry.utils.getProperty(caster,', 1, 'Guardian getProperty');
  next = rewriteRollEvaluation(next, 1);
  next = replacePattern(next, /^\s*itemCardId: "new",\r?\n/gm, '', 1, 'Guardian deprecated itemCardId');
  return withSentinel(next);
}

function damageOnCreate(source: string): string {
  return withSentinel(rewriteRollEvaluation(source, 1));
}

function contagion(source: string): string {
  let next = rewriteLegacySavingThrow(source);
  next = replaceExact(next, 'foundry.utils.duplicate(', 'foundry.utils.deepClone(', 2, 'Contagion deep clone');
  next = replaceExact(next, 'e.label', 'e.name', 3, 'Contagion ActiveEffect name');
  return withSentinel(next);
}

function forcedMove(source: string): string {
  let next = rewritePixiPointerEvent(source);
  next = rewriteMidiMoveTokenOptions(next, 1, 0);
  next = replaceExact(
    next,
    'uses MidiQOL.moveToken(..., true)',
    'uses MidiQOL.moveToken(..., { animate: true })',
    1,
    'Forced move documentation',
  );
  return withSentinel(next);
}

function damageSave(source: string): string {
  let next = rewriteLegacySavingThrow(source);
  next = replaceExact(
    next,
    '// 使用 dnd5e 的 actor API：rollAbilitySave("con")',
    '// dnd5e 5.3.3 uses rollSavingThrow({ ability }) and returns a Roll array.',
    1,
    'Damage save API comment',
  );
  next = replaceExact(
    next,
    '{ flavor, itemCardId: context?.itemCardId ?? null }',
    '{ flavor }',
    1,
    'Damage save deprecated itemCardId',
  );
  return withSentinel(next);
}

function indigo(source: string): string {
  let next = rewriteLegacySavingThrow(source);
  next = replaceExact(
    next,
    'const caster = active?.parent;\n  const dc = caster?.getRollData()?.attributes?.spelldc;',
    'const caster = active?.parent?.actor ?? active?.parent;\n  const dc = caster?.system?.attributes?.spell?.dc;',
    1,
    'Indigo caster and DC',
  );
  next = replaceExact(next, 'e.label', 'e.name', 6, 'Indigo ActiveEffect name');
  next = replaceExact(
    next,
    'label:"Restrained", icon:"icons/svg/locked.svg",\n          changes:[{key:"macro.StatusEffect", mode:0, value:""}],',
    'name:"Restrained", icon:"icons/svg/locked.svg", type:"base",\n          system:{changes:[{key:"macro.StatusEffect", mode:0, value:""}]},',
    1,
    'Indigo restrained effect schema',
  );
  next = replaceExact(
    next,
    'label:"Petrified", icon:"icons/svg/petrified.svg",\n            changes:[{key:"macro.StatusEffect", mode:0, value:"petrified"}],',
    'name:"Petrified", icon:"icons/svg/petrified.svg", type:"base",\n            system:{changes:[{key:"macro.StatusEffect", mode:0, value:"petrified"}]},',
    1,
    'Indigo petrified effect schema',
  );
  return withSentinel(next);
}

function targetCenteredTeleport(source: string): string {
  let next = rewritePixiPointerEvent(source);
  next = rewriteMidiMoveTokenOptions(next, 0, 1);
  next = replaceExact(
    next,
    '第三参数 false（无动画）',
    'options.teleport=true（无动画）',
    1,
    'Target teleport documentation',
  );
  return withSentinel(next);
}

function casterCenteredTeleport(source: string): string {
  let next = rewritePixiPointerEvent(source);
  next = rewriteMidiMoveTokenOptions(next, 0, 2);
  next = replaceExact(
    next,
    '第三个参数 false 表示无动画',
    'options.teleport=true 表示瞬移',
    1,
    'Caster teleport documentation',
  );
  return withSentinel(next);
}

function threateningAura(source: string): string {
  let next = rewriteLegacySavingThrow(source);
  next = replaceExact(
    next,
    'sourceActor?.system?.attributes?.spelldc?.value ?? sourceActor?.system?.attributes?.spelldc',
    'sourceActor?.system?.attributes?.spell?.dc',
    1,
    'Threatening aura spell DC',
  );
  next = replaceExact(
    next,
    'rollData?.attributes?.prof',
    'rollData?.attributes?.prof',
    1,
    'Threatening aura proficiency stable marker',
  );
  next = replaceExact(
    next,
    'originItem?.effects ?? originItem?.data?.effects ?? originItem?.system?.effects',
    'originItem?.effects',
    1,
    'Threatening aura effect collection',
  );
  next = replaceExact(
    next,
    'e?.label ?? e?.name ?? e?.data?.label ?? e?.data?.name',
    'e?.name',
    1,
    'Threatening aura effect name',
  );
  next = replaceExact(
    next,
    'panicEffect.toObject ? panicEffect.toObject() : duplicate(panicEffect)',
    'panicEffect.toObject ? panicEffect.toObject() : foundry.utils.deepClone(panicEffect)',
    1,
    'Threatening aura deep clone',
  );
  return withSentinel(next);
}

function deleteAuraEffect(source: string): string {
  return withSentinel(replaceExact(
    source,
    'e.label === "艾伐黑触手 Black Tentacles (In Aura)"',
    'e.name === "艾伐黑触手 Black Tentacles (In Aura)"',
    1,
    'Delete aura ActiveEffect name',
  ));
}

function heroesFeast(source: string): string {
  return withSentinel(replaceExact(
    source,
    'function aeName(eff) { return (eff?.name) ?? (eff?.system?.name) ?? (eff?.data?.name) ?? (eff?.label) ?? ""; }',
    'function aeName(eff) { return eff?.name ?? ""; }',
    1,
    'Heroes Feast ActiveEffect name',
  ));
}

function tentacleEffect(source: string): string {
  let next = rewriteLegacySavingThrow(source);
  next = replaceExact(next, 'getProperty(caster,', 'foundry.utils.getProperty(caster,', 1, 'Tentacle getProperty');
  next = replaceExact(
    next,
    'label: "艾伐黑触手—束缚",',
    'name: "艾伐黑触手—束缚",',
    1,
    'Tentacle effect name',
  );
  next = replaceExact(
    next,
    'system: {},\n      changes: [{',
    'system: { changes: [{',
    1,
    'Tentacle v14 effect changes start',
  );
  next = replaceExact(
    next,
    '          \"priority\": 20\n        }],\n      duration:',
    '          \"priority\": 20\n        }] },\n      duration:',
    1,
    'Tentacle v14 effect changes end',
  );
  next = replaceExact(
    next,
    'lingering.system.label',
    'lingering.name',
    1,
    'Tentacle lingering effect name',
  );
  return withSentinel(next);
}

const MACRO_PATCHES: Record<string, MacroPatchSpec> = {
  '4oLMppUOy0FycVM0': {
    name: 'GuardianofFaith',
    upstreamSha256: 'd6cd68989b1b5f9e04e2b8355cf9cfc60887e62be02a3d09363ad106079d2e63',
    patchedSha256: '937284a126971b2cb9099b2a25fa7e36318de3de8e02e2dedc54d3f74def496a',
    rewrite: guardianOfFaith,
  },
  PmUUZIVmMTyoxIEu: {
    name: '效果创建时造成伤害',
    upstreamSha256: '5d1cd4d5a6da2eae04ae408ebf17a46b94a9df89c08ad8f3810137d11f973eff',
    patchedSha256: 'da3f529b217c08808b8a33d2e32698925bceb38fbe53dbc8c19b37f6a2531686',
    rewrite: damageOnCreate,
  },
  Qp1qzaM8nZr2vD9s: {
    name: '疫病术',
    upstreamSha256: '7b48f6fcc963745f3488bd28d685f2a32a25d1ca0ebe6239896e57c1ea51c1d0',
    patchedSha256: '870b0777daefa2b6cd33cb975a5239b282aa1ea0b2c477f9961fe37cd22625ce',
    rewrite: contagion,
  },
  RrC3q1UPJx1zhuC8: {
    name: '强制位移',
    upstreamSha256: 'cba668f0619207359b44c26b30a6d438bad3a5750bca10ca6f3b205df9e20ee6',
    patchedSha256: 'dbd7caee767506b9ab8174052bf5c8006cec8aec249a4186a60e6a4238964026',
    rewrite: forcedMove,
  },
  TieKALdNaRKh4Ld4: {
    name: '效果创建时执行豁免',
    upstreamSha256: '7a061ff873cbb250d029a6c97c82f22eb76e8fe2d5fc0bf3161ca8722cf7ad24',
    patchedSha256: '0792e6a9e5676d1050cf97cc520d10c9d2254d46083184a212d3f2c3e810649a',
    rewrite: damageSave,
  },
  VzQBmOHGGafblr7q: {
    name: 'indigo',
    upstreamSha256: 'cb26faaf0efa690f0a744efa3df4d6609c63cd66c7c381e2cce1e2415024b543',
    patchedSha256: 'bdc0ed896583b879dba6a82df8d87bc46c2c96379d3b69cf728e851e534d4ce6',
    rewrite: indigo,
  },
  hnRz1QGdFXokdCHs: {
    name: '传送：以目标为中心',
    upstreamSha256: '92f4a58a934ca9744f0c22e6deb0096104ea2e2d10685826e5d889c215e0213f',
    patchedSha256: '171cbcedeb92e492c9f4169cbf963d578c3b6b378c58b5dcdae4a9a352835e28',
    rewrite: targetCenteredTeleport,
  },
  mECp9qfTdXNo09ka: {
    name: '传送：以施法者为中心',
    upstreamSha256: 'ce89894aefa9d5e7e3aa2590aa757156b38b59a8631caf8ddd50e991c112b058',
    patchedSha256: '1865bd3f0aa3adb5cd5a64ea393429bcf56df827ece2862b8660ed1cca5b3a07',
    rewrite: casterCenteredTeleport,
  },
  nT9dxEYFICOCdoB2: {
    name: '威胁灵光',
    upstreamSha256: 'e14741d050fb51c5307eaa8d12e91dbb22e38c376fd8a55bf90084510f636818',
    patchedSha256: '04670995f1a15217585a7f7b2a4ad2aae664bba40c8742d2e5b9b6741651f0d4',
    rewrite: threateningAura,
  },
  q0ytDPXNkJoqabx5: {
    name: 'DeleteAuraEffect',
    upstreamSha256: '741b042dff2eba08ed7b76b31b89f4751f3d883dbb294ca81604af8a0338cf8a',
    patchedSha256: '0e18b46c9b3496faabe7f94f1610220f8a0f1a1699b2ff179796d3fb12a7de61',
    rewrite: deleteAuraEffect,
  },
  xYJgZRUoEBERP0lU: {
    name: 'HF_DAE_DBG',
    upstreamSha256: '2edc3df20cd665ab8adcf0d751d71266c18897cb2b1e485156828e7f314469b3',
    patchedSha256: '651c615616f397f5ba63228f510ef27cc2fddb22f61d34a79647d30876f0b125',
    rewrite: heroesFeast,
  },
  zgt54TRIjGsZaOk9: {
    name: 'applyTentacleEffect',
    upstreamSha256: 'd88ce4cdbb0c0a004dad4998846b8964198eedd2c34e7bc1a721fa815e7a19a7',
    patchedSha256: 'c23607c06b64a4a710bec02a80f952d45a9dda31f104a0f89798ea83628616ae',
    rewrite: tentacleEffect,
  },
};

const FORBIDDEN_MACRO_PATTERNS: Array<[RegExp, string]> = [
  [/\.rollAbilitySave\(/, 'removed rollAbilitySave API'],
  [/\.rollSavingThrow\("[a-z]+"/, 'legacy positional rollSavingThrow API'],
  [/\.data\.getLocalPosition\(/, 'legacy PIXI interaction event data'],
  [/foundry\.utils\.duplicate\(/, 'removed duplicate helper'],
  [/(?<![\w.])duplicate\(/, 'removed global duplicate helper'],
  [/MidiQOL\.moveToken\([\s\S]*?,\s*(?:false|true|Boolean\(animate\))\s*\)/, 'legacy positional MIDI move options'],
  [/\bitemCardId\s*:/, 'deprecated MIDI DamageOnlyWorkflow itemCardId'],
];

export function assertCompatibleMacroCommand(command: string, name: string): void {
  for (const [pattern, label] of FORBIDDEN_MACRO_PATTERNS) {
    if (pattern.test(command)) throw new Error(`Macro "${name}" still uses ${label}`);
  }
  try {
    Function('args', 'actor', 'token', command);
  } catch (error) {
    throw new Error(`Macro "${name}" is not valid JavaScript: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export function patchClasspackMacroDocument(document: MacroDocument): {
  document: MacroDocument;
  report: ClasspackMacroReport;
} {
  const id = String(document._id ?? '');
  const name = String(document.name ?? '');
  const command = String(document.command ?? '');
  const spec = MACRO_PATCHES[id];
  if (!spec) throw new Error(`Unexpected classpack Macro id: ${id || '<missing>'}`);
  if (name !== spec.name || document.type !== 'script') {
    throw new Error(`Unexpected classpack Macro identity for ${id}: ${name} (${String(document.type)})`);
  }

  const beforeSha256 = sha256(command);
  let next = command;
  if (beforeSha256 === spec.upstreamSha256) {
    next = spec.rewrite(command);
    const generatedHash = sha256(next);
    if (generatedHash !== spec.patchedSha256) {
      throw new Error(`Generated command hash drift for Macro "${name}": ${generatedHash}`);
    }
  } else if (beforeSha256 !== spec.patchedSha256) {
    throw new Error(`Unexpected upstream command hash for Macro "${name}": ${beforeSha256}`);
  }
  assertCompatibleMacroCommand(next, name);

  return {
    document: next === command ? document : { ...document, command: next },
    report: {
      id,
      name,
      beforeSha256,
      afterSha256: sha256(next),
      changed: next !== command,
    },
  };
}

export function patchClasspackManifest(manifest: ClasspackManifest): ClasspackManifest {
  if (manifest.id !== CLASSPACK_MODULE_ID) {
    throw new Error(`Expected module id ${CLASSPACK_MODULE_ID}, found ${String(manifest.id)}`);
  }
  if (![CLASSPACK_UPSTREAM_VERSION, CLASSPACK_PREVIOUS_V14_VERSION, CLASSPACK_V14_VERSION]
    .includes(String(manifest.version))) {
    throw new Error(
      `Expected classpack ${CLASSPACK_UPSTREAM_VERSION}, ${CLASSPACK_PREVIOUS_V14_VERSION},`
      + ` or ${CLASSPACK_V14_VERSION}, found ${String(manifest.version)}`,
    );
  }
  if (!Array.isArray(manifest.packs) || manifest.packs.length !== CLASSPACK_PACK_IDENTITIES.length) {
    throw new Error(
      `Expected exactly ${CLASSPACK_PACK_IDENTITIES.length} classpack packs,`
      + ` found ${Array.isArray(manifest.packs) ? manifest.packs.length : '<invalid>'}`,
    );
  }
  const packIdentities = manifest.packs.map((entry, index) => {
    const pack = asRecord(entry, `packs[${index}]`);
    return {
      name: String(pack.name ?? ''),
      path: String(pack.path ?? ''),
      type: String(pack.type ?? ''),
      system: String(pack.system ?? ''),
    };
  });
  if (JSON.stringify(packIdentities) !== JSON.stringify(CLASSPACK_PACK_IDENTITIES)) {
    throw new Error('Classpack pack identity surface does not match upstream 4.3.4');
  }

  const esmodules = Array.isArray(manifest.esmodules)
    ? manifest.esmodules.filter((entry): entry is string => typeof entry === 'string')
    : [];
  const relationships = structuredClone(asRecord(manifest.relationships, 'module relationships'));
  if (!Array.isArray(relationships.systems)) {
    throw new Error('Classpack manifest must declare its dnd5e system relationship');
  }
  const systemMatches = relationships.systems
    .map((entry, index) => asRecord(entry, `relationships.systems[${index}]`))
    .filter(entry => entry.id === 'dnd5e');
  if (systemMatches.length !== 1 || systemMatches[0]?.type !== 'system') {
    throw new Error('Classpack manifest must declare exactly one dnd5e system relationship');
  }
  relationships.systems = relationships.systems.map((entry, index) => {
    const relation = asRecord(entry, `relationships.systems[${index}]`);
    return relation.id === 'dnd5e'
      ? {
        ...relation,
        compatibility: { minimum: '5.3.3', verified: '5.3.3', maximum: '5.3.3' },
      }
      : relation;
  });
  const recommendations = Array.isArray(relationships.recommends)
    ? relationships.recommends.map((entry, index) => asRecord(entry, `relationships.recommends[${index}]`))
    : [];
  for (const [id, version] of [['midi-qol', '14.0.11'], ['dae', '14.0.12']] as const) {
    const matches = recommendations.filter(entry => entry.id === id);
    if (matches.length > 1 || (matches[0] && matches[0].type !== 'module')) {
      throw new Error(`Classpack manifest has an invalid ${id} recommendation`);
    }
    const compatibility = { minimum: version, verified: version, maximum: version };
    if (matches.length === 1) {
      const matchIndex = recommendations.indexOf(matches[0]!);
      recommendations[matchIndex] = { ...matches[0], compatibility };
    } else {
      recommendations.push({ id, type: 'module', compatibility });
    }
  }
  relationships.recommends = recommendations;
  const flags = structuredClone(manifest.flags ?? {});
  const existingClasspackV14 = flags.classpackV14 && typeof flags.classpackV14 === 'object'
    && !Array.isArray(flags.classpackV14)
    ? flags.classpackV14 as Record<string, unknown>
    : {};
  flags.classpackV14 = {
    upstreamVersion: CLASSPACK_UPSTREAM_VERSION,
    targetFoundry: '14.364',
    targetDnd5e: '5.3.3',
    targetDae: '14.0.12',
    migration: 1,
    dataMigrationComplete: existingClasspackV14.dataMigrationComplete === true,
    recovery: 'disable-and-reinstall-upstream',
    backupCreated: false,
  };

  const next: ClasspackManifest = {
    ...manifest,
    version: CLASSPACK_V14_VERSION,
    compatibility: {
      minimum: '14.364',
      verified: '14.364',
      maximum: '14.364',
    },
    relationships,
    esmodules: [...new Set([...esmodules, CLASSPACK_RUNTIME_ENTRY])],
    flags,
  };
  delete next.manifest;
  delete next.download;
  return next;
}

export async function markClasspackV14MigrationComplete(
  config: FoundryLabConfig,
  options: { apply: boolean },
): Promise<ClasspackMigrationMarkerResult> {
  const { moduleRoot, manifestFile } = classpackV14Paths(config);
  assertExactLabPath(config, moduleRoot, [
    'data', 'server-mirror', 'Data', 'modules', CLASSPACK_MODULE_ID,
  ], 'Classpack module root');
  assertExactLabPath(config, manifestFile, [
    'data', 'server-mirror', 'Data', 'modules', CLASSPACK_MODULE_ID, 'module.json',
  ], 'Classpack manifest');
  const manifest = patchClasspackManifest(
    JSON.parse(await readFile(manifestFile, 'utf8')) as ClasspackManifest,
  );
  const flags = asRecord(manifest.flags ?? {}, 'module flags');
  const classpackFlags = asRecord(flags.classpackV14, 'flags.classpackV14');
  const changed = classpackFlags.dataMigrationComplete !== true;
  classpackFlags.dataMigrationComplete = true;
  flags.classpackV14 = classpackFlags;
  manifest.flags = flags;
  if (options.apply && changed) {
    const temporary = resolve(dirname(manifestFile), '.module.json.codex.tmp');
    assertInsideLabRoot(config, temporary);
    await writeFile(temporary, stableJson(manifest), 'utf8');
    await rename(temporary, manifestFile);
  }
  return {
    apply: options.apply,
    changed,
    manifestFile,
    dataMigrationComplete: true,
    targetFoundry: '14.364',
    targetDnd5e: '5.3.3',
    targetDae: '14.0.12',
    backupCreated: false,
  };
}

async function loadClassicLevel(config: FoundryLabConfig): Promise<ClassicLevelConstructor> {
  const entry = classpackV14Paths(config).classicLevelEntry;
  assertExactLabPath(config, entry, [
    'app', '14.364', 'node_modules', 'classic-level', 'index.js',
  ], 'Foundry classic-level entry');
  const imported = await import(pathToFileURL(entry).href) as { ClassicLevel?: ClassicLevelConstructor };
  if (!imported.ClassicLevel) throw new Error(`ClassicLevel is unavailable at ${entry}`);
  return imported.ClassicLevel;
}

async function readMacroDocuments(
  ClassicLevel: ClassicLevelConstructor,
  macroPack: string,
  readOnly: boolean,
): Promise<{ database: ClassicLevelDatabase; entries: Array<{ key: string; value: MacroDocument }> }> {
  const database = new ClassicLevel(macroPack, {
    createIfMissing: false,
    keyEncoding: 'utf8',
    valueEncoding: 'json',
    ...(readOnly ? { readOnly: true } : {}),
  });
  await database.open();
  const entries: Array<{ key: string; value: MacroDocument }> = [];
  for await (const [key, raw] of database.iterator()) {
    if (!key.startsWith('!macros!')) continue;
    entries.push({ key, value: asRecord(raw, `Macro record ${key}`) as MacroDocument });
  }
  entries.sort((left, right) => left.key.localeCompare(right.key));
  return { database, entries };
}

async function auditPackIdentities(
  config: FoundryLabConfig,
  ClassicLevel: ClassicLevelConstructor,
  moduleRoot: string,
  manifest: ClasspackManifest,
): Promise<{ levelDbEntryCount: number; identityCount: number; identitySha256: string }> {
  const identities: string[] = [];
  let levelDbEntryCount = 0;
  for (const [index, rawPack] of (manifest.packs as unknown[]).entries()) {
    const pack = asRecord(rawPack, `packs[${index}]`);
    const name = String(pack.name ?? '');
    const relativePath = String(pack.path ?? '');
    if (!name || !relativePath.startsWith('packs/')) {
      throw new Error(`Invalid classpack path for pack ${name || index}: ${relativePath}`);
    }
    const packPath = resolve(moduleRoot, relativePath);
    assertInsideLabRoot(config, packPath);
    const database = new ClassicLevel(packPath, {
      createIfMissing: false,
      keyEncoding: 'utf8',
      valueEncoding: 'json',
      readOnly: true,
    });
    await database.open();
    try {
      for await (const [key, rawValue] of database.iterator()) {
        levelDbEntryCount += 1;
        const value = asRecord(rawValue, `${name} record ${key}`);
        const id = typeof value._id === 'string' ? value._id : '';
        identities.push(`${name}\u0000${key}\u0000${id}`);
      }
    } finally {
      await database.close();
    }
  }
  identities.sort();
  return {
    levelDbEntryCount,
    identityCount: identities.length,
    identitySha256: sha256(identities.join('\n')),
  };
}

function stableJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

export function normalizeClasspackRuntimeSource(source: string): string {
  return source.replace(/\r\n/g, '\n');
}

export function setClasspackActivation(
  configuration: Record<string, boolean>,
  enabled: boolean | undefined,
  midiEnabled?: boolean,
): Record<string, boolean> {
  return {
    ...configuration,
    ...(enabled === undefined ? {} : { [CLASSPACK_MODULE_ID]: enabled }),
    ...(midiEnabled === undefined ? {} : { 'midi-qol': midiEnabled }),
  };
}

export async function setClasspackMatrixActivation(
  config: FoundryLabConfig,
  options: { apply: boolean; enabled?: boolean; midiEnabled?: boolean },
): Promise<ClasspackWorldActivationResult> {
  if (options.enabled === undefined && options.midiEnabled === undefined) {
    throw new Error('Classpack matrix activation requires at least one requested module state');
  }
  const worldId = 'fvtt-v14-module-matrix' as const;
  const { worldRoot, worldFile, settingsPath } = classpackV14Paths(config);
  assertExactLabPath(config, worldRoot, [
    'data', 'server-mirror', 'Data', 'worlds', worldId,
  ], 'Classpack disposable world root');
  assertExactLabPath(config, settingsPath, [
    'data', 'server-mirror', 'Data', 'worlds', worldId, 'data', 'settings',
  ], 'Classpack disposable world settings');
  const world = JSON.parse(await readFile(worldFile, 'utf8')) as Record<string, unknown>;
  if (world.id !== worldId || world.system !== 'dnd5e'
    || world.coreVersion !== '14.364' || world.systemVersion !== '5.3.3') {
    throw new Error('Classpack activation is restricted to the exact Foundry 14.364 / dnd5e 5.3.3 matrix world');
  }

  const ClassicLevel = await loadClassicLevel(config);
  const database = new ClassicLevel(settingsPath, {
    createIfMissing: false,
    keyEncoding: 'utf8',
    valueEncoding: 'json',
    ...(!options.apply ? { readOnly: true } : {}),
  });
  await database.open();
  try {
    let setting: { key: string; value: Record<string, unknown> } | undefined;
    for await (const [key, raw] of database.iterator()) {
      const value = asRecord(raw, `World setting ${key}`);
      if (value.key === 'core.moduleConfiguration') {
        setting = { key, value };
        break;
      }
    }
    if (!setting || typeof setting.value.value !== 'string') {
      throw new Error('Disposable matrix world has no core.moduleConfiguration setting');
    }
    const before = JSON.parse(setting.value.value) as Record<string, boolean>;
    const after = setClasspackActivation(before, options.enabled, options.midiEnabled);
    const changed = before[CLASSPACK_MODULE_ID] !== after[CLASSPACK_MODULE_ID]
      || before['midi-qol'] !== after['midi-qol'];
    if (options.apply && changed) {
      const stats = asRecord(setting.value._stats ?? {}, 'core.moduleConfiguration _stats');
      await database.put(setting.key, {
        ...setting.value,
        value: JSON.stringify(after),
        _stats: { ...stats, modifiedTime: Date.now() },
      });
    }
    return {
      apply: options.apply,
      changed,
      worldId,
      enabled: after[CLASSPACK_MODULE_ID] === true,
      midiEnabled: after['midi-qol'] === true,
      enabledModuleCount: Object.values(after).filter(Boolean).length,
      backupCreated: false,
    };
  } finally {
    await database.close();
  }
}

export async function prepareClasspackV14(
  config: FoundryLabConfig,
  options: { apply: boolean },
): Promise<ClasspackV14Result> {
  const { moduleRoot, manifestFile, macroPack, runtimeFile } = classpackV14Paths(config);
  const runtimeSourceFile = fileURLToPath(new URL('./assets/dnd5e-classpack-v14.mjs', import.meta.url));
  assertExactLabPath(config, moduleRoot, [
    'data', 'server-mirror', 'Data', 'modules', CLASSPACK_MODULE_ID,
  ], 'Classpack module root');
  assertExactLabPath(config, manifestFile, [
    'data', 'server-mirror', 'Data', 'modules', CLASSPACK_MODULE_ID, 'module.json',
  ], 'Classpack manifest');
  assertExactLabPath(config, runtimeFile, [
    'data', 'server-mirror', 'Data', 'modules', CLASSPACK_MODULE_ID,
    ...CLASSPACK_RUNTIME_ENTRY.split('/'),
  ], 'Classpack runtime entry');
  assertInsideLabRoot(config, macroPack);
  assertExactRepoPath(config, runtimeSourceFile, [
    'tools', 'foundry-ops', 'src', 'lab', 'assets', 'dnd5e-classpack-v14.mjs',
  ], 'Classpack runtime source');

  const manifest = JSON.parse(await readFile(manifestFile, 'utf8')) as ClasspackManifest;
  const nextManifest = patchClasspackManifest(manifest);
  const runtimeSource = normalizeClasspackRuntimeSource(
    await readFile(runtimeSourceFile, 'utf8'),
  );
  if (!runtimeSource.includes('DND5E_CLASSPACK_V14_RUNTIME_1')) {
    throw new Error('Classpack runtime source is missing its version sentinel');
  }

  const ClassicLevel = await loadClassicLevel(config);
  const beforeIdentity = await auditPackIdentities(config, ClassicLevel, moduleRoot, manifest);
  const initial = await readMacroDocuments(ClassicLevel, macroPack, !options.apply);
  const macroReports: ClasspackMacroReport[] = [];
  const updates: Array<{ key: string; value: MacroDocument }> = [];
  try {
    if (initial.entries.length !== 12) {
      throw new Error(`Expected exactly 12 classpack macros, found ${initial.entries.length}`);
    }
    for (const entry of initial.entries) {
      const patched = patchClasspackMacroDocument(entry.value);
      macroReports.push(patched.report);
      if (patched.report.changed) updates.push({ key: entry.key, value: patched.document });
    }
    if (options.apply) {
      for (const update of updates) await initial.database.put(update.key, update.value);
    }
  } finally {
    await initial.database.close();
  }

  const manifestChanged = stableJson(manifest) !== stableJson(nextManifest);
  const runtimeChanged = await readFile(runtimeFile, 'utf8').catch(() => '') !== runtimeSource;
  if (options.apply) {
    const runtimeTemporary = resolve(dirname(runtimeFile), '.v14-migration.mjs.codex.tmp');
    const manifestTemporary = resolve(dirname(manifestFile), '.module.json.codex.tmp');
    assertInsideLabRoot(config, runtimeTemporary);
    assertInsideLabRoot(config, manifestTemporary);
    await mkdir(dirname(runtimeFile), { recursive: true });
    await writeFile(runtimeTemporary, runtimeSource, 'utf8');
    await writeFile(manifestTemporary, stableJson(nextManifest), 'utf8');
    await rename(runtimeTemporary, runtimeFile);
    await rename(manifestTemporary, manifestFile);

    const verification = await readMacroDocuments(ClassicLevel, macroPack, true);
    try {
      for (const entry of verification.entries) patchClasspackMacroDocument(entry.value);
    } finally {
      await verification.database.close();
    }
    patchClasspackManifest(JSON.parse(await readFile(manifestFile, 'utf8')) as ClasspackManifest);
    if ((await readFile(runtimeFile, 'utf8')) !== runtimeSource) {
      throw new Error('Installed classpack runtime entry does not match the tracked source');
    }
    const afterIdentity = await auditPackIdentities(config, ClassicLevel, moduleRoot, nextManifest);
    if (JSON.stringify(afterIdentity) !== JSON.stringify(beforeIdentity)) {
      throw new Error(`Classpack LevelDB identity changed during preparation: ${JSON.stringify({ beforeIdentity, afterIdentity })}`);
    }
  }

  return {
    apply: options.apply,
    changed: manifestChanged || runtimeChanged || updates.length > 0,
    moduleRoot,
    manifestFile,
    runtimeFile,
    sourceVersion: String(manifest.version),
    targetVersion: CLASSPACK_V14_VERSION,
    packCount: 21,
    macroCount: macroReports.length,
    changedMacroCount: updates.length,
    ...beforeIdentity,
    macroReports,
    backupCreated: false,
  };
}
