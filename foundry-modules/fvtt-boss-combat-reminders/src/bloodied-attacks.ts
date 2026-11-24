import { attackBinding } from './bloodied-attack-config.ts';
import type { BloodiedAttackBinding } from './bloodied-attack-config.ts';
import { bloodiedAttackClauses, redactBloodiedAttackClauses } from './bloodied-attack-text.ts';
import { isActorBloodied } from './bloodied-status.ts';
import type { NativeDialog } from './setup.ts';
import { MODULE_ID } from './types.ts';
import type { ActivityUseInput, DamageInput, NativeActivity, NativeActivityMessage, NativeActor, NativeEffect, NativeItem, NativeSaveMessage } from './types.ts';

export interface BloodiedAttackTarget {
  token: string;
  actor?: string;
  name: string;
  img?: string;
  ac: number | null;
  isMiss?: boolean;
}
type Target = BloodiedAttackTarget;

interface AttackMessage extends NativeSaveMessage {
  isContentVisible: boolean;
  rolls?: readonly { isCritical?: boolean }[];
  whisper?: readonly string[];
  blind?: boolean;
  system: NativeSaveMessage['system'] & { evaluatedTargets?: readonly Target[] };
  getAssociatedActivity(): NativeActivity | undefined;
  getAssociatedItem(): NativeItem | undefined;
  getAssociatedRolls?(type: 'attack'): AttackMessage[];
  getFlag(scope: string, key: string): unknown;
  setFlag(scope: string, key: string, value: unknown): Promise<unknown>;
}

interface UsageMessage extends NativeActivityMessage {
  data: NativeActivityMessage['data'] & { system?: {
    description?: string; activation?: { condition?: string }; activity?: { chatFlavor?: string };
    effects?: string[]; targets?: readonly object[]; origin?: string;
  } };
}

interface Replay {
  use: ActivityUseInput;
  dialog?: { configure?: boolean };
  message?: NativeActivityMessage;
}

interface AttackPlan {
  base: NativeActivity;
  variant?: NativeActivity;
  mode?: 'replace' | 'choice';
  rider?: BloodiedAttackBinding['rider'];
}

type Translate = (key: string, data?: Record<string, string | number>) => string;
type EffectTray = HTMLElement & {
  chatMessage: AttackMessage;
  _applyEffectToActor(effect: NativeEffect, actor: NativeActor): Promise<unknown>;
};

export function attackPlan(item: NativeItem, activityId?: string): AttackPlan | undefined {
  const owned = [...(item.system.activities ?? [])];
  const activities = owned.filter(activity => activity.type === 'attack');
  const plans = activities.flatMap(base => {
    const binding = attackBinding(item, base.id);
    const variant = activities.find(activity => activity.id === binding?.variant?.id && activity !== base);
    return binding ? [{ base, variant, mode: binding.variant?.mode, rider: binding.rider }] : [];
  });
  if (activityId) {
    const planned = plans.find(plan => plan.base.id === activityId) ?? plans.find(plan => plan.variant?.id === activityId);
    const base = activities.find(activity => activity.id === activityId);
    return planned ?? (base ? { base } : undefined);
  }
  return plans.find(plan => owned.every(activity =>
    activity === plan.base || activity === plan.variant || activity.id === plan.rider?.activityId));
}

export function hasBloodiedAttack(item: NativeItem, actor: NativeActor): boolean {
  return [...(item.system.activities ?? [])].some(activity => activity.type === 'attack'
    && (attackBinding(item, activity.id) || bloodiedAttackClauses(item.system.description?.value ?? '', actor.name).length));
}

