import {
  WEAPON_MASTERY_IDS,
  defaultWeaponConfiguration,
  isWeaponMasteryId,
  officialMasteryRule,
  parseWeaponConfiguration,
  parseWeaponRule,
  type WeaponConfiguration,
  type WeaponMasteryId,
  type WeaponRuleDefinition,
  type WeaponRuleKind,
  type WeaponRuleParams,
} from '@fvtt-json-generator/contracts/weapon-properties';

export const WEAPON_MODULE_ID = 'fvtt-weapon-mastery-properties' as const;
export const WEAPON_MANAGER_TEMPLATE = `modules/${WEAPON_MODULE_ID}/templates/weapon-manager.hbs` as const;

export const WEAPON_PROPERTY_KINDS = ['none', 'deadly', 'fatal', 'criticalBleeding'] as const;
export type WeaponPropertyKind = typeof WEAPON_PROPERTY_KINDS[number];
export const WEAPON_DIE_FACES = [4, 6, 8, 10, 12] as const;

export interface WeaponDependencyIssue {
  id: string;
  label?: string;
  message?: string;
}

export interface WeaponDependencyState {
  ready: boolean;
  missing?: readonly (string | WeaponDependencyIssue)[];
  errors?: readonly string[];
  dependencies?: readonly { id: string; ready: boolean; label?: string; error?: string }[];
}

export interface WeaponEffectReadback {
  id?: string;
  ruleId?: string;
  kind?: string;
  label?: string;
  summary?: string;
  source?: string;
  sourceUuid?: string;
  actorUuid?: string;
  itemUuid?: string;
  activityId?: string;
  targetUuid?: string;
  enabled?: boolean;
}

/**
 * Browser-safe runtime facade consumed by the ApplicationV2 manager.
 * Runtime owns permissions, document writes, dependency negotiation and
 * effect-instance storage; the manager only passes typed configuration.
 */
export interface WeaponMasteryPropertiesApi {
  configuration(item: any): WeaponConfiguration | null | undefined;
  configure(item: any, configuration: WeaponConfiguration): Promise<unknown> | unknown;
  dependencies?(): WeaponDependencyState | Promise<WeaponDependencyState>;
  effects?(actor: any): readonly WeaponEffectReadback[] | Promise<readonly WeaponEffectReadback[]>;
}

export interface WeaponItemChoice {
  uuid: string;
  name: string;
  group: string;
  source: 'actor' | 'world';
  actorUuid?: string;
  actorName?: string;
  item: any;
}

export interface WeaponPreview {
  ordinary: string;
  critical: string;
  ordinaryFormula: string;
  criticalFormula: string;
}

export interface WeaponFormData {
  itemUuid?: unknown;
  enabled?: unknown;
  mastery?: unknown;
  grantMastery?: unknown;
  propertyKind?: unknown;
  propertyDice?: unknown;
  propertyDie?: unknown;
  propertyFormula?: unknown;
  propertyMode?: unknown;
  propertyDamageType?: unknown;
  propertyEndOnHealing?: unknown;
}

export const OFFICIAL_MASTERY_PRESETS: readonly WeaponRuleDefinition[] = Object.freeze(
  WEAPON_MASTERY_IDS.map((kind) => {
    const rule = officialMasteryRule(kind);
    return Object.freeze({ ...rule, params: Object.freeze({ ...rule.params }) });
  }),
);

export function isActiveGM(globals: any = globalThis): boolean {
  return globals?.game?.user?.isGM === true && globals?.game?.user?.active !== false;
}

export function captureWeaponActors(globals: any = globalThis): any[] {
  const targets = collectionValues(globals?.game?.user?.targets)
    .map((target) => target?.actor ?? target?.document?.actor)
    .filter(Boolean);
  const controlled = collectionValues(globals?.canvas?.tokens?.controlled)
    .map((token) => token?.actor ?? token?.document?.actor)
    .filter(Boolean);
  return uniqueByUuid(targets.length ? targets : controlled);
}

