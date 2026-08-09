/** Locked-shape inputs used by pure tests; no live Foundry documents are required. */
export const healingPotionDice = Object.freeze({ number: 2, denomination: 4, bonus: "2" });

export const explicitTierThreeAmmo = Object.freeze({
  name: "Explicit Arrow",
  type: "consumable",
  system: { quantity: 1 },
  flags: { "fvtt-house-rules": { ammo: { key: "arrow", tier: 3 } } }
});

export const retainedAdvantageTwenty = Object.freeze([
  { faces: 20, results: [{ result: 1, active: false }, { result: 20, active: true }] }
]);
