import {
  decodeConfiguredConditionCatalog,
  decodeConfiguredConditionDefinition,
  configuredConditionFingerprint,
  type ConfiguredConditionDefinition,
  type ConfiguredConditionReference,
} from '@fvtt-json-generator/contracts/configured-conditions';
import { CONDITION_DEFINITIONS } from '@fvtt-json-generator/contracts/conditions';
import { readConditionInstance } from '@fvtt-json-generator/contracts/conditions';
import { NATIVE_LIFECYCLE_STATUS_DEFINITIONS } from '@fvtt-json-generator/contracts/status-lifecycle';
import { ensureNativeStatusRiders } from '@fvtt-json-generator/forge-browser-runtime/native-status-riders';
import { MODULE_ID } from './constants.ts';
import { localizedConditionLabel } from './localization.ts';
import { genericConditionsSupported } from './runtime-compatibility.ts';
import type { ConditionRuntime } from './runtime.ts';
import zh from './lang/zh-CN.json';

export const CONFIGURED_CATALOG_SETTING = 'configuredCatalog';

interface OwnerFlag {
  schemaVersion: 1;
  instanceId: string;
  definitionId: string;
  fingerprint: string;
}
interface RootFlag extends OwnerFlag { definition: ConfiguredConditionDefinition; source?: string; skippedComponents?: string[] }

export interface ConfiguredConditionEntry {
  id: string;
  instanceId: string;
  definitionId: string;
  fingerprint: string;
  definition: ConfiguredConditionDefinition;
  disabled: boolean;
  componentIds: string[];
  skippedComponents: string[];
  effect: any;
}
export interface ConfiguredApplyOptions { instanceId?: string; source?: string; origin?: string }

/** The catalog is world data; applied effects retain their own immutable definition snapshot. */
export class ConfiguredConditionRuntime {
  #catalogQueue: Promise<void> = Promise.resolve();
  #actorQueues = new Map<string, Promise<void>>();

  constructor(readonly globals: any, readonly isActiveGM: () => boolean, readonly conditions: ConditionRuntime) {}

  catalog(): ConfiguredConditionDefinition[] {
    const get = this.globals.game?.settings?.get;
    const raw = typeof get === 'function' ? get.call(this.globals.game.settings, MODULE_ID, CONFIGURED_CATALOG_SETTING) : [];
    return decodeConfiguredConditionCatalog(raw);
  }

  async save(value: ConfiguredConditionDefinition): Promise<ConfiguredConditionDefinition> {
    this.requireGM();
    const definition = decodeConfiguredConditionDefinition(value);
    return this.catalogOperation(async () => {
      this.requireGM();
      const current = this.catalog();
      const next = decodeConfiguredConditionCatalog([...current.filter(item => item.id !== definition.id), definition]);
      this.rejectReservedAliases(next);
      await this.globals.game.settings.set(MODULE_ID, CONFIGURED_CATALOG_SETTING, next);
      return definition;
    });
  }

  async delete(id: string): Promise<void> {
    this.requireGM();
    if (typeof id !== 'string' || !/^configured\.[a-z][a-z0-9-]{0,63}$/u.test(id)) throw new TypeError('Invalid configured condition ID.');
    await this.catalogOperation(async () => {
      this.requireGM();
      const current = this.catalog();
      if (!current.some(item => item.id === id)) throw new Error('Configured condition no longer exists.');
      await this.globals.game.settings.set(MODULE_ID, CONFIGURED_CATALOG_SETTING, current.filter(item => item.id !== id));
    });
  }

  list(actor: any): ConfiguredConditionEntry[] {
    if (!actor || actor.documentName !== 'Actor' || !genericConditionsSupported(this.globals.game)) return [];
    const effects = collection(actor.effects);
    return effects.flatMap(effect => {
      const flag = readRoot(effect);
      if (!flag) return [];
      const componentIds = effects.filter(child => sameOwner(readComponent(child), flag)).map(effectId);
      return [{ id: effectId(effect), instanceId: flag.instanceId, definitionId: flag.definitionId,
        fingerprint: flag.fingerprint, definition: flag.definition, disabled: effect.disabled === true,
        componentIds, skippedComponents: flag.skippedComponents ?? [], effect }];
    });
  }

