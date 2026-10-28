const ELEMENT_NAME = 'fvtt-json-forge-condition-application';

export function isGmConditionEffect(effect: any): boolean {
  return effect?.flags?.fvttJsonGenerator?.conditionLifecycle?.mode === 'gm';
}

/** Midi's CE preference does not disable Activity effects. Keep the source
 * templates available to Core's explicit Apply UI while excluding automatic use. */
export function prepareManualConditionEffectsForMidi(item: Record<string, any>): void {
  const effects: any[] = Array.isArray(item.effects) ? item.effects : [];
  for (const activity of Object.values(item.system?.activities ?? {}) as any[]) {
    const linked = (Array.isArray(activity?.effects) ? activity.effects : [])
      .map((link: any) => effects.find(effect => effect?._id === link?._id)).filter(Boolean);
    if (!linked.some(isGmConditionEffect)) continue;
    for (const effect of linked.filter(isGmConditionEffect)) {
      effect.flags.dae = {...effect.flags.dae, dontApply: true};
    }
    if (linked.every(isGmConditionEffect)) {
      activity.effectConditionText = 'false';
      activity.midiProperties = {...activity.midiProperties, autoCEEffects: 'none'};
    }
  }
}

export function conditionEffectGroups(item: any, associatedActivity?: any): Array<{activity: any; effects: any[]}> {
  const activities = associatedActivity ? [associatedActivity] : Array.from(item.system.activities.values());
  const groups = activities.map((activity: any) => ({activity,
    effects: activity.effects.map((link: any) => item.effects.get(link._id)).filter((effect: any) =>
      effect?.flags?.fvttJsonGenerator?.conditionLifecycle?.version === 1 && (!associatedActivity || isGmConditionEffect(effect))),
  })).filter(group => group.effects.length);
  return groups;
}

/** Exhaustion's official level is owned by ActorDataModel, which creates its
 * static dnd5eexhaustion Effect. Ordinary copied Item Effects cannot increment it. */
export async function applyExhaustionTemplate(effect: any, actor: any, environment: any = globalThis): Promise<unknown> {
  if (!environment.game.user.isGM && !actor.isOwner) throw new Error('需要拥有目标角色的修改权限。');
  let levels = effect.flags?.fvttJsonGenerator?.conditionLifecycle?.exhaustionLevels;
  if (!Number.isSafeInteger(levels) || levels < 1) {
    levels = await environment.foundry.applications.api.DialogV2.prompt({
      window: {title: '应用耗竭 Exhaustion'},
      content: '<p>来源未给出级数，请按完整规则选择本次增加量。</p><label>增加级数 <input type="number" name="levels" value="1" min="1" max="6" step="1" required></label>',
      ok: {label: '应用', callback: (_event: unknown, button: any) => Number(button.form.elements.levels.value)},
      rejectClose: false,
    });
    if (!Number.isSafeInteger(levels) || levels < 1) return;
  }
  const current = Number(actor.system.attributes.exhaustion ?? 0);
  return actor.update({'system.attributes.exhaustion': Math.min(6, current + levels)});
}

function registerConditionApplication(environment: any): void {
  if (environment.customElements.get(ELEMENT_NAME)) return;
  const CoreEffectApplication = environment.customElements.get('effect-application');
  if (!CoreEffectApplication) return;
  class ConditionApplication extends CoreEffectApplication {
    async _applyEffectToActor(effect: any, actor: any): Promise<unknown> {
      if (isGmConditionEffect(effect) && Array.from(effect.statuses ?? []).includes('exhaustion')) {
        return applyExhaustionTemplate(effect, actor, environment);
      }
      return super._applyEffectToActor(effect, actor);
    }
  }
  environment.customElements.define(ELEMENT_NAME, ConditionApplication);
}

/** Extend the ordinary chat card, without using an Activity, spending uses,
 * evaluating source text, or replacing Midi/DAE or system prototypes. */
export function renderManualConditionEffects(message: any, html: any, environment: any = globalThis): void {
  if (environment.game?.user?.isGM !== true) return;
  const root: HTMLElement | undefined = html?.querySelector ? html : html?.[0];
  const item = message.getAssociatedItem?.();
  if (!root || !item?.system?.activities || !item.effects) return;
  const groups = conditionEffectGroups(item, message.getAssociatedActivity?.());
  if (!groups.length || root.querySelector('[data-forge-manual-conditions]')) return;
  registerConditionApplication(environment);
  if (!environment.customElements.get(ELEMENT_NAME)) return;

  // Move only the templates handled here. User-authored effects and other
  // activities retain their original native tray and application behavior.
  const handled = new Set(groups.flatMap(group => group.effects.map(effect => effect.id)));
  for (const tray of root.querySelectorAll('effect-application') as NodeListOf<HTMLElement & {effects?: any[]}>) {
    if (Array.isArray(tray.effects)) tray.effects = tray.effects.filter(effect => !handled.has(effect.id));
    for (const entry of tray.querySelectorAll<HTMLElement>('option, .effect[data-id]')) {
      if (handled.has(entry.dataset.id ?? entry.getAttribute('value'))) entry.remove();
    }
    if (!tray.effects?.length && !tray.querySelector('option, .effect[data-id]')) tray.remove();
  }
  const document = root.ownerDocument;
  const section = document.createElement('section');
  section.dataset.forgeManualConditions = 'true';
  section.className = 'dnd5e2 fvtt-json-forge-condition-effects';
  const title = document.createElement('p');
  title.textContent = 'GM：按原文确认适用条件，选择目标并应用对应效果。';
  section.append(title);
  for (const {activity, effects} of groups) {
    const heading = document.createElement('strong'); heading.textContent = activity.name;
    section.append(heading);
    for (const effect of effects) {
      const details = document.createElement('details'), summary = document.createElement('summary');
      summary.textContent = `${effect.name} · 条件与结束规则`;
      const source = document.createElement('p');
      source.textContent = String(effect.description ?? '').replace(/<[^>]*>/gu, ' ');
      details.append(summary, source); section.append(details);
    }
    const tray = document.createElement(ELEMENT_NAME) as HTMLElement & {effects: any[]};
    tray.effects = effects; tray.setAttribute('open', ''); tray.setAttribute('visible', '');
    section.append(tray);
  }
  (root.querySelector('.message-content') ?? root).append(section);
}
