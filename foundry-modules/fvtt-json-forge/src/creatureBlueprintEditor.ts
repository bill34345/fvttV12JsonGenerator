/**
 * Small, DOM-facing editor model for the Forge Actor blueprint mode.
 *
 * The browser runtime owns the blueprint schema and canonical source renderer.
 * This file deliberately keeps only form state and event wiring so the Actor
 * application can preserve drafts while the Foundry template is re-rendered.
 */

export type BlueprintComponentKind = 'attack' | 'save';

export interface BlueprintComponentDraft {
  id: string;
  kind: BlueprintComponentKind;
  name: string;
  mode: string;
  ability: string;
  attackBonus: string;
  range: string;
  damageFormula: string;
  damageType: string;
  dc: string;
  onSave: string;
}

export interface BlueprintParentDraft {
  sourceId: string;
  sourceHash: string;
  name: string;
}

export interface BlueprintDraft {
  sourceId?: string;
  name: string;
  size: string;
  type: string;
  alignment: string;
  armorClass: string;
  hitPoints: string;
  speed: string;
  challengeRating: string;
  abilities: Record<'str' | 'dex' | 'con' | 'int' | 'wis' | 'cha', string>;
  components: BlueprintComponentDraft[];
  parent?: BlueprintParentDraft;
  variantName?: string;
  diff?: string;
}

const ABILITY_KEYS = ['str', 'dex', 'con', 'int', 'wis', 'cha'] as const;
const ABILITY_LABELS: Record<(typeof ABILITY_KEYS)[number], string> = {
  str: '力量',
  dex: '敏捷',
  con: '体质',
  int: '智力',
  wis: '感知',
  cha: '魅力',
};

export function createEmptyBlueprintDraft(): BlueprintDraft {
  return {
    sourceId: undefined,
    name: '',
    size: 'medium',
    type: '',
    alignment: 'neutral',
    armorClass: '',
    hitPoints: '',
    speed: '30',
    challengeRating: '',
    abilities: { str: '10', dex: '10', con: '10', int: '10', wis: '10', cha: '10' },
    components: [],
  };
}

export function cloneBlueprintDraft(value: BlueprintDraft): BlueprintDraft {
  return {
    ...value,
    abilities: { ...value.abilities },
    components: value.components.map((component) => ({ ...component })),
    parent: value.parent ? { ...value.parent } : undefined,
  };
}

export function createBlueprintComponent(kind: BlueprintComponentKind, id = randomComponentId()): BlueprintComponentDraft {
  return {
    id,
    kind,
    name: kind === 'attack' ? '新攻击' : '新豁免',
    mode: 'melee',
    ability: kind === 'attack' ? 'str' : 'con',
    attackBonus: '',
    range: kind === 'attack' ? '5' : '30',
    damageFormula: '',
    damageType: '',
    dc: '',
    onSave: 'half',
  };
}

/** Read static fields from the current form without touching dynamic component state. */
export function readBlueprintDraft(root: HTMLElement, previous: BlueprintDraft): BlueprintDraft {
  const draft = cloneBlueprintDraft(previous);
  draft.name = valueOf(root, 'displayName');
  draft.size = valueOf(root, 'blueprintSize') || draft.size;
  draft.type = valueOf(root, 'blueprintType');
  draft.alignment = valueOf(root, 'blueprintAlignment') || draft.alignment;
  draft.armorClass = valueOf(root, 'blueprintArmorClass');
  draft.hitPoints = valueOf(root, 'blueprintHitPoints');
  draft.speed = valueOf(root, 'blueprintSpeed');
  draft.challengeRating = valueOf(root, 'blueprintCr');
  for (const key of ABILITY_KEYS) draft.abilities[key] = valueOf(root, `blueprintScore-${key}`);
  draft.variantName = valueOf(root, 'blueprintVariantName') || undefined;
  return draft;
}

/** Apply a loaded draft explicitly. Calls from ordinary re-render should use preserveActive=true. */
export function writeBlueprintDraft(root: HTMLElement, draft: BlueprintDraft, preserveActive = true): void {
  setValue(root, 'displayName', draft.name, preserveActive);
  setValue(root, 'blueprintSize', draft.size, preserveActive);
  setValue(root, 'blueprintType', draft.type, preserveActive);
  setValue(root, 'blueprintAlignment', draft.alignment, preserveActive);
  setValue(root, 'blueprintArmorClass', draft.armorClass, preserveActive);
  setValue(root, 'blueprintHitPoints', draft.hitPoints, preserveActive);
  setValue(root, 'blueprintSpeed', draft.speed, preserveActive);
  setValue(root, 'blueprintCr', draft.challengeRating, preserveActive);
  for (const key of ABILITY_KEYS) setValue(root, `blueprintScore-${key}`, draft.abilities[key], preserveActive);
  setValue(root, 'blueprintVariantName', draft.variantName ?? '', preserveActive);
}

