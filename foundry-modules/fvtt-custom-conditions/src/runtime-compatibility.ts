/** Exact reviewed pairs; Core 14.368 alone does not select native dnd5e 6 effects. */
export function genericConditionsSupported(game: any): boolean {
  // Existing embeddings without runtime identity retain their test seam.
  return game?.version === undefined || (
    game.system?.id === 'dnd5e'
    && (
      ((game.version === '14.364' || game.version === '14.368') && game.system.version === '5.3.3')
      || (game.version === '14.368' && game.system.version === '6.0.5')
    )
  );
}
