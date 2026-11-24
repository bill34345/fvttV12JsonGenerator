import { attackBinding, BLOODIED_ATTACKS_FLAG } from './bloodied-attack-config.ts';
import { bloodiedThresholdOverride, isForcedBloodied, markBloodied, restoreAutomaticBloodied,
  setBloodiedThreshold } from './bloodied-status.ts';
import { hasAutomaticTrigger, manualTrigger, suggestedTrigger } from './health.ts';
import type { HealthTrigger, TriggerKind } from './health.ts';
import { MODULE_ID } from './types.ts';
import type { NativeActor, NativeItem } from './types.ts';

export interface NativeDialog {
  wait(options: {
    window: { title: string };
    position: { width: number };
    content: HTMLDivElement;
    render?: (event: Event, dialog: { element: HTMLElement }) => void;
    buttons: Array<{
      action: string;
      label: string;
      default?: boolean;
      callback?: (event: Event, button: HTMLButtonElement) => Promise<void>;
    }>;
  }): Promise<unknown>;
}

type Translation = (key: string, data?: Record<string, string | number>) => string;

const bindings = [
  ['automatic', 'Automatic'],
  ['zero', 'Zero'],
  ['death', 'Death'],
  ['bloodied', 'Bloodied'],
  ['bloodied-once', 'BloodiedOnce'],
  ['bloodied-at-zero', 'BloodiedAtZero'],
  ['bloodied-once-at-zero', 'BloodiedOnceAtZero'],
  ['bloodied-turn', 'BloodiedTurn'],
  ['bloodied-while', 'BloodiedWhile'],
  ['ignore', 'Ignore'],
] as const;

