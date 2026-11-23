import { activityFacts } from './activity-facts.ts';
import { healthMoment, itemTrigger, matchesMoment } from './health.ts';
import type { Health, HealthMoment } from './health.ts';
import { lairRounds, legendaryReminder } from './opportunities.ts';
import { MODULE_ID } from './types.ts';
import type { Choice, Combatant, HpData, NativeActivity, NativeActor, NativeCombat, NativeItem, NativeSaveMessage, Platform, ReminderGroup, RemindersUI, TurnState } from './types.ts';

export class CombatReminders {
  #turnKey = '';
  #turnRevision = 0;
  #offeredSaves = new Set<string>();
  #resisting = new Set<string>();
  #health = new Map<string, Health>();
  #firstBloodied = new Set<string>();
  #encounterId = '';
  #lairCards = new Set<string>();

  constructor(private readonly platform: Platform, private readonly ui: RemindersUI) {}

  turnChanged(combat: NativeCombat, previous: TurnState, current: TurnState): void {
    if (!this.platform.isActiveGM() || !combat.active || this.platform.combat()?.id !== combat.id) return;
    const key = turnKey(combat, current);
    if (key === this.#turnKey) return;
    this.#turnKey = key;
    this.seedHealth(combat);
    this.#turnRevision++;
    this.#offeredSaves.clear();
    this.#lairCards.clear();
    this.ui.clear();

    if (!advanced(previous, current)) return;
    if (previous.combatantId) this.#showLegendary(combat, previous.combatantId, this.#turnRevision);
    const outgoing = previous.combatantId ? combat.combatants.get(previous.combatantId) : undefined;
    const incoming = current.combatantId ? combat.combatants.get(current.combatantId) : undefined;
    for (const round of lairRounds(previous.round, outgoing?.initiative ?? null, current.round, incoming?.initiative ?? null)) {
      this.#showLair(combat, round, this.#turnRevision);
    }
  }

  clear(combat?: NativeCombat): void {
    if (combat && this.#encounterId !== combat.id && !this.#turnKey.startsWith(combat.id + ':')) return;
    this.#turnKey = '';
    this.#enterEncounter('');
    this.#turnRevision++;
    this.#offeredSaves.clear();
    this.#lairCards.clear();
    this.ui.clear();
  }

  seedHealth(combat = this.platform.combat()): void {
    if (!combat?.started) return;
    this.#enterEncounter(combat.id);
    for (const entry of combat.combatants) {
      const actor = entry.actor;
      const hp = actor && healthOf(actor.system.attributes?.hp);
      if (actor && hp) this.#health.set(actor.uuid, hp);
    }
  }

  healthChanged(actor: NativeActor, prior?: HpData): void {
    const combat = this.platform.combat();
    if (!combat?.started || !actor.system.isNPC) return;
    this.#enterEncounter(combat.id);
    const entries = [...combat.combatants].filter(entry => entry.actor?.uuid === actor.uuid);
    if (!entries.length) return;

    const after = healthOf(actor.system.attributes?.hp);
    const before = this.#health.get(actor.uuid) ?? healthOf(prior);
    if (!after) return;
    this.#health.set(actor.uuid, after);
    if (!this.platform.isActiveGM()) return;
    if (after.value > 0) for (const entry of entries) this.ui.removeGroup?.('health:death', entry.id);
    if (after.value > after.max / 2 || after.value === 0) {
      for (const entry of entries) this.ui.removeGroup?.('health:bloodied', entry.id);
    }

    const moment = before && healthMoment(before, after);
    if (!moment || actor.getFlag(MODULE_ID, 'disabled')) return;
    const revision = this.#turnRevision;
    const cardKind = moment.zero ? 'death' : 'bloodied';
    const groups = entries.flatMap(entry =>
      this.#healthGroup(combat, entry, actor, moment, cardKind, revision));
    if (groups.length) this.ui.show({
      id: `health:${cardKind}`,
      kind: cardKind,
      title: this.platform.format(cardKind === 'death' ? 'Health.Death' : 'Health.Bloodied'),
      timing: cardKind === 'death' ? this.platform.format('Health.AtZero') : undefined,
      groups,
    });
  }

  #enterEncounter(id: string): void {
    if (id === this.#encounterId) return;
    this.#encounterId = id;
    this.#health.clear();
    this.#firstBloodied.clear();
  }

  #healthGroup(
    combat: NativeCombat, entry: Combatant, actor: NativeActor,
    moment: HealthMoment, kind: 'death' | 'bloodied', revision: number,
  ): ReminderGroup[] {
    const persisted = entry.getFlag?.(MODULE_ID, 'firstBloodied');
    const seen = new Set<string>(Array.isArray(persisted) ? persisted : []);
    let persist = false;
    const choices = [...actor.items].flatMap(item => {
      const activities = [...(item.system.activities ?? [])];
      const set: (NativeActivity | undefined)[] = activities.length ? activities : [undefined];
      return set.flatMap<Choice>(activity => {
        const trigger = itemTrigger(item, activity);
        if (!trigger || !matchesMoment(trigger, moment)) return [];
        const key = activity ? `${item.id}.${activity.id}` : item.id;
        const onceKey = `${entry.id}:${key}`;
        if (trigger.once && (seen.has(key) || this.#firstBloodied.has(onceKey))) return [];
        if (trigger.once) {
          this.#firstBloodied.add(onceKey);
          seen.add(key);
          persist = true;
        }

        if (!activity || !available(item, activity)) return [{
          id: key,
          label: this.platform.format('Health.View', { name: activity?.name ?? item.name }),
          image: item.img,
          facts: activity && activityFacts(activity),
          run: async () => {
            if (revision === this.#turnRevision && this.platform.isActiveGM()) await item.sheet?.render({ force: true });
            return false;
          },
        }];

        return [{
          id: key,
          label: activities.length === 1 ? item.name : `${item.name} · ${activity.name}`,
          image: item.img,
          facts: activityFacts(activity),
          run: (event: Event) => this.#useHealth(combat, entry.id, item.id, activity.id, kind, revision, event),
        }];
      });
    });
    if (persist) void entry.setFlag?.(MODULE_ID, 'firstBloodied', [...seen]).catch(console.error);
    return choices.length ? [{ id: entry.id, label: entry.name, portrait: actor.img, choices }] : [];
  }

  async #useHealth(
    combat: NativeCombat, combatantId: string, itemId: string, activityId: string,
    kind: 'death' | 'bloodied', revision: number, event: Event,
  ): Promise<boolean> {
    if (!this.platform.isActiveGM() || this.platform.combat()?.id !== combat.id
      || revision !== this.#turnRevision) return false;
    const entry = combat.combatants.get(combatantId);
    const actor = entry?.actor;
    if (!entry || !actor || actor.getFlag(MODULE_ID, 'disabled')) return false;
    const hp = healthOf(actor.system.attributes?.hp);
    if (!hp || (kind === 'death' ? hp.value !== 0 : hp.value <= 0 || hp.value > hp.max / 2)) return false;
    const item = [...actor.items].find(candidate => candidate.id === itemId);
    if (!item) return false;
    const activity = [...(item.system.activities ?? [])].find(action => action.id === activityId);
    if (!activity || !available(item, activity)) return false;
    const trigger = itemTrigger(item, activity);
    if (!trigger || (kind === 'bloodied' ? trigger.kind !== kind : trigger.kind !== 'death' && !trigger.atZero)) return false;
    return this.platform.useActivity(combat, entry, activity, event);
  }

  saveCreated(message: NativeSaveMessage): void {
    const combat = this.platform.combat();
    if (!this.platform.isActiveGM() || !combat?.started || !message.system?.canResist
      || message.type !== 'save' || this.#offeredSaves.has(message.id)) return;
    this.#enterEncounter(combat.id);
    const combatant = this.#saveCombatant(combat, message);
    if (!combatant) return;
    this.#offeredSaves.add(message.id);

    const revision = this.#turnRevision;
    const messageId = message.id;
    this.ui.show({
      id: `resistance:${messageId}`,
      kind: 'resistance',
      title: this.platform.format('Resistance.Title'),
      groups: [{
        id: combatant.id,
        label: combatant.name,
        portrait: combatant.actor?.img,
        remaining: this.platform.format('Resistance.Remaining', {
          remaining: combatant.actor?.system.resources?.legres?.value ?? 0,
        }),
        oneChoice: true,
        choices: [{
          id: messageId,
          label: this.platform.format('Resistance.Use'),
          run: () => this.#resist(combat, combatant.id, messageId, revision),
        }],
      }],
    });
  }

  activityUsed(activity: NativeActivity): void {
    const type = activity.activation.type;
    if (type !== 'legendary' && type !== 'lair') return;
    if (!this.platform.isActiveGM()) return;
    const combat = this.platform.combat();
    const source = activity.getUsageToken?.()?.id;
    if (!combat || !source) return;
    const entry = [...combat.combatants].find(option => option.token?.id === source);
    if (!entry) return;
    if (type === 'legendary') this.ui.removeGroup?.('legendary', entry.id);
    else for (const card of this.#lairCards) this.ui.removeGroup?.(card, entry.id);
  }

  saveChanged(message: NativeSaveMessage): void {
    if (message.type === 'save' && !message.system.canResist) this.ui.remove(`resistance:${message.id}`);
  }

  #saveCombatant(combat: NativeCombat, message: NativeSaveMessage): Combatant | undefined {
    const actor = message.getAssociatedActor();
    if (!actor?.system.isNPC || actor.getFlag(MODULE_ID, 'disabled')) return;
    const entries = [...combat.combatants].filter(entry => entry.actor?.uuid === actor.uuid);
    const token = message.getAssociatedToken?.();
    return token ? entries.find(entry => entry.token?.id === token.id) : entries.length === 1 ? entries[0] : undefined;
  }

  async #resist(combat: NativeCombat, combatantId: string, messageId: string, revision: number): Promise<boolean> {
    if (!this.platform.isActiveGM() || this.platform.combat()?.id !== combat.id
      || revision !== this.#turnRevision) return false;
    const message = this.platform.message(messageId);
    if (!message?.system.canResist) return false;
    const entry = this.#saveCombatant(combat, message);
    if (entry?.id !== combatantId || !entry.actor?.system.resistSave) return false;

    const actorId = entry.actor.uuid;
    if (this.#resisting.has(actorId)) return false;
    this.#resisting.add(actorId);
    try {
      await entry.actor.system.resistSave(message);
      return true;
    } finally {
      this.#resisting.delete(actorId);
    }
  }

  #showLegendary(combat: NativeCombat, endedId: string, revision: number): void {
    const bosses = [...combat.combatants].filter(entry => entry.actor?.system.isNPC);
    const reminder = legendaryReminder(endedId, bosses.map(boss => ({
      id: boss.id,
      name: boss.name,
      portrait: boss.actor?.img,
      eligible: canAct(boss),
      remaining: legendaryRemaining(boss),
      actions: activityList(boss, 'legendary').map(action => ({
        id: action.key,
        name: action.activity.name,
        image: action.image,
        facts: activityFacts(action.activity),
        available: action.available,
        cost: cost(action.activity),
      })),
    })));
    if (!reminder.length) return;

    this.ui.show({
      id: 'legendary',
      kind: 'legendary',
      title: this.platform.format('Legendary.Title'),
      groups: reminder.map(boss => ({
        id: boss.id,
        label: boss.name,
        portrait: boss.portrait,
        remaining: this.platform.format('Legendary.Remaining', { remaining: boss.remaining }),
        oneChoice: true,
        choices: boss.actions.map(action => ({
          id: action.id,
          label: action.name,
          image: action.image,
          facts: action.facts,
          cost: this.platform.format('Legendary.Cost', { cost: action.cost }),
          run: event => this.#use(combat, boss.id, action.id, 'legendary', revision, event),
        })),
      })),
    });
  }

  #showLair(combat: NativeCombat, round: number, revision: number): void {
    const groups = [...combat.combatants].flatMap(boss => {
      if (!canAct(boss) || !insideLair(boss)) return [];
      const actions = activityList(boss, 'lair').filter(action => action.available);
      return actions.length ? [{
        id: boss.id,
        label: boss.name,
        portrait: boss.actor?.img,
        oneChoice: true,
        choices: actions.map(action => ({
          id: action.key,
          label: action.activity.name,
          image: action.image,
          facts: activityFacts(action.activity),
          run: (event: Event) => this.#use(combat, boss.id, action.key, 'lair', revision, event),
        })),
      }] : [];
    });
    if (!groups.length) return;
    const id = `lair:${round}`;
    this.#lairCards.add(id);
    this.ui.show({
      id,
      kind: 'lair',
      title: this.platform.format('Lair.Title'),
      timing: this.platform.format('Lair.Timing', { round }),
      groups,
    });
  }

  async #use(
    combat: NativeCombat, combatantId: string, activityKey: string,
    type: 'legendary' | 'lair', revision: number, event: Event,
  ): Promise<boolean> {
    if (!this.platform.isActiveGM() || this.platform.combat()?.id !== combat.id
      || revision !== this.#turnRevision) return false;
    const combatant = combat.combatants.get(combatantId);
    if (!combatant || !canAct(combatant)) return false;
    const entry = activityList(combatant, type).find(action => action.key === activityKey && action.available);
    if (!entry) return false;
    if (type === 'legendary' && cost(entry.activity) > legendaryRemaining(combatant)) return false;
    if (type === 'lair' && !insideLair(combatant)) return false;
    return this.platform.useActivity(combat, combatant, entry.activity, event);
  }
}

function turnKey(combat: NativeCombat, turn: TurnState): string {
  return `${combat.id}:${turn.round}:${turn.turn}:${turn.combatantId}`;
}

export function advanced(previous: TurnState, current: TurnState): boolean {
  if (current.round < 1 || current.turn === null) return false;
  return current.round === previous.round + 1
    || (current.round === previous.round && current.combatantId !== previous.combatantId
      && current.turn > (previous.turn ?? -1));
}

function canAct(combatant: Combatant): boolean {
  const actor = combatant.actor;
  return Boolean(actor?.system.isNPC && !(combatant.isDefeated ?? combatant.defeated)
    && !actor.getFlag(MODULE_ID, 'disabled') && !actor.statuses.has('incapacitated')
    && (actor.system.attributes?.hp?.value ?? 1) > 0);
}

function insideLair(combatant: Combatant): boolean {
  const lair = combatant.actor?.system.resources?.lair;
  return Boolean(lair?.value && lair.inside);
}

function legendaryRemaining(combatant: Combatant): number {
  return combatant.actor?.system.resources?.legact?.value ?? 0;
}

function cost(activity: NativeActivity): number {
  return activity.activation.value ?? 1;
}

function activityList(combatant: Combatant, type: string) {
  return [...(combatant.actor?.items ?? [])].flatMap(item =>
    [...(item.system.activities ?? [])].filter(activity => activity.activation.type === type).map(activity => ({
      key: `${item.id}.${activity.id}`,
      activity,
      image: item.img,
      available: available(item, activity),
    })),
  );
}

function available(item: NativeItem, activity: NativeActivity): boolean {
  if (!activity.canUse) return false;
  return !(activity.consumption?.targets ?? []).some(consumption => {
    if (consumption.type === 'itemUses' && (!consumption.target || consumption.target === item.id)) {
      return !hasUses(item.system.uses);
    }
    if (consumption.type === 'activityUses' && (!consumption.target || consumption.target === activity.id)) {
      return !hasUses(activity.uses);
    }
    return false;
  });
}

function hasUses(uses: { max?: number | null; value?: number | null } | undefined): boolean {
  return !(uses?.max && uses.value === 0);
}

function healthOf(hp: HpData | undefined): Health | undefined {
  if (typeof hp?.value !== 'number') return;
  return { value: hp.value, max: hp.effectiveMax ?? hp.max ?? 0 };
}