export function sanitizeBloodiedAttackUsage(activity: NativeActivity, message: UsageMessage): void {
  const actor = activity.actor;
  const item = activity.item;
  const system = message.data.system;
  if (!actor?.system.isNPC || !item || !system || !hasBloodiedAttack(item, actor)) return;
  const redact = (body: string) => redactBloodiedAttackClauses(body, actor.name);
  const plan = activity.type === 'attack' ? attackPlan(item, activity.id) : undefined;
  if (system.description) system.description = redact(system.description);
  if (system.activation?.condition) system.activation.condition = redact(system.activation.condition);
  if (plan?.variant?.id === activity.id && system.activation) system.activation.condition = '';
  if (system.activity?.chatFlavor) system.activity.chatFlavor = redact(system.activity.chatFlavor);
  const effectId = plan?.rider?.effectId;
  if (effectId && system.effects) system.effects = system.effects.filter(uuid => uuid.split('.').at(-1) !== effectId);
}

export class BloodiedAttacks {
  #replaying = new Set<string>();
  #views = new Map<HTMLElement, { actor: string; draw(): void }>();
  #handled = new Map<string, Set<string>>();
  #busy = new Set<string>();
  #sheets = new WeakSet<HTMLElement>();
  #attackScopes = new Map<string, string>();

  constructor(
    private readonly tr: Translate,
    private readonly Dialog: NativeDialog,
    private readonly liveTargets: () => Target[],
    private readonly resolveTarget: (uuid: string) => NativeActor | undefined,
    private readonly scope: () => string | undefined,
    private readonly fail: (message: string) => void,
  ) {}

  rememberAttack(message: AttackMessage): void {
    const scope = this.scope();
    if (!scope || message.type !== 'attack') return;
    const actor = message.getAssociatedActor();
    const item = message.getAssociatedItem();
    if (actor?.system.isNPC && item && hasBloodiedAttack(item, actor)) this.#attackScopes.set(message.id, scope);
  }