/** Selected/targeted Actor weapons first, then world-level Item weapons. */
export function captureWeaponItems(globals: any = globalThis): WeaponItemChoice[] {
  const choices: WeaponItemChoice[] = [];
  const seen = new Set<string>();
  let syntheticIndex = 0;
  for (const actor of captureWeaponActors(globals)) {
    for (const item of collectionValues(actor?.items)) {
      if (!isWeaponItem(item)) continue;
      const uuid = itemUuid(item, `actor-${actorUuid(actor)}-${syntheticIndex++}`);
      if (seen.has(uuid)) continue;
      seen.add(uuid);
      choices.push({
        uuid,
        name: String(item?.name ?? 'Weapon'),
        group: String(actor?.name ?? 'Actor'),
        source: 'actor',
        actorUuid: actorUuid(actor),
        actorName: String(actor?.name ?? 'Actor'),
        item,
      });
    }
  }
  for (const item of collectionValues(globals?.game?.items)) {
    if (!isWeaponItem(item)) continue;
    const uuid = itemUuid(item, `world-${syntheticIndex++}`);
    if (seen.has(uuid)) continue;
    seen.add(uuid);
    choices.push({ uuid, name: String(item?.name ?? 'Weapon'), group: 'World', source: 'world', item });
  }
  return choices;
}

/**
 * Copy an immutable official mastery into the homebrew namespace. The source
 * definition is cloned, and an existing id is never edited or reused.
 */
export function copyOfficialMasteryPreset(
  kind: WeaponMasteryId,
  label: string,
  existingRules: readonly WeaponRuleDefinition[] = [],
): WeaponRuleDefinition {
  if (!isWeaponMasteryId(kind)) throw new Error('Unknown official weapon mastery preset.');
  const source = officialMasteryRule(kind);
  const cleanLabel = String(label ?? '').trim() || source.label;
  if (cleanLabel.length > 160) throw new Error('The copied mastery label must be 160 characters or fewer.');
  const used = new Set(existingRules.map((rule) => rule.ruleId));
  const slug = slugifyIdentifier(cleanLabel);
  const baseId = trimIdentifier(`homebrew.${kind}.${slug}`);
  let ruleId = baseId;
  let suffix = 2;
  while (used.has(ruleId)) {
    const suffixText = `.${suffix++}`;
    ruleId = trimIdentifier(`${baseId.slice(0, Math.max(1, 120 - suffixText.length))}${suffixText}`);
  }
  return {
    ruleId,
    kind,
    label: cleanLabel,
    params: { ...source.params },
    stackingGroup: trimIdentifier(`homebrew.${kind}.${slug}`),
  };
}

/** Convert the typed manager controls into the versioned shared configuration. */
export function configurationFromForm(
  formData: WeaponFormData | Record<string, unknown> | FormData,
  baseConfiguration: WeaponConfiguration = defaultWeaponConfiguration(),
): WeaponConfiguration {
  const base = parseWeaponConfiguration(baseConfiguration);
  if (!base) throw new Error('The saved weapon configuration is invalid.');
  const enabled = booleanField(formData, 'enabled', base.enabled);
  const masteryValue = String(field(formData, 'mastery', base.mastery ?? 'native') ?? 'native').trim();
  const mastery = masteryValue === '' || masteryValue === 'null' ? null : masteryValue;
  const grantMastery = booleanField(formData, 'grantMastery', base.grantMastery);
  const baseProperty = base.rules.find((rule) => !isWeaponMasteryId(rule.kind));
  const propertyValue = String(field(formData, 'propertyKind', baseProperty?.kind ?? 'none') ?? 'none') as WeaponPropertyKind;
  if (!WEAPON_PROPERTY_KINDS.includes(propertyValue)) throw new Error('Unknown weapon property selection.');

  const rules = base.rules.filter((rule) => isWeaponMasteryId(rule.kind));
  if (propertyValue !== 'none') {
    rules.push(createPropertyRule(propertyValue, formData, baseProperty, rules));
  }
  const candidate = { schemaVersion: 1 as const, enabled, mastery, grantMastery, rules };
  const parsed = parseWeaponConfiguration(candidate);
  if (!parsed) throw new Error('Weapon configuration contains an invalid mastery or property parameter.');
  return parsed;
}