export async function configureActor(Dialog: NativeDialog, actor: NativeActor, tr: Translation): Promise<void> {
  const content = document.createElement('div');
  const instructions = document.createElement('p');
  instructions.textContent = tr('Config.Explanation');
  const toggle = document.createElement('label');
  const disabled = document.createElement('input');
  disabled.type = 'checkbox';
  disabled.name = 'disabled';
  disabled.defaultChecked = actor.getFlag(MODULE_ID, 'disabled') === true;
  toggle.append(disabled, tr('Config.Disabled'));

  const currentThreshold = bloodiedThresholdOverride(actor);
  const status = document.createElement('div');
  status.className = 'form-group';
  const thresholdLabel = document.createElement('label');
  thresholdLabel.textContent = tr('Config.BloodiedThreshold');
  const fields = document.createElement('div');
  fields.className = 'form-fields';
  const threshold = document.createElement('input');
  threshold.type = 'number';
  threshold.name = 'bloodied-threshold';
  threshold.placeholder = tr('Config.BloodiedThresholdDefault');
  threshold.min = '1';
  threshold.max = '99';
  threshold.step = '1';
  threshold.defaultValue = currentThreshold?.toString() ?? '';
  thresholdLabel.htmlFor = threshold.id = 'boss-reminders-bloodied-threshold';
  const force = document.createElement('button');
  force.type = 'button';
  force.dataset.bossBloodiedForce = '';
  force.textContent = tr(isForcedBloodied(actor) ? 'Config.RestoreAutomatic' : 'Config.ForceBloodied');
  fields.append(threshold, force);
  status.append(thresholdLabel, fields);

  const rows = document.createElement('div');
  rows.className = 'boss-reminder-bindings';
  const entries = [...actor.items].map(item => ({
    item,
    suggested: suggestedTrigger(item.system.description?.value ?? ''),
    current: manualTrigger(item),
    automatic: hasAutomaticTrigger(item, actor.name),
  })).sort((a, b) => Number(Boolean(b.suggested)) - Number(Boolean(a.suggested)));
  for (const { item, suggested, current, automatic } of entries) {
    const row = document.createElement('label');
    const name = document.createElement('span');
    name.textContent = item.name;
    if (suggested && !automatic && !current) {
      const details = document.createElement('small');
      details.textContent = tr(suggested.startsWith('bloodied') ? 'Config.SuggestBloodied' : 'Config.SuggestDeath');
      name.append(details);
    }
    const select = document.createElement('select');
    select.name = `trigger-${item.id}`;
    const previous = encode(current);
    for (const [value, label] of bindings) {
      const choice = document.createElement('option');
      choice.value = value;
      choice.textContent = tr(`Config.${label}`);
      choice.defaultSelected = (value === previous);
      select.append(choice);
    }
    row.append(name, select);
    rows.append(row);
  }
  content.append(instructions, toggle, status, rows);

  const attacks = entries.flatMap(({ item }) => attackSettings(item, tr) ?? []);
  if (attacks.length) {
    const details = document.createElement('details');
    const summary = document.createElement('summary');
    summary.textContent = tr('Config.BloodiedAttackBindings');
    const attackRows = document.createElement('div');
    attackRows.className = 'boss-reminder-bindings';
    attackRows.append(...attacks.map(attack => attack.section));
    details.append(summary, attackRows);
    content.append(details);
  }

  await Dialog.wait({
    window: { title: tr('Config.Title', { name: actor.name }) },
    position: { width: 540 },
    content,
    render(_event, dialog) {
      // DialogV2 serializes content to HTML, so this listener belongs on the rendered button.
      const button = dialog.element.querySelector<HTMLButtonElement>('[data-boss-bloodied-force]');
      button?.addEventListener('click', async () => {
        button.disabled = true;
        try {
          if (isForcedBloodied(actor)) await restoreAutomaticBloodied(actor);
          else await markBloodied(actor, 'forced', tr('Config.ForcedBloodiedEffect'));
        } catch (error) {
          console.error('[Boss Combat Reminders] Failed to change bloodied status', error);
        } finally {
          button.disabled = false;
          button.textContent = tr(isForcedBloodied(actor) ? 'Config.RestoreAutomatic' : 'Config.ForceBloodied');
        }
      });
    },
    buttons: [
      {
        action: 'save',
        label: tr('Config.Save'),
        default: true,
        async callback(_event, button) {
          const form = button.form;
          if (!form) return;
          const hp = form.elements.namedItem(threshold.name) as HTMLInputElement;
          if (hp.validity.valid && hp.value !== (currentThreshold?.toString() ?? '')) {
            await setBloodiedThreshold(actor, hp.value ? hp.valueAsNumber : undefined, tr('Config.BloodiedThresholdEffect'));
          }
          const field = form.elements.namedItem('disabled') as HTMLInputElement;
          if (Boolean(actor.getFlag(MODULE_ID, 'disabled')) !== field.checked) {
            await actor.setFlag(MODULE_ID, 'disabled', field.checked);
          }
          for (const entry of entries) {
            const select = form.elements.namedItem(`trigger-${entry.item.id}`) as HTMLSelectElement;
            if (select.value === encode(entry.current)) continue;
            if (select.value === 'automatic') await entry.item.unsetFlag(MODULE_ID, 'healthTrigger');
            else await entry.item.setFlag(MODULE_ID, 'healthTrigger', decode(select.value));
          }
          for (const attack of attacks) await attack.save(form);
        },
      },
      { action: 'cancel', label: tr('Config.Cancel') },
    ],
  });
}