  preUse(activity: NativeActivity, use: ActivityUseInput, dialog: { configure?: boolean }, message: UsageMessage): false | undefined {
    const actor = activity.actor;
    const item = activity.item;
    if (!actor?.system.isNPC || !item || !enabled(actor) || activity.type !== 'attack') return;
    if (this.#replaying.has(activityKey(actor, item, activity))) return;
    const plan = attackPlan(item, activity.id);
    if (!plan?.variant) return;
    const active = isActorBloodied(actor);
    if ((active && activity.id === plan.variant.id) || (!active && activity.id === plan.base.id)) return;
    const replay: Replay = {
      // Let the selected Activity compute its own default resource and template settings.
      use: { event: use.event, subsequentActions: use.subsequentActions, midiOptions: use.midiOptions,
        ...(use.consume === false ? { consume: false } : {}), ...(use.create === false ? { create: false } : {}) },
      dialog: dialog.configure === undefined ? undefined : { configure: dialog.configure },
      message: replayMessage(message),
    };
    if (active && plan.mode === 'choice') {
      this.#offer(actor, item, plan, replay);
    } else {
      this.#run(actor, item, active ? plan.variant : plan.base, replay);
    }
    return false;
  }

  preRollDamage(input: DamageInput & { subject?: NativeActivity }, dialog: { configure?: boolean },
    message: NativeActivityMessage): false | undefined {
    const activity = input.subject;
    const actor = activity?.actor;
    const item = activity?.item;
    if (!actor?.system.isNPC || !item || activity?.type !== 'attack' || !enabled(actor)) return;
    if (this.#replaying.has(activityKey(actor, item, activity))) return;
    const plan = attackPlan(item, activity.id);
    if (!plan?.variant) return;
    const variantApplies = isActorBloodied(actor) && (plan.mode === 'replace' || plan.variant.id === activity.id);
    const selected = variantApplies ? plan.variant : plan.base;
    if (selected.id === activity.id || !selected.rollDamage) return;
    const { event, ability, ammunition, attackMode, isCritical } = input;
    const key = activityKey(actor, item, selected);
    this.#replaying.add(key);
    void selected.rollDamage({ event, ability, ammunition, attackMode, isCritical }, {
      configure: dialog.configure, options: isCritical ? { defaultButton: 'critical' } : {},
    }, replayMessage(message)).catch(error => this.#error(error)).finally(() => this.#replaying.delete(key));
    return false;
  }

  renderSheet(actor: NativeActor, root: HTMLElement): void {
    if (!actor.system.isNPC || !enabled(actor)) return;
    const items = new Map([...actor.items].filter(item => hasBloodiedAttack(item, actor)).map(item => [item.id, item]));
    if (!items.size) return;
    const draw = () => {
      root.querySelectorAll('[data-bcr-bloodied-targeting]').forEach(node => node.remove());
      if (!isActorBloodied(actor)) return;
      for (const row of root.querySelectorAll<HTMLElement>('[data-item-id] .item-name')) {
        const item = items.get(row.closest<HTMLElement>('[data-item-id]')?.dataset.itemId ?? '');
        if (!item) continue;
        const hint = this.#targeting(item, actor);
        if (hint) row.append(hint);
      }
    };
    this.#watch(root, actor, draw);
    if (this.#sheets.has(root)) return;
    this.#sheets.add(root);
    root.addEventListener('inventory', event => {
      if ((event as CustomEvent).detail !== 'use' || !(event.target instanceof Element)) return;
      const itemId = event.target.closest<HTMLElement>('[data-item-id]')?.dataset.itemId;
      const item = [...actor.items].find(entry => entry.id === itemId);
      const plan = item && attackPlan(item);
      if (!item || !plan || (!plan.variant && !plan.rider?.activityId) || !enabled(actor)) return;
      event.preventDefault();
      const variant = isActorBloodied(actor) ? plan.variant : undefined;
      if (variant && plan.mode === 'choice') this.#offer(actor, item, plan, { use: { event } });
      else this.#run(actor, item, variant ?? plan.base, { use: { event } });
    });
  }

  renderMessage(message: AttackMessage, root: HTMLElement): void {
    if (!['usage', 'attack'].includes(message.type) || !message.isContentVisible || root.hidden) return;
    if (message.type === 'usage') {
      const rolls = message.getAssociatedRolls?.('attack') ?? [];
      for (const summary of root.querySelectorAll<HTMLElement>('.card-summary[data-message-id]')) {
        const attack = rolls.find(roll => roll.id === summary.dataset.messageId);
        if (attack) this.renderMessage(attack, summary);
      }
    }
    const actor = message.getAssociatedActor();
    const item = message.getAssociatedItem();
    const activity = message.getAssociatedActivity();
    if (!actor?.system.isNPC || !enabled(actor) || !item || activity?.type !== 'attack' || !hasBloodiedAttack(item, actor)) return;
    const container = root.querySelector('.message-content') ?? root;
    if ([...container.children].some(child => child.hasAttribute('data-bcr-bloodied-attack'))) return;
    const panel = root.ownerDocument.createElement('section');
    panel.className = 'boss-reminder-attack-rules';
    panel.dataset.bcrBloodiedAttack = message.type;
    container.append(panel);
    const confirmed = new Set<string>();
    this.#watch(panel, actor, () => {
      const current = message.getAssociatedActor();
      panel.hidden = !current || !isActorBloodied(current) || !enabled(current)
        || (message.type === 'attack' && !this.#currentAttack(message));
      if (panel.hidden) return;
      panel.replaceChildren();
      if (message.type === 'usage') {
        const hint = this.#targeting(item, actor);
        if (hint) panel.append(hint);
        panel.hidden = !hint;
        return;
      }
      const rows = bloodiedAttackClauses(item.system.description?.value ?? '', actor.name).filter(clause => clause.phase === 'hit');
      const rider = attackPlan(item, activity.id)?.rider;
      if (!rows.length && !rider) {
        panel.hidden = true;
        return;
      }
      const title = panel.ownerDocument.createElement('strong');
      title.textContent = this.tr('Attack.HitRules');
      panel.append(title);
      for (const { text } of rows) appendParagraph(panel, text);
      if (rider) this.#renderSettlement(panel, message, item, rider, confirmed);
    });
  }

  refresh(actor?: NativeActor): void {
    for (const [root, view] of this.#views) {
      if (!root.isConnected) this.#views.delete(root);
      else if (!actor || view.actor === actor.uuid) view.draw();
    }
  }

  forgetMessage(id: string): void {
    this.#handled.delete(id);
    this.#attackScopes.delete(id);
  }

  #currentAttack(message: AttackMessage): boolean {
    const scope = this.scope();
    return Boolean(scope && this.#attackScopes.get(message.id) === scope);
  }

  #watch(root: HTMLElement, actor: NativeActor, draw: () => void): void {
    this.#views.set(root, { actor: actor.uuid, draw });
    draw();
  }

  #targeting(item: NativeItem, actor: NativeActor): HTMLElement | undefined {
    const clauses = bloodiedAttackClauses(item.system.description?.value ?? '', actor.name).filter(clause => clause.phase === 'targeting');
    const plan = attackPlan(item);
    if (!clauses.length && !plan?.variant) return;
    const details = document.createElement('span');
    details.className = 'boss-reminder-attack-targeting';
    details.dataset.bcrBloodiedTargeting = '';
    const names = plan?.variant ? [plan.variant.name, plan.variant.labels?.range, plan.variant.target?.affects?.labels?.sheet] : [];
    details.textContent = [this.tr('Attack.Targeting'), ...names, ...clauses.map(clause => clause.text)].filter(Boolean).join(' · ');
    return details;
  }

  #offer(actor: NativeActor, item: NativeItem, plan: AttackPlan, replay: Replay): void {
    const content = document.createElement('div');
    const hint = this.#targeting(item, actor);
    if (hint) content.append(hint);
    void this.Dialog.wait({
      window: { title: this.tr('Attack.Choose', { name: item.name }) },
      position: { width: 440 }, content,
      buttons: [plan.base, plan.variant!].map(activity => ({
        action: activity.id, label: activity.name,
        callback: async (click: Event) => {
          if (activity === plan.variant && !isActorBloodied(actor)) return;
          await this.#use(actor, item, activity, { ...replay, use: { ...replay.use, event: replay.use.event ?? click } });
        },
      })),
    }).catch(error => this.#error(error));
  }

  #run(actor: NativeActor, item: NativeItem, activity: NativeActivity, replay: Replay): void {
    void this.#use(actor, item, activity, replay).catch(error => this.#error(error));
  }