export function buildWeaponPreview(item: any, configuration: WeaponConfiguration): WeaponPreview {
  const ordinaryFormula = weaponBaseFormula(item);
  let criticalFormula = doubleWeaponDice(ordinaryFormula);
  const property = configuration.rules.find((rule) => !isWeaponMasteryId(rule.kind));
  if (property?.kind === 'deadly') {
    const dice = integerOr(property.params.dice, 1);
    const die = integerOr(property.params.die, 8);
    criticalFormula = `${criticalFormula} + ${dice}d${die}`;
  } else if (property?.kind === 'fatal') {
    const die = integerOr(property.params.die, 8);
    criticalFormula = replaceFirstWeaponDie(ordinaryFormula, die);
    criticalFormula = `${criticalFormula} + 1d${die}`;
  } else if (property?.kind === 'criticalBleeding') {
    const formula = String(property.params.formula ?? '1d6');
    const mode = property.params.mode === 'hpLoss' ? 'HP loss / 生命值损失' : 'damage / 伤害';
    criticalFormula = `${criticalFormula}; ${formula} bleeding (${mode}) / 流血（${mode}）`;
  }
  return {
    ordinary: `普通命中 / Ordinary hit: ${ordinaryFormula}`,
    critical: `重击 / Critical hit: ${criticalFormula}`,
    ordinaryFormula,
    criticalFormula,
  };
}

export function normalizeDependencyState(value: unknown): WeaponDependencyState {
  if (value === true || value === undefined || value === null) return { ready: true, missing: [], errors: [] };
  if (value === false) return { ready: false, missing: ['weapon dependencies'], errors: [] };
  if (typeof value !== 'object' || Array.isArray(value)) return { ready: false, missing: [], errors: [String(value)] };
  const record = value as Record<string, unknown>;
  const dependencyEntries = Array.isArray(record.dependencies) ? record.dependencies : [];
  const missing: (string | WeaponDependencyIssue)[] = Array.isArray(record.missing)
    ? record.missing.filter((entry): entry is string | WeaponDependencyIssue => typeof entry === 'string' || isDependencyIssue(entry))
    : [];
  for (const entry of dependencyEntries) {
    if (!isDependencyEntry(entry) || entry.ready) continue;
    missing.push({ id: entry.id, label: entry.label, message: entry.error });
  }
  const errors = Array.isArray(record.errors) ? record.errors.filter((entry): entry is string => typeof entry === 'string') : [];
  const readyValue = record.ready;
  const ready = readyValue === undefined
    ? missing.length === 0 && errors.length === 0
    : readyValue === true && missing.length === 0 && errors.length === 0;
  return { ready, missing, errors };
}

export async function openWeaponManager(api: WeaponMasteryPropertiesApi, globals: any = globalThis): Promise<unknown> {
  if (!isActiveGM(globals)) throw new Error('Weapon mastery configuration is available to GMs only.');
  const Application = createWeaponManagerApplicationClass(api, globals);
  return new Application({ api }).render({ force: true });
}

