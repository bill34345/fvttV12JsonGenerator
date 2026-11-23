import { hasAutomaticTrigger, manualTrigger, suggestedTrigger } from './health.ts';
import type { HealthTrigger, TriggerKind } from './health.ts';
import { MODULE_ID } from './types.ts';
import type { NativeActor } from './types.ts';

export interface NativeDialog {
  wait(options: {
    window: { title: string };
    position: { width: number };
    content: HTMLDivElement;
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
  ['death', 'Death'],
  ['bloodied', 'Bloodied'],
  ['bloodied-once', 'BloodiedOnce'],
  ['bloodied-at-zero', 'BloodiedAtZero'],
  ['bloodied-once-at-zero', 'BloodiedOnceAtZero'],
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

  const rows = document.createElement('div');
  rows.className = 'boss-reminder-bindings';
  const entries = [...actor.items].map(item => ({
    item,
    suggested: suggestedTrigger(item.system.description?.value ?? ''),
    current: manualTrigger(item),
    automatic: hasAutomaticTrigger(item),
  })).sort((a, b) => Number(Boolean(b.suggested)) - Number(Boolean(a.suggested)));
  for (const { item, suggested, current, automatic } of entries) {
    const row = document.createElement('label');
    const name = document.createElement('span');
    name.textContent = item.name;
    if (suggested && !automatic && !current) {
      const details = document.createElement('small');
      details.textContent = tr(suggested === 'death' ? 'Config.SuggestDeath' : 'Config.SuggestBloodied');
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
  content.append(instructions, toggle, rows);

  await Dialog.wait({
    window: { title: tr('Config.Title', { name: actor.name }) },
    position: { width: 540 },
    content,
    buttons: [
      {
        action: 'save',
        label: tr('Config.Save'),
        default: true,
        async callback(_event, button) {
          const form = button.form;
          if (!form) return;
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
        },
      },
      { action: 'cancel', label: tr('Config.Cancel') },
    ],
  });
}

function encode(trigger: HealthTrigger | 'ignore' | undefined): string {
  if (trigger === 'ignore') return trigger;
  if (!trigger) return 'automatic';
  return trigger.kind + (trigger.once ? '-once' : '') + (trigger.atZero ? '-at-zero' : '');
}

function decode(value: string): HealthTrigger | 'ignore' {
  if (value === 'ignore') return value;
  const kind: TriggerKind = value === 'death' ? 'death' : 'bloodied';
  return { kind, once: value.includes('-once'), atZero: value.endsWith('-at-zero') };
}