  async #use(actor: NativeActor, item: NativeItem, activity: NativeActivity, replay: Replay): Promise<unknown> {
    const key = activityKey(actor, item, activity);
    this.#replaying.add(key);
    try {
      return await activity.use(replay.use, replay.dialog, replay.message);
    } finally {
      this.#replaying.delete(key);
    }
  }

  #renderSettlement(panel: HTMLElement, message: AttackMessage, item: NativeItem, rider: NonNullable<AttackPlan['rider']>,
    confirmed: Set<string>): void {
    const recorded = message.system.evaluatedTargets ?? [];
    const targets = recorded.length ? recorded : this.liveTargets();
    const stored = message.getFlag(MODULE_ID, 'settledBloodiedTargets');
    const done = this.#handled.get(message.id) ?? new Set<string>(Array.isArray(stored) ? stored : []);
    this.#handled.set(message.id, done);
    const candidates = targets.filter(target => !knownHitResult(target) || !target.isMiss);
    if (!candidates.length) {
      appendParagraph(panel, this.tr(recorded.length ? 'Attack.NoHits' : 'Attack.SelectTargets'));
      return;
    }
    const redraw = () => this.#views.get(panel)?.draw();
    for (const target of candidates) {
      if (knownHitResult(target)) continue;
      const label = panel.ownerDocument.createElement('label');
      const box = panel.ownerDocument.createElement('input');
      box.type = 'checkbox';
      box.checked = confirmed.has(target.token);
      box.addEventListener('change', () => {
        if (box.checked) confirmed.add(target.token);
        else confirmed.delete(target.token);
        redraw();
      });
      label.append(box, this.tr('Attack.ConfirmTarget', { name: target.name }));
      panel.append(label);
    }
    const activity = [...(item.system.activities ?? [])].find(value => value.id === rider.activityId && value.type !== 'attack');
    const effect = [...(item.effects ?? [])].find(value => value.id === rider.effectId);
    if (!activity && !effect) return;
    const chosen = candidates.filter(target => knownHitResult(target) || confirmed.has(target.token))
      .filter(target => !done.has(target.token));
    const button = panel.ownerDocument.createElement('button');
    button.type = 'button';
    button.dataset.bcrBloodiedApply = '';
    button.textContent = this.tr('Attack.Apply', { name: activity?.name ?? effect?.name ?? item.name });
    button.disabled = !chosen.length || this.#busy.has(message.id);
    button.addEventListener('click', () => {
      const actor = message.getAssociatedActor();
      if (!actor || !enabled(actor) || !isActorBloodied(actor) || !this.#currentAttack(message) || this.#busy.has(message.id)) return;
      this.#busy.add(message.id);
      button.disabled = true;
      void this.#settle(panel, message, activity, effect, chosen, done).catch(error => this.#error(error)).finally(() => {
        this.#busy.delete(message.id);
        redraw();
      });
    });
    panel.append(button);
  }

  async #settle(panel: HTMLElement, message: AttackMessage, activity: NativeActivity | undefined, effect: NativeEffect | undefined,
    targets: Target[], done: Set<string>): Promise<void> {
    const current = targets.flatMap(target => {
      const actor = this.resolveTarget(target.token);
      return actor && (!target.actor || target.actor === actor.uuid) ? [{ actor, target }] : [];
    });
    if (activity && current.length) {
      const targets = current.map(({ target }) => target);
      const visibility = message.blind ? 'blind' : message.whisper?.length ? 'gm' : undefined;
      const followup: NativeActivityMessage = {
        ...(visibility ? { rollMode: visibility } : {}),
        data: {
          ...(message.whisper?.length ? { whisper: [...message.whisper] } : {}),
          system: { targets, origin: message.id },
        },
      };
      const result = await activity.use({ subsequentActions: false }, undefined, followup);
      if (!result) return;
      if (activity.type === 'damage' && activity.rollDamage) {
        const actor = message.getAssociatedActor();
        if (!actor || !isActorBloodied(actor) || !this.#currentAttack(message)) return;
        const rolls = await activity.rollDamage({ isCritical: message.rolls?.[0]?.isCritical }, { configure: false }, followup);
        if (!rolls?.length) return;
      }
      for (const { target } of current) done.add(target.token);
    } else if (effect) {
      const tray = panel.ownerDocument.createElement('effect-application') as EffectTray;
      tray.chatMessage = message;
      for (const { actor, target } of current) {
        await tray._applyEffectToActor(effect, actor);
        done.add(target.token);
      }
    }
    if (done.size) await message.setFlag(MODULE_ID, 'settledBloodiedTargets', [...done]);
  }

  #error(error: unknown): void {
    console.error('[Boss Combat Reminders] Bloodied attack', error);
    this.fail(this.tr('Window.Failed'));
  }
}

function activityKey(actor: NativeActor, item: NativeItem, activity: NativeActivity): string {
  return `${actor.uuid}:${item.id}:${activity.id}`;
}

function replayMessage(message: NativeActivityMessage): NativeActivityMessage {
  const { speaker, whisper, blind, system } = message.data;
  return {
    ...(message.rollMode === undefined ? {} : { rollMode: message.rollMode }),
    ...(message.create === undefined ? {} : { create: message.create }),
    data: {
      ...(speaker === undefined ? {} : { speaker }),
      ...(whisper === undefined ? {} : { whisper }),
      ...(blind === undefined ? {} : { blind }),
      system: {
        ...(system?.targets === undefined ? {} : { targets: system.targets }),
        ...(system?.origin === undefined ? {} : { origin: system.origin }),
      },
    },
  };
}

function enabled(actor: NativeActor): boolean {
  return actor.getFlag(MODULE_ID, 'disabled') !== true;
}

function knownHitResult(target: Target): boolean {
  return target.ac !== null && typeof target.isMiss === 'boolean';
}

function appendParagraph(parent: HTMLElement, text: string): void {
  const paragraph = parent.ownerDocument.createElement('p');
  paragraph.textContent = text;
  parent.append(paragraph);
}
