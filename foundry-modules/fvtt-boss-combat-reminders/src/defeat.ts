import { itemTrigger } from './health.ts';
import { activityFacts } from './activity-facts.ts';
import { atBloodiedThreshold, bloodiedThreshold, isActorBloodied } from './bloodied-status.ts';
import { MODULE_ID } from './types.ts';
import type { Choice, Combatant, NativeActivity, NativeActor, NativeCombat, NativeEffect, NativeItem, Platform, RemindersUI } from './types.ts';

const flag = 'pendingDefeat';
type Stage = 'zero' | 'death';
interface Pending {
  combatId: string;
  stage: Stage;
  bloodiedAtZero?: string[];
}
interface Ability {
  id: string;
  item: NativeItem;
  activity?: NativeActivity;
  stage: Stage;
  bloodiedAtZero?: { once: boolean; split: boolean };
}
interface HpChange {
  system?: { attributes?: { hp?: { value?: number } } };
  flags?: Record<string, Record<string, unknown>>;
}

export class DefeatReminders {
  #resolving = new Set<string>();
  #used = new Map<string, Set<string>>();

  constructor(
    private readonly platform: Platform,
    private readonly ui: RemindersUI,
    private readonly defeatedStatus: () => string,
    private readonly complete: (actor: NativeActor, entries: Combatant[]) => Promise<void>,
    private readonly automatic?: (item: NativeItem) => (() => Promise<unknown>) | undefined,
  ) {}

  pending(actor: NativeActor): Pending | undefined {
    const value = actor.getFlag(MODULE_ID, flag) as Pending | null | undefined;
    if (value?.combatId === this.platform.combat()?.id && actor.system.attributes?.hp?.value === 0) return value ?? undefined;
  }