/** Create the v14 ApplicationV2 class lazily so the module remains browser-safe. */
export function createWeaponManagerApplicationClass(
  api?: WeaponMasteryPropertiesApi,
  globals: any = globalThis,
): any {
  const foundryApi = globals?.foundry?.applications?.api;
  const ApplicationV2 = foundryApi?.ApplicationV2;
  const HandlebarsApplicationMixin = foundryApi?.HandlebarsApplicationMixin;
  if (typeof ApplicationV2 !== 'function') throw new Error('Foundry 14 ApplicationV2 is unavailable.');
  const Base = typeof HandlebarsApplicationMixin === 'function' ? HandlebarsApplicationMixin(ApplicationV2) : ApplicationV2;

  return class WeaponManagerApplication extends Base {
    static DEFAULT_OPTIONS = {
      id: `${WEAPON_MODULE_ID}-manager`,
      tag: 'form',
      window: {
        title: 'FVTTWMP.Manager.Title',
        contentClasses: ['standard-form'],
        icon: 'fa-solid fa-khanda',
      },
      position: { width: 900, height: 760 },
      form: { closeOnSubmit: false, handler: this.onSubmit },
      actions: { refresh: this.refresh, loadItem: this.loadItem, copyPreset: this.copyPreset },
    };

    static PARTS = {
      body: { template: WEAPON_MANAGER_TEMPLATE },
      footer: { template: 'templates/generic/form-footer.hbs' },
    };

    api: WeaponMasteryPropertiesApi;
    weapons: WeaponItemChoice[] = [];
    actors: any[] = [];
    selectedItemUuid = '';
    loadedItemUuid = '';
    configuration: WeaponConfiguration = defaultWeaponConfiguration();
    propertyKind: WeaponPropertyKind = 'none';
    propertyDice = 1;
    propertyDie = 8;
    propertyFormula = '1d6';
    propertyMode: 'damage' | 'hpLoss' = 'damage';
    propertyDamageType = 'slashing';
    propertyEndOnHealing = true;
    copyPresetKind: WeaponMasteryId = 'cleave';
    copyLabel = '';
    configurationError = '';
    readbackErrors: string[] = [];

    constructor(options?: { api?: WeaponMasteryPropertiesApi } | WeaponMasteryPropertiesApi) {
      super();
      const candidate = options && 'configuration' in options
        ? options
        : (options as { api?: WeaponMasteryPropertiesApi } | undefined)?.api;
      this.api = candidate ?? api ?? globals?.game?.modules?.get?.(WEAPON_MODULE_ID)?.api;
      if (!this.api) throw new Error('Weapon mastery and properties API is unavailable.');
      this.refreshWeapons();
      this.loadSelectedConfiguration();
    }

    async _prepareContext() {
      this.ensureSelection();
      const dependency = await readDependencies(this.api);
      const effectReadback = await readEffectReadback(this.api, this.actors);
      this.readbackErrors = effectReadback.errors;
      const selected = this.selectedChoice();
      const previewConfiguration = this.draftConfiguration();
      const preview = selected ? buildWeaponPreview(selected.item, previewConfiguration) : buildWeaponPreview({}, previewConfiguration);
      const configError = this.configurationError;
      return {
        items: this.weapons.map((choice) => {
          const saved = safeConfiguration(this.api, choice.item).configuration;
          return { ...choice, selected: choice.uuid === this.selectedItemUuid, enabled: saved.enabled };
        }),
        selectedItem: selected,
        configuration: this.configuration,
        masteryOptions: masteryOptions(this.configuration),
        officialPresets: OFFICIAL_MASTERY_PRESETS.map((rule) => ({
          kind: rule.kind,
          ruleId: rule.ruleId,
          label: masteryDisplayLabel(rule.kind as WeaponMasteryId),
          params: rule.params,
          selected: rule.kind === this.copyPresetKind,
        })),
        propertyChoices: WEAPON_PROPERTY_KINDS.map((kind) => ({
          kind,
          label: propertyDisplayLabel(kind),
          selected: kind === this.propertyKind,
        })),
        property: {
          kind: this.propertyKind,
          isDice: this.propertyKind === 'deadly' || this.propertyKind === 'fatal',
          isDeadly: this.propertyKind === 'deadly',
          isFatal: this.propertyKind === 'fatal',
          isBleeding: this.propertyKind === 'criticalBleeding',
          dice: this.propertyDice,
          die: this.propertyDie,
          dieOptions: WEAPON_DIE_FACES.map((die) => ({ value: die, selected: die === this.propertyDie })),
          formula: this.propertyFormula,
          mode: this.propertyMode,
          modeDamage: this.propertyMode === 'damage',
          modeHpLoss: this.propertyMode === 'hpLoss',
          damageType: this.propertyDamageType,
          endOnHealing: this.propertyEndOnHealing,
        },
        preview,
        dependency: dependencyContext(dependency),
        actors: effectReadback.actors,
        readbackUnavailable: typeof this.api.effects !== 'function',
        readbackErrors: this.readbackErrors,
        configurationError: configError,
        canSave: isActiveGM(globals) && Boolean(selected) && dependency.ready,
        buttons: [{ type: 'submit', icon: 'fa-solid fa-save', label: 'FVTTWMP.Manager.Save' }],
        copyPresetKind: this.copyPresetKind,
        copyLabel: this.copyLabel,
      };
    }

    static async refresh(this: any) {
      this.refreshWeapons();
      this.loadSelectedConfiguration();
      await this.render({ force: true });
    }

    static async loadItem(this: any, event: unknown, target: any) {
      if (!isActiveGM(globals)) return notify(globals, 'Weapon mastery configuration is available to GMs only.');
      const uuid = String(target?.dataset?.itemUuid ?? readElementValue(this, 'itemUuid') ?? '').trim();
      if (!this.weapons.some((choice: WeaponItemChoice) => choice.uuid === uuid)) {
        return notify(globals, 'The selected weapon is no longer available.');
      }
      this.selectedItemUuid = uuid;
      this.loadSelectedConfiguration();
      await this.render({ force: true });
    }

    static async copyPreset(this: any, _event: unknown, target: any) {
      try {
        if (!isActiveGM(globals)) throw new Error('Weapon mastery configuration is available to GMs only.');
        const selected = this.selectedChoice();
        if (!selected) throw new Error('Select a weapon before copying a mastery preset.');
        const kind = String(target?.dataset?.presetKind ?? readElementValue(this, 'copyPresetKind') ?? '') as WeaponMasteryId;
        if (!isWeaponMasteryId(kind)) throw new Error('Select one of the eight official mastery presets.');
        this.copyPresetKind = kind;
        const label = String(target?.dataset?.presetLabel ?? readElementValue(this, 'copyLabel') ?? '').trim();
        const currentSaved = safeConfiguration(this.api, selected.item);
        if (currentSaved.error) throw new Error(currentSaved.error);
        const current = currentSaved.configuration;
        const copy = copyOfficialMasteryPreset(kind, label, current.rules);
        const next = parseWeaponConfiguration({ ...current, mastery: copy.ruleId, rules: [...current.rules, copy] });
        if (!next) throw new Error('The copied mastery could not be validated.');
        const dependency = await readDependencies(this.api);
        if (!dependency.ready) throw new Error(dependencyMessage(dependency));
        await this.api.configure(selected.item, next);
        this.selectedItemUuid = selected.uuid;
        this.loadConfiguration(next);
        this.copyLabel = '';
        await this.render({ force: true });
      } catch (error) {
        notify(globals, error);
      }
    }

    static async onSubmit(this: any, _event: unknown, _form: unknown, formData: any) {
      try {
        if (!isActiveGM(globals)) throw new Error('Weapon mastery configuration is available to GMs only.');
        const data = formData?.object ?? formData;
        const uuid = String(field(data, 'itemUuid', this.selectedItemUuid) ?? '').trim();
        const choice = this.weapons.find((candidate: WeaponItemChoice) => candidate.uuid === uuid);
        if (!choice) throw new Error('Select a weapon before saving.');
        const dependency = await readDependencies(this.api);
        if (!dependency.ready) throw new Error(dependencyMessage(dependency));
        const baseSaved = safeConfiguration(this.api, choice.item);
        if (baseSaved.error) throw new Error(baseSaved.error);
        const base = baseSaved.configuration;
        const next = configurationFromForm(data, base);
        await this.api.configure(choice.item, next);
        this.selectedItemUuid = uuid;
        this.loadConfiguration(next);
        await this.render({ force: true });
      } catch (error) {
        notify(globals, error);
      }
    }

    refreshWeapons(): void {
      this.weapons = captureWeaponItems(globals);
      this.actors = captureWeaponActors(globals);
      this.ensureSelection();
    }

    ensureSelection(): void {
      if (!this.weapons.some((choice) => choice.uuid === this.selectedItemUuid)) this.selectedItemUuid = this.weapons[0]?.uuid ?? '';
      if (this.loadedItemUuid !== this.selectedItemUuid) this.loadSelectedConfiguration();
    }

    selectedChoice(): WeaponItemChoice | undefined {
      return this.weapons.find((choice) => choice.uuid === this.selectedItemUuid);
    }

    loadSelectedConfiguration(): void {
      const selected = this.selectedChoice();
      if (!selected) {
        this.loadedItemUuid = '';
        this.loadConfiguration(defaultWeaponConfiguration());
        return;
      }
      const safe = safeConfiguration(this.api, selected.item);
      this.configurationError = safe.error ?? '';
      this.loadConfiguration(safe.configuration);
      this.loadedItemUuid = selected.uuid;
    }

    loadConfiguration(configuration: WeaponConfiguration): void {
      this.configuration = configuration;
      const property = configuration.rules.find((rule) => !isWeaponMasteryId(rule.kind));
      this.propertyKind = (property?.kind as WeaponPropertyKind | undefined) ?? 'none';
      this.propertyDice = integerOr(property?.params.dice, 1);
      this.propertyDie = integerOr(property?.params.die, 8);
      this.propertyFormula = String(property?.params.formula ?? '1d6');
      this.propertyMode = property?.params.mode === 'hpLoss' ? 'hpLoss' : 'damage';
      this.propertyDamageType = String(property?.params.damageType ?? 'slashing');
      this.propertyEndOnHealing = property?.params.endOnHealing !== false;
    }

    draftConfiguration(): WeaponConfiguration {
      try {
        return configurationFromForm({
          enabled: this.configuration.enabled,
          mastery: this.configuration.mastery ?? 'native',
          grantMastery: this.configuration.grantMastery,
          propertyKind: this.propertyKind,
          propertyDice: this.propertyDice,
          propertyDie: this.propertyDie,
          propertyFormula: this.propertyFormula,
          propertyMode: this.propertyMode,
          propertyDamageType: this.propertyDamageType,
          propertyEndOnHealing: this.propertyEndOnHealing,
        }, this.configuration);
      } catch {
        return this.configuration;
      }
    }
  };
}