export function renderBlueprintComponents(
  root: HTMLElement,
  components: readonly BlueprintComponentDraft[],
  onChange: (componentId: string, patch: Partial<BlueprintComponentDraft>) => void,
  onRemove: (componentId: string) => void,
  rebuild = true,
): void {
  const container = root.querySelector('[data-blueprint-components]') as HTMLElement | null;
  if (!container) return;
  if (rebuild) {
    container.innerHTML = components.length === 0
      ? '<p class="forge-blueprint-help">尚未添加能力组件。攻击和豁免组件将在正式来源中成为原生活动。</p>'
      : components.map((component, index) => componentMarkup(component, index)).join('');
  }
  if (typeof container.addEventListener !== 'function' || container.dataset.forgeBlueprintBound === 'true') return;
  container.dataset.forgeBlueprintBound = 'true';
  container.addEventListener('input', (event) => {
    const target = event.target as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null;
    const component = target?.closest?.('[data-blueprint-component]') as HTMLElement | null;
    const name = target?.dataset?.blueprintField;
    const id = component?.dataset?.blueprintComponent;
    if (!name || !id) return;
    onChange(id, { [name]: target.value } as Partial<BlueprintComponentDraft>);
  });
  container.addEventListener('change', (event) => {
    const target = event.target as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null;
    const component = target?.closest?.('[data-blueprint-component]') as HTMLElement | null;
    const name = target?.dataset?.blueprintField;
    const id = component?.dataset?.blueprintComponent;
    if (!name || !id) return;
    onChange(id, { [name]: target.value } as Partial<BlueprintComponentDraft>);
  });
  container.addEventListener('click', (event) => {
    const target = event.target as HTMLElement | null;
    const button = target?.closest?.('[data-blueprint-remove]') as HTMLElement | null;
    const id = button?.dataset?.blueprintRemove;
    if (id) onRemove(id);
  });
}

export function componentMarkup(component: BlueprintComponentDraft, index: number): string {
  const label = component.kind === 'attack' ? '攻击' : '豁免';
  const kindFields = component.kind === 'attack'
    ? `<label>模式<select data-blueprint-field="mode"><option value="melee"${selected(component.mode, 'melee')}>近战</option><option value="ranged"${selected(component.mode, 'ranged')}>远程</option></select></label>
        <label>命中加值<input data-blueprint-field="attackBonus" value="${escapeAttribute(component.attackBonus)}" maxlength="3" inputmode="numeric"></label>`
    : `<label>豁免能力<select data-blueprint-field="ability">${abilityOptions(component.ability)}</select></label>
        <label>固定 DC<input data-blueprint-field="dc" value="${escapeAttribute(component.dc)}" maxlength="30" inputmode="numeric"></label>
        <label>豁免成功<select data-blueprint-field="onSave"><option value="half"${selected(component.onSave, 'half')}>伤害减半</option><option value="none"${selected(component.onSave, 'none')}>无额外效果</option></select></label>`;
  return `<article class="forge-blueprint-component" data-blueprint-component="${escapeAttribute(component.id)}" aria-labelledby="forge-blueprint-component-${escapeAttribute(component.id)}">
    <header><h4 id="forge-blueprint-component-${escapeAttribute(component.id)}">${escapeHtml(label)} ${index + 1}</h4><button type="button" data-blueprint-remove="${escapeAttribute(component.id)}" aria-label="移除${label}组件">移除</button></header>
    <div class="forge-blueprint-component-grid">
      <label>名称<input data-blueprint-field="name" value="${escapeAttribute(component.name)}" autocomplete="off"></label>
      <label>范围（尺）<input data-blueprint-field="range" value="${escapeAttribute(component.range)}" maxlength="4" inputmode="numeric"></label>
      ${kindFields}
      <label>伤害公式<input data-blueprint-field="damageFormula" value="${escapeAttribute(component.damageFormula)}" maxlength="80" autocomplete="off" placeholder="1d6+2"></label>
      <label>伤害类型<input data-blueprint-field="damageType" value="${escapeAttribute(component.damageType)}" maxlength="40" autocomplete="off"></label>
    </div>
  </article>`;
}

export function describeBlueprintDiff(draft: BlueprintDraft): string {
  if (!draft.parent) return '';
  const lines = [`父来源：${draft.parent.name || draft.parent.sourceId}`, `父 sourceId：${draft.parent.sourceId}`];
  if (draft.parent.sourceHash) lines.push(`父来源 hash：${draft.parent.sourceHash}`);
  if (draft.diff) lines.push('', draft.diff);
  return lines.join('\n');
}

function valueOf(root: HTMLElement, name: string): string {
  const input = root.querySelector(`[name="${name}"]`) as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null;
  return input?.value ?? '';
}

function setValue(root: HTMLElement, name: string, value: string, preserveActive: boolean): void {
  const input = root.querySelector(`[name="${name}"]`) as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement | null;
  if (!input) return;
  if (preserveActive && (globalThis as any).document?.activeElement === input) return;
  input.value = value;
}

function selected(actual: string, expected: string): string {
  return actual === expected ? ' selected' : '';
}

function abilityOptions(actual: string): string {
  return ABILITY_KEYS.map((key) => `<option value="${key}"${selected(actual, key)}>${ABILITY_LABELS[key]}</option>`).join('');
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/gu, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character] ?? character);
}

function escapeAttribute(value: string): string {
  return escapeHtml(value).replace(/\r?\n/gu, ' ');
}

function randomComponentId(): string {
  const cryptoApi = (globalThis as any).crypto;
  if (typeof cryptoApi?.randomUUID === 'function') return `component-${cryptoApi.randomUUID()}`;
  return `component-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