  anticipating(actor: NativeActor, value: number | undefined): boolean {
    return value === 0 && Boolean(this.pending(actor) || this.#start(actor));
  }

  prepare(actor: NativeActor, changes: HpChange): void {
    const value = changes.system?.attributes?.hp?.value;
    if (value === undefined) return;
    const state = value === 0 ? this.#start(actor) : this.pending(actor) ? null : undefined;
    if (state === undefined) return;
    changes.flags ??= {};
    changes.flags[MODULE_ID] ??= {};
    changes.flags[MODULE_ID][flag] = state;
  }

  observe(actor: NativeActor): void {
    if (!this.platform.isActiveGM()) return;
    if (this.pending(actor)) this.show(actor);
    else {
      this.#used.delete(actor.uuid);
      this.ui.remove(cardId(actor));
    }
  }

  showPending(): void {
    if (!this.platform.isActiveGM()) return;
    for (const { actor } of this.platform.combat()?.combatants ?? []) if (actor && this.pending(actor)) this.show(actor);
  }

  allowEnd(combat: NativeCombat, warn: (message: string) => void): boolean {
    if (this.platform.combat()?.id !== combat.id) return true;
    const names = [...new Set([...combat.combatants].flatMap(entry => entry.actor && this.pending(entry.actor) ? [entry.name] : []))];
    if (!names.length) return true;
    warn(this.platform.format('Defeat.EndBlocked', { names: names.join(', ') }));
    this.showPending();
    return false;
  }

  holdStatus(effect: NativeEffect, data?: { statuses?: string[] }): boolean {
    const actor = effectActor(effect);
    if (!actor || !this.pending(actor)) return false;
    const statuses = data?.statuses ?? effect.statuses ?? [];
    return [...statuses].some(status => status === this.defeatedStatus() || status === 'dead' || status === 'unconscious');
  }

  show(actor: NativeActor): void {
    const state = this.pending(actor);
    const combat = this.platform.combat();
    const entry = combat && entriesFor(combat, actor)[0];
    if (!state || !combat || !entry) return;
    const abilities = defeatAbilities(actor).filter(ability =>
      !ability.bloodiedAtZero || state.bloodiedAtZero?.includes(ability.id));
    if (state.stage === 'zero') {
      const seen = firstBloodied(entry);
      const previous = seen.size;
      for (const ability of abilities) if (ability.bloodiedAtZero?.once) seen.add(ability.id);
      if (seen.size !== previous) void entry.setFlag?.(MODULE_ID, 'firstBloodied', [...seen]).catch(console.error);
    }
    const choices = abilities.filter(ability => ability.stage === state.stage).flatMap(ability => this.#choices(combat, entry, actor, ability));
    if (state.stage === 'zero') {
      choices.push({
        id: 'defeat-alive',
        label: this.platform.format('Defeat.Restore'),
        run: async () => {
          await actor.sheet?.render({ force: true });
          this.platform.notify?.(this.platform.format('Defeat.RestoreHint'));
          return false;
        },
      });
    }
    const later = state.stage === 'zero' && abilities.some(ability => ability.stage === 'death');
    choices.push({
      id: later ? 'defeat-confirm' : 'defeat-finish',
      label: this.platform.format(later ? 'Defeat.Confirm' : state.stage === 'zero' ? 'Defeat.ConfirmFinish' : 'Defeat.Finish'),
      run: async () => {
        if (!this.platform.isActiveGM() || this.pending(actor)?.stage !== state.stage) return false;
        if (later) {
          await actor.setFlag(MODULE_ID, flag, { ...state, stage: 'death' });
          this.show(actor);
        } else await this.#finish(actor, combat);
        return false;
      },
    });
    if (state.stage === 'death') choices.push({
      id: 'defeat-skip',
      label: this.platform.format('Defeat.Skip'),
      run: async () => {
        await this.#finish(actor, combat);
        return false;
      },
    });

    this.ui.show({
      id: cardId(actor),
      kind: 'death',
      title: this.platform.format(state.stage === 'zero' ? 'Defeat.Zero' : 'Health.Death'),
      timing: this.platform.format('Defeat.Pending'),
      persistent: true,
      groups: [{ id: entry.id, label: entry.name, portrait: actor.img, choices }],
    });
  }

  #start(actor: NativeActor): Pending | undefined {
    const combat = this.platform.combat();
    const hp = actor.system.attributes?.hp;
    if (!combat?.started || !actor.system.isNPC || (hp?.value ?? 0) <= 0 || actor.getFlag(MODULE_ID, 'disabled')) return;
    const entry = entriesFor(combat, actor).find(option => !option.isDefeated && !option.defeated);
    if (!entry) return;
    const atZero = (hp?.effectiveMax ?? hp?.max ?? 0) > 0
      && !isActorBloodied(actor) && !atBloodiedThreshold(hp, bloodiedThreshold(actor));
    const seen = firstBloodied(entry);
    const abilities = defeatAbilities(actor).filter(ability => !ability.bloodiedAtZero
      || (atZero && (!ability.bloodiedAtZero.once || !seen.has(ability.id))));
    if (!abilities.length) return;
    const bloodiedAtZero = abilities.filter(ability => ability.bloodiedAtZero).map(ability => ability.id);
    return {
      combatId: combat.id, stage: abilities.some(ability => ability.stage === 'zero') ? 'zero' : 'death',
      ...(bloodiedAtZero.length ? { bloodiedAtZero } : {}),
    };
  }

  #choices(combat: NativeCombat, entry: Combatant, actor: NativeActor, { id, item, activity, stage, bloodiedAtZero }: Ability): Choice[] {
    const automatic = stage === 'death' ? this.automatic?.(item) : undefined;
    const used = this.#used.get(actor.uuid)?.has(item.id);
    const eligible = () => this.platform.isActiveGM() && this.pending(actor)?.stage === stage;
    const remember = () => {
      const seen = this.#used.get(actor.uuid) ?? new Set<string>();
      seen.add(item.id);
      this.#used.set(actor.uuid, seen);
      this.show(actor);
    };
    const result: Choice[] = [{
      id,
      label: this.platform.format(used ? 'Defeat.Used' : activity?.canUse ? 'Defeat.Use' : 'Health.View', { name: item.name }),
      image: item.img,
      facts: [...(activity ? activityFacts(activity) : []),
        ...(bloodiedAtZero?.split ? [this.platform.format('Health.SplitRequirements')] : [])],
      run: async event => {
        if (!eligible()) return false;
        if (!activity?.canUse || this.#used.get(actor.uuid)?.has(item.id)) await item.sheet?.render({ force: true });
        else if (await this.platform.useActivity(combat, entry, activity, event, { pendingDefeat: true })) remember();
        return false;
      },
    }];
    if (automatic && !used) result.push({
      id: `defeat-auto:${item.id}`,
      label: this.platform.format('Defeat.Automatic', { name: item.name }),
      run: async () => {
        if (eligible() && await automatic()) remember();
        return false;
      },
    });
    return result;
  }

  async #finish(actor: NativeActor, combat: NativeCombat): Promise<void> {
    const state = this.pending(actor);
    if (!state || state.combatId !== combat.id || !this.platform.isActiveGM() || this.#resolving.has(actor.uuid)) return;
    this.#resolving.add(actor.uuid);
    try {
      await actor.setFlag(MODULE_ID, flag, null);
      if (actor.system.attributes?.hp?.value !== 0) return;
      await this.complete(actor, entriesFor(combat, actor));
      this.#used.delete(actor.uuid);
      this.ui.remove(cardId(actor));
    } catch (error) {
      if (actor.statuses.has(this.defeatedStatus()) || entriesFor(combat, actor).some(entry => entry.defeated)) {
        this.#used.delete(actor.uuid);
        this.ui.remove(cardId(actor));
      } else {
        await actor.setFlag(MODULE_ID, flag, state);
      }
      throw error;
    } finally {
      this.#resolving.delete(actor.uuid);
    }
  }
}

function entriesFor(combat: NativeCombat, actor: NativeActor): Combatant[] {
  return [...combat.combatants].filter(entry => entry.actor?.uuid === actor.uuid);
}

function cardId(actor: NativeActor): string {
  return `defeat:${actor.uuid}`;
}

function defeatAbilities(actor: NativeActor): Ability[] {
  const abilities: Ability[] = [];
  for (const item of actor.items) {
    const activities = [...(item.system.activities ?? [])];
    const rows = activities.length ? activities : [undefined];
    for (const activity of rows) {
      const trigger = itemTrigger(item, activity, actor.name);
      const id = activity ? `${item.id}.${activity.id}` : item.id;
      if (trigger?.kind === 'zero' || trigger?.kind === 'death') abilities.push({ id, item, activity, stage: trigger.kind });
      else if (trigger?.kind === 'bloodied' && trigger.atZero) {
        abilities.push({ id, item, activity, stage: 'zero', bloodiedAtZero: { once: !!trigger.once, split: !!trigger.split } });
      }
    }
  }
  return abilities;
}

function firstBloodied(entry: Combatant): Set<string> {
  const stored = entry.getFlag?.(MODULE_ID, 'firstBloodied');
  return new Set(Array.isArray(stored) ? stored : []);
}

export function effectActor(effect: NativeEffect): NativeActor | undefined {
  if (effect.target?.documentName === 'Actor') return effect.target;
  const parent = effect.parent;
  return parent?.documentName === 'Actor' ? parent as NativeActor : (parent as NativeItem | null)?.parent ?? undefined;
}