function createPropertyRule(
  kind: Exclude<WeaponPropertyKind, 'none'>,
  formData: WeaponFormData | Record<string, unknown> | FormData,
  previous: WeaponRuleDefinition | undefined,
  existingRules: readonly WeaponRuleDefinition[],
): WeaponRuleDefinition {
  const ruleId = previous?.ruleId ?? uniqueRuleId(`homebrew.${kind}`, existingRules);
  const stackingGroup = previous?.stackingGroup ?? `homebrew.${kind}`;
  let params: WeaponRuleParams;
  if (kind === 'deadly') {
    params = { dice: integerField(formData, 'propertyDice', integerOr(previous?.params.dice, 1), 1, 20), die: dieField(formData, 'propertyDie', integerOr(previous?.params.die, 8)) };
  } else if (kind === 'fatal') {
    params = { dice: 1, die: dieField(formData, 'propertyDie', integerOr(previous?.params.die, 8)) };
  } else {
    const formula = String(field(formData, 'propertyFormula', previous?.params.formula ?? '1d6') ?? '').trim();
    if (!formula) throw new Error('Critical bleeding requires a damage formula.');
    const mode = String(field(formData, 'propertyMode', previous?.params.mode ?? 'damage')) === 'hpLoss' ? 'hpLoss' : 'damage';
    const damageType = String(field(formData, 'propertyDamageType', previous?.params.damageType ?? 'slashing') ?? '').trim().toLowerCase();
    if (mode === 'damage' && !/^[a-z][a-z0-9-]{0,31}$/.test(damageType)) throw new Error('Critical bleeding damage type is invalid.');
    params = { formula, mode, ...(mode === 'damage' ? { damageType } : {}), endOnHealing: booleanField(formData, 'propertyEndOnHealing', previous?.params.endOnHealing !== false) };
  }
  const candidate: WeaponRuleDefinition = {
    ruleId,
    kind: kind as WeaponRuleKind,
    label: previous?.label ?? propertyLabel(kind),
    params,
    stackingGroup,
  };
  const parsed = parseWeaponRule(candidate);
  if (!parsed) throw new Error('The weapon property parameters are invalid.');
  return parsed;
}