  async apply(actor: any, ref: ConfiguredConditionReference, options: ConfiguredApplyOptions = {}): Promise<any> {
    this.requireGM(actor);
    const instanceId = options.instanceId ?? randomId();
    if (!/^[A-Za-z0-9][A-Za-z0-9_-]{0,95}$/u.test(instanceId)) throw new TypeError('Invalid configured instance ID.');
    for (const value of [options.source, options.origin]) {
      if (value !== undefined && (typeof value !== 'string' || value.length > 4000)) throw new TypeError('Invalid configured source.');
    }
    return this.actorOperation(actor, async () => {
      this.requireGM(actor);
      const existing = this.list(actor).find(item => item.instanceId === instanceId);
      if (existing) {
        if (existing.definitionId === ref?.id && existing.fingerprint === ref?.fingerprint) return existing.effect;
        throw new Error('Configured instance ID already belongs to a different definition.');
      }
      if (collection(actor.effects).some(effect => effect?.flags?.[MODULE_ID]?.configuredRoot?.instanceId === instanceId
        || effect?.flags?.[MODULE_ID]?.configuredComponent?.instanceId === instanceId)) throw new Error('Configured instance ID is already present.');
      // A catalog edit while queued must fail before creating any documents.
      const definition = this.resolve(ref);
      const owner: OwnerFlag = { schemaVersion: 1, instanceId, definitionId: definition.id,
        fingerprint: configuredConditionFingerprint(definition) };
      const skippedComponents = definition.components.flatMap(component => component.kind === 'native-condition'
        && nativeImmune(actor, component.status) ? [component.status] : []);
      const effective = definition.components.filter(component => component.kind !== 'native-condition'
        || !skippedComponents.includes(component.status));
      if (!effective.length) throw new Error(`目标免疫 ${skippedComponents.join('、')}，组合状态没有可施加的机制。`);
      const root: RootFlag = { ...owner, definition, ...(options.source ? { source: options.source } : {}),
        ...(skippedComponents.length ? { skippedComponents } : {}) };
      const rootData: Record<string, any> = {
        name: definition.name, type: 'base', img: 'icons/svg/aura.svg',
        description: definition.description, disabled: false, transfer: false, showIcon: 2,
        statuses: [], changes: movementChanges(definition, this.globals.game?.system?.version, actor),
        origin: options.origin || null,
        flags: { [MODULE_ID]: { configuredRoot: root } },
      };
      const children: any[] = [];
      const nativeIndexes: Array<{ index: number; status: string }> = [];
      for (const [index, component] of definition.components.entries()) {
        if (component.kind === 'movement-reduction') continue;
        if (component.kind === 'builtin-condition') {
          const data: any = this.conditions.configuredComponentData(component.conditionId, component.params,
            `${instanceId}_${index}`, `${definition.name} · ${CONDITION_DEFINITIONS[component.conditionId].label}`,
            options.origin, options.source);
          data.flags[MODULE_ID].configuredComponent = { ...owner, componentIndex: index };
          children.push(data);
          continue;
        }
        if (skippedComponents.includes(component.status)) continue;
        const data = await nativeComponentData(this.globals, actor, component.status, definition.name,
          { ...owner, componentIndex: index });
        children.push(data);
        nativeIndexes.push({ index, status: component.status });
      }
      let created: any[] | undefined;
      try {
        created = await actor.createEmbeddedDocuments?.('ActiveEffect', [rootData, ...children], {
          keepId: true, [MODULE_ID]: { managed: true, configured: true },
        });
      } catch (error) {
        // A failed batch may still have committed some documents; identify only
        // our just-created owner marker, never another effect on the Actor.
        const partial = collection(actor.effects).filter(effect => sameOwner(readRoot(effect) ?? readComponent(effect), owner)).map(effectId);
        if (partial.length) await actor.deleteEmbeddedDocuments?.('ActiveEffect', partial, { [MODULE_ID]: { managed: true, configured: true } });
        throw error;
      }
      if (!Array.isArray(created) || created.length !== 1 + children.length) {
        const ids = (Array.isArray(created) ? created : []).map(effectId).filter(Boolean);
        if (ids.length) await actor.deleteEmbeddedDocuments?.('ActiveEffect', ids, { [MODULE_ID]: { managed: true, configured: true } });
        throw new Error('Configured condition effect creation was incomplete.');
      }
      let rootEffect: any;
      try {
        const roots = created.filter(effect => sameOwner(readRoot(effect), owner));
        if (roots.length !== 1) throw new Error('Configured condition root identity is incomplete.');
        rootEffect = roots[0];
        for (const native of nativeIndexes) {
          const primaries = created.filter(effect => sameOwner(readComponent(effect), owner)
            && effect.flags[MODULE_ID].configuredComponent.componentIndex === native.index);
          if (primaries.length !== 1) throw new Error('Configured native component identity is incomplete.');
          await ensureNativeStatusRiders({
            actor, primary: primaries[0], status: native.status,
            configurationFor: id => configuredStatusEffect(this.globals.CONFIG?.statusEffects, id),
            dae: this.globals.game?.modules?.get?.('dae'),
            assertLive: () => this.requireGM(actor),
            record: (type, detail) => this.globals.console?.info?.(`[${MODULE_ID}] ${type}`, detail),
          });
        }
        await this.conditions.configuredComponentsCreated(actor,
          definition.components.flatMap(component => component.kind === 'builtin-condition' ? [component.conditionId] : []));
      } catch (error) {
        await actor.deleteEmbeddedDocuments?.('ActiveEffect', created.map(effectId), { [MODULE_ID]: { managed: true, configured: true } });
        throw error;
      }
      if (skippedComponents.length) this.globals.ui?.notifications?.warn?.(`目标免疫 ${skippedComponents.join('、')}；其他机制已施加。`);
      return rootEffect;
    });
  }

