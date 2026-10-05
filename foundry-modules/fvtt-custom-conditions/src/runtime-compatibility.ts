/** Generic conditions retain the pinned dnd5e 5.3.3 contract on both reviewed Core builds. */
export function genericConditionsSupported(game: any): boolean {
  // Existing embeddings without runtime identity retain their test seam.
  return game?.version === undefined || (
    (game.version === '14.364' || game.version === '14.368')
    && game.system?.id === 'dnd5e'
    && game.system?.version === '5.3.3'
  );
}