function masteryOptions(configuration: WeaponConfiguration): Array<{ value: string; label: string; kind?: WeaponMasteryId; custom?: boolean; selected: boolean }> {
  const selected = configuration.mastery ?? 'native';
  const official = OFFICIAL_MASTERY_PRESETS.map((rule) => ({
    value: rule.ruleId,
    label: masteryDisplayLabel(rule.kind as WeaponMasteryId),
    kind: rule.kind as WeaponMasteryId,
    selected: selected === rule.ruleId,
  }));
  const copied = configuration.rules
    .filter((rule) => isWeaponMasteryId(rule.kind) && !rule.ruleId.startsWith('dnd2024.'))
    .map((rule) => ({ value: rule.ruleId, label: rule.label, kind: rule.kind as WeaponMasteryId, custom: true, selected: selected === rule.ruleId }));
  return [{ value: 'native', label: 'Native / 原生', selected: selected === 'native' }, ...official, ...copied];
}

function propertyDisplayLabel(kind: WeaponPropertyKind): string {
  if (kind === 'none') return 'None / 无';
  if (kind === 'criticalBleeding') return 'Critical bleeding / 重击流血';
  return `${kind[0]!.toUpperCase()}${kind.slice(1)} / ${kind}`;
}

function masteryDisplayLabel(kind: WeaponMasteryId): string {
  const chinese: Record<WeaponMasteryId, string> = {
    cleave: '劈砍', graze: '擦伤', nick: '轻灵', push: '推离',
    sap: '震荡', slow: '减速', topple: '绊倒', vex: '扰敌',
  };
  const official = officialMasteryRule(kind).label;
  return `${official} / ${chinese[kind]}`;
}

