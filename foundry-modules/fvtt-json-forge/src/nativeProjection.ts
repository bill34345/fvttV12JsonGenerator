import { FORGE_NATIVE_606_TARGET, isNativeForgeRuntimeTargetSupported, summarizeItemSpellSource, type NativeDocumentProjection } from '@fvtt-json-generator/forge-browser-runtime';

/** Construction validates the installed schema without creating or saving a world Document. */
export function nativeProjectionForGame(game: any): NativeDocumentProjection | undefined {
  if (game?.system?.id !== 'dnd5e' || !isNativeForgeRuntimeTargetSupported(game.version, game.system.version)) return undefined;
  return {
    target: FORGE_NATIVE_606_TARGET,
    runtime: { coreVersion: game.version, systemId: 'dnd5e', systemVersion: game.system.version },
    async findItemSpellUuids(matchesName) {
      const packs = Array.from<any>(game.packs ?? []).filter(pack => pack.documentName === 'Item' && pack.visible);
      const results = await Promise.allSettled(packs.map(async pack => {
        const index = await pack.getIndex();
        return (index.contents as Array<{ _id: string; name: string; type: string }>)
          .filter(entry => entry.type === 'spell' && matchesName(entry.name))
          .map(entry => `Compendium.${pack.collection}.Item.${entry._id}`);
      }));
      return results.flatMap(result => result.status === 'fulfilled' ? result.value : []);
    },
    async readItemSpell(uuid) {
      return summarizeItemSpellSource(uuid, await this.readItemSpellSource?.(uuid));
    },
    async readItemSpellSource(uuid) {
      const document = await resolveCompendiumDocument(uuid);
      return document?.uuid === uuid && document.type === 'spell' ? document.toObject() : undefined;
    },
    project(kind, source) {
      const Constructor = kind === 'Actor' ? game.actors?.documentClass : game.items?.documentClass;
      if (typeof Constructor !== 'function') throw new Error(`Native ${kind} Document constructor is unavailable.`);
      const input = JSON.parse(JSON.stringify(source));
      const construct = () => {
        setNativeStats(input);
        const document = new Constructor(input, { strict: true });
        if (document.validate({ strict: true }) === false) throw new Error(`Native ${kind} Document validation failed.`);
        return JSON.parse(JSON.stringify(document.toObject()));
      };
      const generatorFlags = input.flags?.fvttJsonGenerator;
      if (kind === 'Item' && (generatorFlags?.summonCooldown || generatorFlags?.randomSummon)) {
        const activity = Object.values<Record<string, any>>(input.system.activities).find(entry => entry.type === 'summon');
        if (generatorFlags.randomSummon) return verifySummonTable(generatorFlags.randomSummon, activity?.profiles ?? []).then(construct);
        return verifySummonActor(activity?.profiles?.[0]?.uuid).then(construct);
      }
      return construct();
    },
  };
}

async function verifySummonActor(uuid: string | undefined): Promise<void> {
  const actor = await resolveCompendiumDocument(uuid);
  if (actor?.uuid !== uuid || actor?.type !== 'npc') throw new Error('无法从当前 Foundry 合集读回召唤用的 NPC Actor。');
}

async function verifySummonTable(binding: { tableUuid: string; formula: string }, profiles: { uuid: string }[]): Promise<void> {
  const table = await resolveCompendiumDocument(binding.tableUuid);
  const rows = table?.results?.contents as Array<{ range: number[]; documentUuid: string }> | undefined;
  if (table?.uuid !== binding.tableUuid || table?.formula !== binding.formula || table?.replacement !== true
    || rows?.length !== profiles.length || profiles.some(({ uuid }, index) =>
      !rows.some(row => row.range[0] === index + 1 && row.range[1] === index + 1 && row.documentUuid === uuid))) {
    throw new Error('当前 Foundry 合集掷骰表的骰式或编号对应的 NPC 与原稿不一致。');
  }
  await Promise.all(profiles.map(({ uuid }) => verifySummonActor(uuid)));
}

function resolveCompendiumDocument(uuid: string | undefined): Promise<any> | undefined {
  const globals = globalThis as any;
  const resolve = globals.foundry?.utils?.fromUuid ?? globals.fromUuid;
  return typeof resolve === 'function' && uuid ? resolve(uuid) : undefined;
}

function setNativeStats(source: any): void {
  source._stats = { ...source._stats, ...FORGE_NATIVE_606_TARGET.stats };
  for (const item of source.items ?? []) setNativeStats(item);
  for (const effect of source.effects ?? []) setNativeStats(effect);
}
