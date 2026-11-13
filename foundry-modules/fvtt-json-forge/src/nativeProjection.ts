import { FORGE_NATIVE_606_TARGET, isNativeForgeRuntimeTargetSupported, type NativeDocumentProjection } from '@fvtt-json-generator/forge-browser-runtime';

/** Construction validates the installed schema without creating or saving a world Document. */
export function nativeProjectionForGame(game: any): NativeDocumentProjection | undefined {
  if (game?.system?.id !== 'dnd5e' || !isNativeForgeRuntimeTargetSupported(game.version, game.system.version)) return undefined;
  return {
    target: FORGE_NATIVE_606_TARGET,
    runtime: { coreVersion: game.version, systemId: 'dnd5e', systemVersion: game.system.version },
    project(kind, source) {
      const Constructor = kind === 'Actor' ? game.actors?.documentClass : game.items?.documentClass;
      if (typeof Constructor !== 'function') throw new Error(`Native ${kind} Document constructor is unavailable.`);
      const input = JSON.parse(JSON.stringify(source));
      setNativeStats(input);
      const document = new Constructor(input, { strict: true });
      if (document.validate({ strict: true }) === false) throw new Error(`Native ${kind} Document validation failed.`);
      return JSON.parse(JSON.stringify(document.toObject()));
    },
  };
}

function setNativeStats(source: any): void {
  source._stats = { ...source._stats, ...FORGE_NATIVE_606_TARGET.stats };
  for (const item of source.items ?? []) setNativeStats(item);
  for (const effect of source.effects ?? []) setNativeStats(effect);
}