function dependencyContext(state: WeaponDependencyState): { ready: boolean; issues: string[] } {
  const issues = [
    ...(state.missing ?? []).map((entry) => typeof entry === 'string' ? entry : entry.message || entry.label || entry.id),
    ...(state.errors ?? []),
  ];
  return { ready: state.ready, issues };
}

async function readDependencies(api: WeaponMasteryPropertiesApi): Promise<WeaponDependencyState> {
  if (typeof api.dependencies !== 'function') return { ready: true, missing: [], errors: [] };
  try {
    return normalizeDependencyState(await api.dependencies());
  } catch (error) {
    return { ready: false, missing: [], errors: [errorMessage(error)] };
  }
}

async function readEffectReadback(api: WeaponMasteryPropertiesApi, actors: any[]): Promise<{ actors: any[]; errors: string[] }> {
  if (typeof api.effects !== 'function') return { actors: [], errors: [] };
  const output: any[] = [];
  const errors: string[] = [];
  for (const actor of actors) {
    try {
      const entries = await api.effects(actor);
      output.push({
        uuid: actorUuid(actor),
        name: String(actor?.name ?? 'Actor'),
        effects: [...(entries ?? [])].map((entry) => ({
          ...entry,
          id: String(entry?.id ?? ''),
          label: String(entry?.label ?? entry?.kind ?? entry?.ruleId ?? 'Weapon effect'),
          summary: String(entry?.summary ?? ''),
          source: String(entry?.source ?? entry?.sourceUuid ?? 'Unknown source'),
        })),
      });
    } catch (error) {
      errors.push(`${String(actor?.name ?? 'Actor')}: ${errorMessage(error)}`);
    }
  }
  return { actors: output, errors };
}

function safeConfiguration(api: WeaponMasteryPropertiesApi, item: any): { configuration: WeaponConfiguration; error?: string } {
  try {
    const value = api.configuration(item);
    if (value === null || value === undefined) return { configuration: defaultWeaponConfiguration() };
    const parsed = parseWeaponConfiguration(value);
    if (!parsed) return { configuration: defaultWeaponConfiguration(), error: 'Saved weapon configuration is invalid and was not loaded.' };
    return { configuration: parsed };
  } catch (error) {
    return { configuration: defaultWeaponConfiguration(), error: errorMessage(error) };
  }
}

function collectionValues(value: any): any[] {
  if (!value) return [];
  if (Array.isArray(value)) return [...value];
  if (Array.isArray(value.contents)) return [...value.contents];
  if (typeof value.values === 'function') return [...value.values()];
  if (typeof value !== 'string' && typeof value[Symbol.iterator] === 'function') return [...value];
  if (typeof value === 'object') return Object.values(value);
  return [];
}

function uniqueByUuid(values: any[]): any[] {
  const seen = new Set<string>();
  return values.filter((value) => {
    const uuid = actorUuid(value);
    if (seen.has(uuid)) return false;
    seen.add(uuid);
    return true;
  });
}

function isWeaponItem(item: any): boolean {
  return item?.type === 'weapon' || item?.system?.type === 'weapon';
}

function actorUuid(actor: any): string {
  return String(actor?.uuid ?? actor?.id ?? actor?._id ?? 'actor');
}

function itemUuid(item: any, fallback: string): string {
  return String(item?.uuid ?? item?.document?.uuid ?? item?.id ?? item?._id ?? fallback);
}

