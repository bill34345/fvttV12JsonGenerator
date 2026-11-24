import type { Combatant, NativeActivity, NativeCombat } from './types.ts';

interface Placeable {
  id: string;
  control(options?: { releaseOthers?: boolean }): boolean;
  release(): boolean;
}
export interface NativeSceneCanvas {
  tokens?: { controlled: Placeable[]; get(id: string): Placeable | undefined };
}

export async function useFromCombatant(
  combat: NativeCombat, combatant: Combatant, activity: NativeActivity, event: Event,
  canvas: NativeSceneCanvas,
  speaker: (data: { scene?: unknown; actor: unknown; token?: unknown }) => unknown,
  allowIncapacitated = false,
): Promise<boolean> {
  const run = async () => Boolean(await activity.use({
    event,
    ...(allowIncapacitated ? { midiOptions: { workflowOptions: { allowIncapacitated: true } } } : {}),
  }, undefined, {
    data: { speaker: speaker({ scene: combat.scene, actor: combatant.actor, token: combatant.token }) },
  }));

  const layer = canvas.tokens;
  const id = combatant.token?.id;
  if (!id || activity.getUsageToken?.()?.id === id) return run();

  const source = layer?.get(id);
  if (!layer || !source) throw new Error('The chosen combatant must be on the open scene.');
  const previous = [...layer.controlled];
  source.control({ releaseOthers: true });
  try {
    if (activity.getUsageToken?.()?.id !== id) throw new Error('The native activity selected a different source.');
    return await run();
  } finally {
    if (layer.controlled.length === 1 && layer.controlled[0] === source) {
      source.release();
      for (const token of previous) token.control({ releaseOthers: false });
    }
  }
}