function attackSettings(item: NativeItem, tr: Translation) {
  const activities = [...(item.system.activities ?? [])];
  const attacks = activities.filter(activity => activity.type === 'attack');
  const riders = activities.filter(activity => activity.type !== 'attack');
  const effects = [...(item.effects ?? [])];
  if (!attacks.length || (attacks.length < 2 && !riders.length && !effects.length)) return;

  const section = document.createElement('section');
  const title = document.createElement('h3');
  title.textContent = item.name;
  section.append(title);
  const noBinding = tr('Config.BloodiedNoBinding');
  const fields = attacks.map(attack => {
    const previous = attackBinding(item, attack.id);
    const fieldset = document.createElement('fieldset');
    const legend = document.createElement('legend');
    legend.textContent = attack.name;
    fieldset.append(legend);
    section.append(fieldset);
    const prefix = `bloodied-${item.id}-${attack.id}`;
    const variant = `${prefix}-variant`;
    const mode = `${prefix}-mode`;
    const rider = `${prefix}-rider`;

    if (attacks.length > 1) {
      settingSelect(fieldset, variant, tr('Config.BloodiedVariant'), previous?.variant?.id ?? '',
        [['', noBinding], ...attacks.filter(sibling => sibling.id !== attack.id)
          .map(sibling => [sibling.id, sibling.name] as const)]);
      settingSelect(fieldset, mode, tr('Config.BloodiedMode'), previous?.variant?.mode ?? 'choice',
        [['choice', tr('Config.BloodiedChoice')], ['replace', tr('Config.BloodiedReplace')]]);
    }
    if (riders.length || effects.length) {
      const riderValue = previous?.rider?.activityId ? `activity:${previous.rider.activityId}`
        : previous?.rider?.effectId ? `effect:${previous.rider.effectId}` : '';
      const select = settingSelect(fieldset, rider, tr('Config.BloodiedRider'), riderValue, [['', noBinding]]);
      addOptionGroup(select, tr('Config.BloodiedActivities'), riders.map(choice => [`activity:${choice.id}`, choice.name]), riderValue);
      addOptionGroup(select, tr('Config.BloodiedEffects'), effects.map(choice => [`effect:${choice.id}`, choice.name ?? choice.id]), riderValue);
    }
    return { id: attack.id, previous, variant, mode, rider };
  });
  return {
    section,
    async save(form: HTMLFormElement): Promise<void> {
      const updates = fields.flatMap(({ id, previous, variant, mode, rider }) => {
        const selected = (name: string) => (form.elements.namedItem(name) as HTMLSelectElement | null)?.value;
        const variantId = selected(variant) ?? previous?.variant?.id ?? '';
        const variantMode = selected(mode) ?? previous?.variant?.mode ?? 'choice';
        const choice = selected(rider);
        const activityId = choice === undefined ? previous?.rider?.activityId : choice.startsWith('activity:') ? choice.slice(9) : undefined;
        const effectId = choice === undefined ? previous?.rider?.effectId : choice.startsWith('effect:') ? choice.slice(7) : undefined;
        if (variantId === (previous?.variant?.id ?? '') && (!variantId || variantMode === previous?.variant?.mode)
          && activityId === previous?.rider?.activityId && effectId === previous?.rider?.effectId) return [];
        // Use explicit nulls for cleared values because Foundry merges nested flags.
        return [[id, {
          variant: variantId ? { id: variantId, mode: variantMode } : null,
          rider: activityId || effectId ? { activityId: activityId ?? null, effectId: effectId ?? null } : null,
        }]];
      });
      if (updates.length) await item.setFlag(MODULE_ID, BLOODIED_ATTACKS_FLAG, Object.fromEntries(updates));
    },
  };
}

type SelectOption = readonly [string, string];

function settingSelect(parent: HTMLElement, name: string, label: string, selected: string,
  options: SelectOption[]): HTMLSelectElement {
  const row = document.createElement('label');
  const caption = document.createElement('span');
  caption.textContent = label;
  const select = document.createElement('select');
  select.name = name;
  for (const [value, text] of options) addOption(select, value, text, selected);
  row.append(caption, select);
  parent.append(row);
  return select;
}

function addOptionGroup(select: HTMLSelectElement, label: string, options: SelectOption[], selected: string): void {
  if (!options.length) return;
  const group = document.createElement('optgroup');
  group.label = label;
  for (const [value, text] of options) addOption(group, value, text, selected);
  select.append(group);
}

function addOption(parent: HTMLSelectElement | HTMLOptGroupElement, value: string, text: string, selected: string): void {
  const option = document.createElement('option');
  option.value = value;
  option.textContent = text;
  option.defaultSelected = value === selected;
  parent.append(option);
}

function encode(trigger: HealthTrigger | 'ignore' | undefined): string {
  if (trigger === 'ignore') return trigger;
  if (!trigger) return 'automatic';
  return trigger.kind + (trigger.once ? '-once' : '') + (trigger.atZero ? '-at-zero' : '');
}

function decode(value: string): HealthTrigger | 'ignore' {
  if (value === 'ignore') return value;
  if (value === 'bloodied-turn' || value === 'bloodied-while') return { kind: value };
  const kind: TriggerKind = value === 'death' || value === 'zero' ? value : 'bloodied';
  return { kind, once: value.includes('-once'), atZero: value.endsWith('-at-zero') };
}