function field(data: any, key: string, fallback?: unknown): unknown {
  if (data && typeof data.get === 'function') return data.get(key) ?? fallback;
  return data?.[key] ?? fallback;
}

function booleanField(data: any, key: string, fallback = false): boolean {
  const value = field(data, key, undefined);
  if (value === undefined || value === null || value === '') return fallback;
  if (Array.isArray(value)) return value.some((entry) => booleanField({ [key]: entry }, key, false));
  if (typeof value === 'boolean') return value;
  return ['true', '1', 'on', 'yes'].includes(String(value).trim().toLowerCase());
}

function integerField(data: any, key: string, fallback: number, min: number, max: number): number {
  const value = Number(field(data, key, fallback));
  if (!Number.isInteger(value) || value < min || value > max) throw new Error(`${key} must be an integer between ${min} and ${max}.`);
  return value;
}

function dieField(data: any, key: string, fallback: number): number {
  const value = integerField(data, key, fallback, 4, 12);
  if (!(WEAPON_DIE_FACES as readonly number[]).includes(value)) throw new Error(`${key} must be d4, d6, d8, d10, or d12.`);
  return value;
}

function integerOr(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isInteger(value) ? value : fallback;
}

function weaponBaseFormula(item: any): string {
  const base = item?.system?.damage?.base ?? item?.system?.damage ?? {};
  if (typeof base?.formula === 'string' && base.formula.trim()) return base.formula.trim();
  const number = Number(base?.number ?? 1);
  const die = String(base?.denomination ?? base?.die ?? '6').replace(/^d/i, '');
  const formula = `${Number.isFinite(number) && number > 0 ? Math.floor(number) : 1}d${die}`;
  const bonus = typeof base?.bonus === 'string' && base.bonus.trim() ? ` ${base.bonus.trim()}` : '';
  return `${formula}${bonus}`;
}

function doubleWeaponDice(formula: string): string {
  const match = formula.match(/^\s*(\d+)\s*d\s*(\d+)(.*)$/i);
  if (!match) return `${formula} + ${formula}`;
  return `${Number(match[1]) * 2}d${match[2]}${match[3]}`.trim();
}

function replaceFirstWeaponDie(formula: string, die: number): string {
  return formula.replace(/(\d+)\s*d\s*(\d+)/i, `2d${die}`);
}

function propertyLabel(kind: Exclude<WeaponPropertyKind, 'none'>): string {
  return kind === 'criticalBleeding' ? 'Critical bleeding' : kind[0]!.toUpperCase() + kind.slice(1);
}

function uniqueRuleId(base: string, rules: readonly WeaponRuleDefinition[]): string {
  const used = new Set(rules.map((rule) => rule.ruleId));
  let candidate = base;
  let index = 2;
  while (used.has(candidate)) candidate = `${base}.${index++}`;
  return trimIdentifier(candidate);
}

function slugifyIdentifier(value: string): string {
  const slug = value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  if (!slug) return 'rule';
  if (slug.split('-').some((part) => ['__proto__', 'constructor', 'prototype'].includes(part))) return `rule-${slug}`;
  return /^[a-z]/.test(slug) ? slug : `rule-${slug}`;
}

function trimIdentifier(value: string): string {
  return value.length <= 120 ? value : value.slice(0, 120).replace(/[-_.]+$/g, '') || 'homebrew.rule';
}

function isDependencyIssue(value: unknown): value is WeaponDependencyIssue {
  return Boolean(value && typeof value === 'object' && typeof (value as any).id === 'string');
}

function isDependencyEntry(value: unknown): value is { id: string; ready: boolean; label?: string; error?: string } {
  return Boolean(value && typeof value === 'object' && typeof (value as any).id === 'string' && typeof (value as any).ready === 'boolean');
}

function readElementValue(application: any, name: string): string | undefined {
  const input = application?.element?.querySelector?.(`[name="${name}"]`);
  return input && 'value' in input ? String(input.value) : undefined;
}

function dependencyMessage(state: WeaponDependencyState): string {
  const context = dependencyContext(state);
  return context.issues.length ? `Dependencies are not ready: ${context.issues.join('; ')}` : 'Dependencies are not ready.';
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function notify(globals: any, error: unknown): void {
  globals?.ui?.notifications?.error?.(errorMessage(error));
}
