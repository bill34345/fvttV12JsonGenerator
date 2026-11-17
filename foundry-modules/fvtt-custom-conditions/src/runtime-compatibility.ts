import { isVersionInMajor } from '@fvtt-json-generator/contracts/version-admission';

export function isNative6SystemVersion(version: unknown): boolean {
  return version === '6.0.5' || isVersionInMajor(version, '6.0.6');
}

export function native6ConditionsSupported(game: any): boolean {
  return game?.system?.id === 'dnd5e' && (
    (game.version === '14.368' && game.system.version === '6.0.5')
    || (isVersionInMajor(game.version, '14.368') && isVersionInMajor(game.system.version, '6.0.6'))
  );
}

export function genericConditionsSupported(game: any): boolean {
  // Existing embeddings without runtime identity retain their test seam.
  return game?.version === undefined || (
    game.system?.id === 'dnd5e'
    && (
      ((game.version === '14.364' || game.version === '14.368') && game.system.version === '5.3.3')
      || native6ConditionsSupported(game)
    )
  );
}