  async remove(actor: any, instanceId: string): Promise<void> {
    this.requireGM(actor);
    if (typeof instanceId !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,95}$/u.test(instanceId)) throw new TypeError('Invalid configured instance ID.');
    await this.actorOperation(actor, async () => {
      this.requireGM(actor);
      const entry = this.list(actor).find(item => item.instanceId === instanceId);
      const ids = entry ? [entry.id, ...entry.componentIds]
        : collection(actor.effects).filter(effect => readComponent(effect)?.instanceId === instanceId).map(effectId);
      if (!ids.length) return;
      await actor.deleteEmbeddedDocuments?.('ActiveEffect', ids, {
        [MODULE_ID]: { managed: true, configured: true },
      });
    });
  }

  /** Foundry's post-delete hook cleans remaining components when a GM deletes the root on the Actor sheet. */
  async onRootDeleted(rootEffect: any): Promise<void> {
    const owner = readRoot(rootEffect);
    const actor = rootEffect?.parent;
    if (!owner || actor?.documentName !== 'Actor' || !this.isActiveGM()) return;
    await this.actorOperation(actor, async () => {
      this.requireGM(actor);
      const effects = collection(actor.effects);
      if (effects.some(effect => sameOwner(readRoot(effect), owner))) return;
      const ids = effects.filter(effect => sameOwner(readComponent(effect), owner)).map(effectId);
      if (ids.length) await actor.deleteEmbeddedDocuments?.('ActiveEffect', ids, {
        [MODULE_ID]: { managed: true, configured: true },
      });
    });
  }

  /** A sheet toggle of the root has the same effect on its owned mechanisms. */
  async onRootUpdated(rootEffect: any, changed: any, options: any): Promise<void> {
    if (options?.[MODULE_ID]?.configured === true || typeof changed?.disabled !== 'boolean') return;
    const owner = readRoot(rootEffect);
    const actor = rootEffect?.parent;
    if (!owner || actor?.documentName !== 'Actor' || !this.isActiveGM()) return;
    await this.actorOperation(actor, async () => {
      this.requireGM(actor);
      const effects = collection(actor.effects);
      const currentRoot = effects.find(effect => effectId(effect) === effectId(rootEffect) && sameOwner(readRoot(effect), owner));
      if (!currentRoot) return;
      const disabled = currentRoot.disabled === true;
      const updates = effects.filter(effect => sameOwner(readComponent(effect), owner) && (effect.disabled === true) !== disabled)
        .map(effect => ({ _id: effectId(effect), disabled,
          ...(readConditionInstance(effect) ? { [`flags.${MODULE_ID}.condition.enabled`]: !disabled } : {}) }));
      if (updates.length) await actor.updateEmbeddedDocuments?.('ActiveEffect', updates, {
        [MODULE_ID]: { managed: true, configured: true },
      });
    });
  }

  async setEnabled(actor: any, instanceId: string, enabled: boolean): Promise<void> {
    this.requireGM(actor);
    if (typeof enabled !== 'boolean') throw new TypeError('enabled must be a boolean.');
    await this.actorOperation(actor, async () => {
      this.requireGM(actor);
      const entry = this.list(actor).find(item => item.instanceId === instanceId);
      if (!entry) throw new Error('Configured condition instance no longer exists.');
      const ids = [entry.id, ...entry.componentIds];
      const before = collection(actor.effects).filter(effect => ids.includes(effectId(effect)))
        .map(effect => ({ _id: effectId(effect), disabled: effect.disabled === true,
          ...(readConditionInstance(effect) ? { [`flags.${MODULE_ID}.condition.enabled`]: effect?.flags?.[MODULE_ID]?.condition?.enabled !== false } : {}) }));
      const effectsById = new Map(collection(actor.effects).map(effect => [effectId(effect), effect]));
      try { await actor.updateEmbeddedDocuments?.('ActiveEffect', ids.map(_id => ({ _id, disabled: !enabled,
        ...(readConditionInstance(effectsById.get(_id)) ? { [`flags.${MODULE_ID}.condition.enabled`]: enabled } : {}) })), {
        [MODULE_ID]: { managed: true, configured: true },
      }); } catch (error) {
        if (before.length) await actor.updateEmbeddedDocuments?.('ActiveEffect', before, { [MODULE_ID]: { managed: true, configured: true } });
        throw error;
      }
    });
  }

  private resolve(ref: ConfiguredConditionReference): ConfiguredConditionDefinition {
    if (!ref || typeof ref.id !== 'string' || !/^configured\.[a-z][a-z0-9-]{0,63}$/u.test(ref.id)
      || typeof ref.fingerprint !== 'string' || !/^[a-f0-9]{64}$/u.test(ref.fingerprint)) throw new TypeError('Invalid configured condition reference.');
    const definition = this.catalog().find(item => item.id === ref.id);
    if (!definition || configuredConditionFingerprint(definition) !== ref.fingerprint) throw new Error('Configured condition is missing or has changed; review this source before applying.');
    return definition;
  }

  private rejectReservedAliases(definitions: ConfiguredConditionDefinition[]): void {
    const reserved = new Set<string>();
    for (const [id, value] of Object.entries(NATIVE_LIFECYCLE_STATUS_DEFINITIONS)) {
      reserved.add(id.toLocaleLowerCase('en-US'));
      for (const name of value.sourceNames) reserved.add(name.toLocaleLowerCase('en-US'));
    }
    for (const [id, value] of Object.entries(CONDITION_DEFINITIONS)) {
      reserved.add(id.toLocaleLowerCase('en-US'));
      reserved.add(value.label.toLocaleLowerCase('en-US'));
      reserved.add(localizedConditionLabel(id as keyof typeof CONDITION_DEFINITIONS, this.globals).toLocaleLowerCase('en-US'));
      const chinese = (zh as Record<string, string>)[`FVTTCONDITIONS.Condition.${id}.Name`];
      if (chinese) reserved.add(chinese.toLocaleLowerCase('en-US'));
    }
    for (const definition of definitions) for (const alias of definition.aliases) {
      if (reserved.has(alias.toLocaleLowerCase('en-US'))) throw new Error(`Source name ${alias} conflicts with an existing condition.`);
    }
  }

  private requireGM(actor?: any): void {
    if (!genericConditionsSupported(this.globals.game)) throw new Error('Configured conditions are unsupported on this Core/dnd5e runtime.');
    if (!this.isActiveGM()) throw new Error('Only the active GM may change configured conditions.');
    if (actor !== undefined && actor?.documentName !== 'Actor') throw new Error('Select an Actor.');
  }

  private catalogOperation<T>(operation: () => Promise<T>): Promise<T> {
    const run = this.#catalogQueue.catch(() => undefined).then(operation);
    this.#catalogQueue = run.then(() => undefined, () => undefined);
    return run;
  }

  private actorOperation<T>(actor: any, operation: () => Promise<T>): Promise<T> {
    const key = String(actor.uuid ?? actor.id);
    const run = (this.#actorQueues.get(key) ?? Promise.resolve()).catch(() => undefined).then(operation);
    const tail = run.then(() => undefined, () => undefined);
    this.#actorQueues.set(key, tail);
    void tail.finally(() => { if (this.#actorQueues.get(key) === tail) this.#actorQueues.delete(key); });
    return run;
  }
}

function readRoot(effect: any): RootFlag | undefined {
  const value = effect?.flags?.[MODULE_ID]?.configuredRoot;
  if (!value || value.schemaVersion !== 1 || typeof value.instanceId !== 'string'
    || typeof value.definitionId !== 'string' || typeof value.fingerprint !== 'string') return undefined;
  try {
    const definition = decodeConfiguredConditionDefinition(value.definition);
    if (definition.id !== value.definitionId || configuredConditionFingerprint(definition) !== value.fingerprint) return undefined;
    return { ...value, definition };
  } catch { return undefined; }
}
function readComponent(effect: any): OwnerFlag | undefined {
  const value = effect?.flags?.[MODULE_ID]?.configuredComponent;
  return value?.schemaVersion === 1 && typeof value.instanceId === 'string'
    && typeof value.definitionId === 'string' && typeof value.fingerprint === 'string' ? value : undefined;
}
function sameOwner(left: OwnerFlag | undefined, right: OwnerFlag): boolean {
  return !!left && left.instanceId === right.instanceId && left.definitionId === right.definitionId && left.fingerprint === right.fingerprint;
}
function collection(value: any): any[] {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.contents)) return value.contents;
  if (typeof value?.values === 'function') return [...value.values()];
  if (value && typeof value === 'object') return Object.values(value);
  return [];
}
function effectId(effect: any): string { return String(effect?.id ?? effect?._id ?? ''); }
function randomId(): string { return globalThis.crypto?.randomUUID?.().replace(/-/g, '') ?? `configured_${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`; }
function randomDocumentId(): string {
  return globalThis.crypto?.randomUUID?.().replace(/-/g, '').slice(0, 16)
    ?? `${Math.random().toString(36).slice(2)}${Math.random().toString(36).slice(2)}`.slice(0, 16).padEnd(16, '0');
}
function movementChanges(definition: ConfiguredConditionDefinition, systemVersion: string | undefined, actor: any): Array<Record<string, unknown>> {
  const component = definition.components.find(item => item.kind === 'movement-reduction');
  if (!component || component.kind !== 'movement-reduction') return [];
  const units = String(actor?.system?.attributes?.movement?.units ?? 'ft').toLowerCase();
  if (units !== 'ft' && units !== 'm') throw new Error(`未知移动单位 ${units}；请先确认目标的速度单位。`);
  // Match the reviewed dnd5e 5.3.3 movement convention used by Weapon Effects.
  const reduction = units === 'm' ? Math.round(component.feet * 3 / 10 * 1000) / 1000 : component.feet;
  return (['walk', 'burrow', 'climb', 'fly', 'swim'] as const).map(speed => systemVersion === '6.0.5'
    ? { key: `system.attributes.movement.speeds.${speed}`, type: 'add', value: `-${reduction}` }
    : { key: `system.attributes.movement.${speed}`, mode: 2, value: `-${reduction}`, priority: null });
}

function nativeImmune(actor: any, status: string): boolean {
  const values = actor?.system?.traits?.ci?.value;
  return typeof values?.has === 'function' ? values.has(status) : Array.isArray(values) && values.includes(status);
}

function configuredStatusEffect(statusEffects: any, status: string): any | undefined {
  return collection(statusEffects).find(effect => effect?.id === status);
}

async function nativeComponentData(globals: any, actor: any, status: string, name: string,
  owner: OwnerFlag & { componentIndex: number }): Promise<Record<string, unknown>> {
  const configured = configuredStatusEffect(globals.CONFIG?.statusEffects, status);
  if (!configured) throw new Error(`Foundry 缺少原生状态 ${status}。`);
  const getDocumentClass = globals.foundry?.utils?.getDocumentClass;
  const ActiveEffect = typeof getDocumentClass === 'function'
    ? getDocumentClass.call(globals.foundry.utils, 'ActiveEffect')
    : globals.CONFIG?.ActiveEffect?.documentClass ?? globals.ActiveEffect;
  if (typeof ActiveEffect?.fromStatusEffect !== 'function') throw new Error('Foundry 原生 ActiveEffect 状态工厂不可用。');
  const document = await ActiveEffect.fromStatusEffect(status, { parent: actor });
  if (!document?.updateSource || !document?.toObject) throw new Error('Foundry 原生状态工厂未返回可保存效果。');
  const source = document.toObject();
  document.updateSource({ _id: randomDocumentId(), name: `${name} · ${String(document.name ?? configured.name ?? status)}`,
    flags: { ...(source.flags ?? {}), [MODULE_ID]: { ...(source.flags?.[MODULE_ID] ?? {}), configuredComponent: owner } } });
  return document.toObject();
}
