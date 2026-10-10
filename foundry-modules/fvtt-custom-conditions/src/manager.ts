import { genericConditionsSupported } from './runtime-compatibility.ts';
import {
  CONDITION_DEFINITIONS,
  createConditionInstance,
  type ConditionId,
  type ConditionParams,
} from '@fvtt-json-generator/contracts/conditions';
import { configuredConditionFingerprint, type ConfiguredConditionDefinition } from '@fvtt-json-generator/contracts/configured-conditions';
import { NATIVE_LIFECYCLE_STATUS_DEFINITIONS, type NativeLifecycleStatus } from '@fvtt-json-generator/contracts/status-lifecycle';
import { CONDITION_MANAGER_CONTROL_NAME, MODULE_ID } from './constants.ts';
import type { ConditionManagerOpenContext, CustomConditionsApi } from './api.ts';
import { conditionIconPath, localizedConditionDefinitions, localize } from './localization.ts';

const INJURY_MODULE_ID = 'fvtt-injury-fading-spirits' as const;
const MAX_INJURY_STACKS = 3;
const injuryChangeQueues = new Map<string, Promise<void>>();

interface InjuryPresentation {
  id: string;
  name: string;
  description: string;
  img: string;
}

interface InjuryApi {
  getState: (actor: any) => unknown | Promise<unknown>;
  setStacks: (actor: any, stacks: number, reason: string) => Promise<unknown> | unknown;
}

export function createConditionManagerApplicationClass(api?: CustomConditionsApi, globals: any = globalThis): any {
  const foundryApi = globals.foundry?.applications?.api;
  const ApplicationV2 = foundryApi?.ApplicationV2;
  const HandlebarsApplicationMixin = foundryApi?.HandlebarsApplicationMixin;
  if (typeof ApplicationV2 !== 'function') throw new Error('Foundry 14 ApplicationV2 is unavailable.');
  const Base = typeof HandlebarsApplicationMixin === 'function' ? HandlebarsApplicationMixin(ApplicationV2) : ApplicationV2;

  return class ConditionManagerApplication extends Base {
    static DEFAULT_OPTIONS = {
      id: `${MODULE_ID}-manager`, tag: 'form',
      window: { title: 'FVTTCONDITIONS.Manager.Title', contentClasses: ['standard-form'], icon: 'fa-solid fa-flask' },
      position: { width: 820, height: 720 },
      form: { closeOnSubmit: false, handler: this.onSubmit },
      actions: {
        refresh: this.refresh,
        remove: this.remove,
        toggle: this.toggle,
        edit: this.edit,
        escapeFrozen: this.escapeFrozen,
        increaseInjury: this.increaseInjury,
        decreaseInjury: this.decreaseInjury,
        openInjuryWizard: this.openInjuryWizard,
        openConfiguredEditor: this.openConfiguredEditor,
        applyConfigured: this.applyConfigured,
        removeConfigured: this.removeConfigured,
        toggleConfigured: this.toggleConfigured,
        escapeConfiguredFrozen: this.escapeConfiguredFrozen,
      },
    };

    static PARTS = {
      body: { template: `modules/${MODULE_ID}/templates/condition-manager.hbs` },
      footer: { template: 'templates/generic/form-footer.hbs' },
    };

    api: CustomConditionsApi;
    fixedActor: any | undefined;
    actors = captureTargets(globals);
    conditionId: ConditionId = 'bleeding';
    paramsJson = JSON.stringify(createConditionInstance('bleeding', { formula: '1d6' }).params, null, 2);
    escaping = false;
    sourceName = '';
    origin = '';
    editing: { actorUuid: string; effectId: string } | null = null;

    constructor(options?: { api?: CustomConditionsApi; context?: ConditionManagerOpenContext }) {
      super();
      this.api = options?.api ?? api ?? globals.game?.modules?.get?.(MODULE_ID)?.api;
      if (!this.api) throw new Error('Custom Conditions API is unavailable.');
      if (options?.context) {
        if (options.context.actor?.documentName !== 'Actor') throw new TypeError('Condition manager requires one Actor.');
        this.fixedActor = options.context.actor;
        this.actors = [this.fixedActor];
        if (options.context.conditionId) this.conditionId = options.context.conditionId;
        if (options.context.conditionId) this.paramsJson = JSON.stringify(hudParameterDraft(this.conditionId), null, 2);
      }
    }

    async _prepareContext() {
      const definitions = localizedConditionDefinitions(globals).map((definition) => ({ ...definition, selected: definition.id === this.conditionId }));
      const configuredDefinitions = this.api.configuredConditions?.catalog?.() ?? [];
      const actors = await Promise.all(this.actors.map(async (actor: any) => ({
        uuid: actor.uuid,
        name: actor.name,
        configuredConditions: (this.api.configuredConditions?.list?.(actor) ?? []).map((entry) => ({ ...entry,
          actorUuid: actor.uuid, name: entry.definition.name,
          skippedLabel: entry.skippedComponents.join('、'),
          frozenComponentId: entry.disabled ? '' : (this.api.list(actor).find((condition) =>
            entry.componentIds.includes(condition.id) && condition.instance.conditionId === 'frozen')?.id ?? ''),
        })),
        conditions: this.api.list(actor).filter((entry) => !entry.effect?.flags?.[MODULE_ID]?.configuredComponent).map((entry) => ({
          ...entry,
          actorUuid: actor.uuid,
          conditionLabel: localizedConditionDefinitions(globals).find((definition) => definition.id === entry.instance.conditionId)?.label
            ?? entry.instance.conditionId,
          img: conditionIconPath(entry.instance.conditionId),
          canEscapeFrozen: entry.instance.conditionId === 'frozen' && !entry.disabled,
          instanceJson: JSON.stringify(entry.instance, null, 2),
          paramsJson: JSON.stringify(entry.instance.params, null, 2),
        })),
      })));
      return {
        genericAvailable: genericConditionsSupported(globals.game),
        definitions,
        configuredDefinitions,
        conditionId: this.conditionId,
        paramsJson: this.paramsJson,
        sourceName: this.sourceName,
        origin: this.origin,
        actors,
        injury: await prepareInjuryContext(globals, this.actors),
        buttons: [{ type: 'submit', icon: 'fa-solid fa-flask', label: 'FVTTCONDITIONS.Manager.Apply' }],
      };
    }

    static async refresh(this: any) {
      this.actors = this.fixedActor ? [this.fixedActor] : captureTargets(globals);
      this.editing = null;
      await this.render({ force: true });
    }

    static async openConfiguredEditor(this: any) {
      try { await this.api.configuredConditions.openEditor(); }
      catch (error) { notify(globals, error); }
    }

    static async applyConfigured(this: any) {
      try {
        const id = String(new FormData(this.element).get('configuredDefinitionId') ?? '');
        const definition = this.api.configuredConditions.catalog().find((item: ConfiguredConditionDefinition) => item.id === id);
        if (!definition) throw new Error('请先选择一个已保存的组合状态。');
        if (!this.actors.length) throw new Error('请先标记或选中至少一个 Actor。');
        for (const actor of this.actors) await this.api.configuredConditions.apply(actor, {
          id: definition.id, fingerprint: configuredConditionFingerprint(definition),
        });
        await this.render({ force: true });
      } catch (error) { notify(globals, error); }
    }

    static async removeConfigured(this: any, _event: unknown, target: any) {
      const actor = this.actors.find((candidate: any) => candidate.uuid === target.dataset.actorUuid);
      if (!actor) return;
      try { await this.api.configuredConditions.remove(actor, target.dataset.instanceId); await this.render({ force: true }); }
      catch (error) { notify(globals, error); }
    }

    static async toggleConfigured(this: any, _event: unknown, target: any) {
      const actor = this.actors.find((candidate: any) => candidate.uuid === target.dataset.actorUuid);
      const entry = actor && this.api.configuredConditions.list(actor).find((item: any) => item.instanceId === target.dataset.instanceId);
      if (!entry) return;
      try { await this.api.configuredConditions.setEnabled(actor, entry.instanceId, entry.disabled); await this.render({ force: true }); }
      catch (error) { notify(globals, error); }
    }

    static async escapeConfiguredFrozen(this: any, event: unknown, target: any) {
      const actor = this.actors.find((candidate: any) => candidate.uuid === target.dataset.actorUuid);
      const entry = actor && this.api.configuredConditions.list(actor).find((item: any) => item.instanceId === target.dataset.instanceId);
      const frozenId = entry && !entry.disabled ? this.api.list(actor).find((condition: any) =>
        entry.componentIds.includes(condition.id) && condition.instance.conditionId === 'frozen')?.id : undefined;
      if (!frozenId) return;
      await this.constructor.escapeFrozen.call(this, event, { dataset: { actorUuid: actor.uuid, effectId: frozenId } });
    }

    static async edit(this: any, _event: unknown, target: any) {
      const actor = this.actors.find((candidate: any) => candidate.uuid === target.dataset.actorUuid);
      const entry = actor && this.api.list(actor).find((candidate: any) => candidate.id === target.dataset.effectId);
      if (!entry) return;
      this.conditionId = entry.instance.conditionId;
      this.paramsJson = JSON.stringify(entry.instance.params, null, 2);
      this.sourceName = entry.name;
      this.origin = entry.origin;
      this.editing = { actorUuid: actor.uuid, effectId: entry.id };
      await this.render({ force: true });
    }

    static async remove(this: any, _event: unknown, target: any) {
      const actor = this.actors.find((candidate: any) => candidate.uuid === target.dataset.actorUuid);
      if (!actor) return;
      try { await this.api.remove(actor, target.dataset.effectId); await this.render({ force: true }); }
      catch (error) { notify(globals, error); }
    }

    static async escapeFrozen(this: any, _event: unknown, target: any) {
      if (this.escaping) return;
      const actor = this.actors.find((candidate: any) => candidate.uuid === target.dataset.actorUuid);
      if (!actor) return;
      this.escaping = true;
      try {
        const helpers = [...new Map<string, any>((globals.canvas?.tokens?.controlled ?? [])
          .map((token: any) => token.actor)
          .filter((candidate: any) => candidate && candidate.uuid !== actor.uuid)
          .map((candidate: any) => [candidate.uuid, candidate] as [string, any])).values()];
        if (helpers.length > 1) throw new Error(globals.game?.i18n?.localize?.('FVTTCONDITIONS.Manager.OneHelper') ?? '请选择至多一个协助者。');
        await this.api.escapeFrozen(actor, target.dataset.effectId, helpers[0] ?? actor);
        await this.render({ force: true });
      } catch (error) { notify(globals, error); }
      finally { this.escaping = false; }
    }

    static async toggle(this: any, _event: unknown, target: any) {
      const actor = this.actors.find((candidate: any) => candidate.uuid === target.dataset.actorUuid);
      const entry = actor && this.api.list(actor).find((candidate: any) => candidate.id === target.dataset.effectId);
      if (!actor || !entry) return;
      try { await this.api.setEnabled(actor, entry.id, entry.disabled); await this.render({ force: true }); }
      catch (error) { notify(globals, error); }
    }

    static async increaseInjury(this: any, _event: unknown, target: any) {
      await changeInjury(this, target, 1, globals);
    }

    static async decreaseInjury(this: any, _event: unknown, target: any) {
      await changeInjury(this, target, -1, globals);
    }

    static async openInjuryWizard(this: any, _event: unknown, target: any) {
      const actor = this.actors.find((candidate: any) => candidate.uuid === target.dataset.actorUuid);
      const fadingModule = globals.game?.modules?.get?.(INJURY_MODULE_ID);
      const openResurrectionWizard = fadingModule?.active === true ? fadingModule.api?.openResurrectionWizard : undefined;
      if (!actor || typeof openResurrectionWizard !== 'function') return;
      try {
        await openResurrectionWizard(actor);
        await this.render({ force: true });
      } catch (error) { notify(globals, error); }
    }

    static async onSubmit(this: any, _event: unknown, _form: unknown, formData: any) {
      if (!genericConditionsSupported(globals.game)) return;
      try {
        const data = formData?.object ?? formData;
        const conditionId = String(data.conditionId) as ConditionId;
        const params = JSON.parse(String(data.paramsJson ?? '{}')) as ConditionParams;
        if (!this.actors.length) throw new Error('请先标记或选中至少一个 Actor。');
        if (this.editing) {
          const actor = this.actors.find((candidate: any) => candidate.uuid === this.editing.actorUuid);
          if (!actor) throw new Error('编辑目标不再存在。');
          await this.api.update(actor, this.editing.effectId, conditionId, params);
        } else {
          for (const actor of this.actors) await this.api.apply(actor, conditionId, params, {
            name: String(data.sourceName ?? '').trim() || undefined,
            origin: String(data.origin ?? '').trim() || undefined,
          });
        }
        this.editing = null;
        this.paramsJson = JSON.stringify(params, null, 2);
        await this.render({ force: true });
      } catch (error) { notify(globals, error); }
    }
  };
}

/** A HUD shortcut never supplies a required parameter on the GM's behalf. */
function hudParameterDraft(conditionId: ConditionId): ConditionParams {
  const params: ConditionParams = {};
  for (const parameter of CONDITION_DEFINITIONS[conditionId].parameters) {
    if (parameter.required && parameter.default === undefined) params[parameter.id] = '';
    else if (parameter.default !== undefined) params[parameter.id] = parameter.default;
  }
  return params;
}

export function readInjuryApi(globals: any = globalThis): InjuryApi | undefined {
  const module = globals.game?.modules?.get?.(MODULE_ID);
  const injuryApi = module?.active === true ? module.api?.injury : undefined;
  if (!injuryApi || typeof injuryApi !== 'object') return undefined;
  if (typeof injuryApi.getState !== 'function'
    || typeof injuryApi.setStacks !== 'function') return undefined;
  return injuryApi as InjuryApi;
}

export async function prepareInjuryContext(globals: any, actors: any[]): Promise<any> {
  const api = readInjuryApi(globals);
  if (!api) return { enabled: false, actors: [] };
  const presentation = injuryPresentation(globals);
  const entries = await Promise.all(actors.map(async (actor: any) => {
    try {
      const stacks = readInjuryStacks(await api.getState(actor), actor);
      return {
      actorUuid: actor.uuid,
      actorName: actor.name,
      stacks,
      maxStacks: MAX_INJURY_STACKS,
      canIncrease: stacks < MAX_INJURY_STACKS,
      canDecrease: stacks > 0,
      img: presentation.img,
      description: formatInjuryDescription(globals, stacks),
      };
    } catch (error) {
      return { actorUuid: actor.uuid, actorName: actor.name,
        error: error instanceof Error ? error.message : String(error) };
    }
  }));
  return {
    enabled: true,
    ...presentation,
    resurrectionAvailable: globals.game?.modules?.get?.(INJURY_MODULE_ID)?.active === true
      && typeof globals.game?.modules?.get?.(INJURY_MODULE_ID)?.api?.openResurrectionWizard === 'function',
    actors: entries,
  };
}

async function changeInjury(application: any, target: any, delta: number, globals: any): Promise<void> {
  const actor = application.actors.find((candidate: any) => candidate.uuid === target?.dataset?.actorUuid);
  if (!actor) return;
  const actorKey = String(actor.uuid ?? actor.id ?? '');
  if (!actorKey) return;
  const previous = injuryChangeQueues.get(actorKey) ?? Promise.resolve();
  const run = previous.catch(() => undefined).then(async () => {
    const injuryApi = readInjuryApi(globals);
    if (typeof injuryApi?.getState !== 'function' || typeof injuryApi.setStacks !== 'function') return;
    const stacks = readInjuryStacks(await injuryApi.getState(actor), actor);
    const next = Math.max(0, Math.min(MAX_INJURY_STACKS, stacks + delta));
    if (next !== stacks) await injuryApi.setStacks(actor, next, 'custom-conditions-manager');
    await application.render({ force: true });
  });
  const tail = run.then(() => undefined, () => undefined);
  injuryChangeQueues.set(actorKey, tail);
  void tail.finally(() => {
    if (injuryChangeQueues.get(actorKey) === tail) injuryChangeQueues.delete(actorKey);
  });
  try {
    await run;
  } catch (error) { notify(globals, error); }
}

function injuryPresentation(globals: any): InjuryPresentation {
  return {
    id: 'fvtt-injury',
    name: localize(globals, 'FVTTCONDITIONS.Injury.Name', 'Injury'),
    description: localize(globals, 'FVTTCONDITIONS.Injury.ManagerSummary',
      'Injury has 0–3 levels. Current levels are shown separately for each Actor below; the GM decides a third-level fall.'),
    img: `modules/${MODULE_ID}/icons/injury/injury-1.svg`,
  };
}

function formatInjuryDescription(globals: any, stacks: number): string {
  const description = localize(globals, 'FVTTCONDITIONS.Injury.Level', 'Injury {stacks}/{max}');
  const format = globals?.game?.i18n?.format;
  if (typeof format === 'function' && description.includes('{stacks}')) {
    try { return format.call(globals.game.i18n, 'FVTTCONDITIONS.Injury.Level', { stacks, max: MAX_INJURY_STACKS }); }
    catch { /* fall through to local placeholder replacement */ }
  }
  return description.replaceAll('{stacks}', String(stacks)).replaceAll('{max}', String(MAX_INJURY_STACKS));
}

function readInjuryStacks(state: any, actor: any): number {
  const raw = state?.stacks ?? actor?.flags?.[MODULE_ID]?.injury?.state?.stacks ?? 0;
  const value = Number(raw);
  return Number.isInteger(value) ? Math.max(0, Math.min(MAX_INJURY_STACKS, value)) : 0;
}

export async function openConditionManager(
  api: CustomConditionsApi,
  globals: any = globalThis,
  context?: ConditionManagerOpenContext,
): Promise<unknown> {
  const Application = createConditionManagerApplicationClass(api, globals);
  return new Application({ api, context }).render({ force: true });
}

export function captureTargets(globals: any): any[] {
  const targets = [...(globals.game?.user?.targets?.values?.() ?? globals.game?.user?.targets ?? [])];
  if (targets.length) return targets.map((target: any) => target.actor ?? target.document?.actor).filter(Boolean);
  return [...(globals.canvas?.tokens?.controlled ?? [])].map((token: any) => token.actor).filter(Boolean);
}

function notify(globals: any, error: unknown): void {
  globals.ui?.notifications?.error?.(error instanceof Error ? error.message : String(error));
}

type MechanismDraft = { kind: 'builtin-condition'; conditionId: ConditionId; params: ConditionParams }
  | { kind: 'native-condition'; status: NativeLifecycleStatus }
  | { kind: 'movement-reduction'; feet: number | string };
interface DefinitionDraft {
  id: string; name: string; description: string; englishAliases: string; chineseAliases: string;
  components: MechanismDraft[];
}

function blankDefinition(): DefinitionDraft {
  return { id: '', name: '', description: '', englishAliases: '', chineseAliases: '',
    components: [{ kind: 'builtin-condition', conditionId: 'sickened', params: {} }] };
}

function aliasLines(value: string): string[] {
  return value.split(/[\n,，;；]/u).map(part => part.trim()).filter(Boolean);
}

/** Consume ordinary form fields; the editor never asks a GM to write JSON or code. */
export function configuredDefinitionFromForm(data: Record<string, unknown>, count: number): ConfiguredConditionDefinition {
  const name = String(data.name ?? '').trim();
  if (/[()（）]/u.test(name) || !/[\u3400-\u9fff]\s+[A-Za-z]/u.test(name)) {
    throw new Error('显示名称请按“中文 English”填写，中间用空格分隔，不使用括号。');
  }
  const english = aliasLines(String(data.englishAliases ?? ''));
  const chinese = aliasLines(String(data.chineseAliases ?? ''));
  if (!english.length || !chinese.length) throw new Error('请分别填写英文和中文的原文名称。');
  const slug = String(data.slug ?? '').trim() || english[0]!.toLowerCase().replace(/[^a-z0-9]+/gu, '-').replace(/^-|-$/gu, '');
  const components: ConfiguredConditionDefinition['components'] = [];
  for (let index = 0; index < count; index += 1) {
    const kind = String(data[`component-${index}-kind`] ?? '');
    if (kind === 'movement-reduction') {
      components.push({ kind, feet: Number(data[`component-${index}-feet`]) });
      continue;
    }
    if (kind === 'native-condition') {
      components.push({ kind, status: String(data[`component-${index}-status`] ?? '') as NativeLifecycleStatus });
      continue;
    }
    if (kind !== 'builtin-condition') throw new Error('未知机制类型。');
    const conditionId = String(data[`component-${index}-conditionId`] ?? '') as ConditionId;
    const definition = CONDITION_DEFINITIONS[conditionId];
    if (!definition) throw new Error('请选择已有状态机制。');
    const params: ConditionParams = {};
    for (const parameter of definition.parameters) {
      const raw = data[`component-${index}-param-${parameter.id}`];
      if (raw === undefined || raw === '') continue;
      params[parameter.id] = parameter.type === 'number' ? Number(raw)
        : parameter.type === 'boolean' ? raw === 'true' : String(raw);
    }
    components.push({ kind, conditionId, params });
  }
  return {
    schemaVersion: 1, id: `configured.${slug}`, name,
    description: String(data.description ?? '').trim(), aliases: [...english, ...chinese], components,
  };
}

export function createConfiguredEditorApplicationClass(api?: CustomConditionsApi, globals: any = globalThis): any {
  const foundryApi = globals.foundry?.applications?.api;
  const ApplicationV2 = foundryApi?.ApplicationV2;
  const HandlebarsApplicationMixin = foundryApi?.HandlebarsApplicationMixin;
  if (typeof ApplicationV2 !== 'function') throw new Error('Foundry 14 ApplicationV2 is unavailable.');
  const Base = typeof HandlebarsApplicationMixin === 'function' ? HandlebarsApplicationMixin(ApplicationV2) : ApplicationV2;
  return class ConfiguredEditorApplication extends Base {
    static DEFAULT_OPTIONS = {
      id: `${MODULE_ID}-configured-editor`, tag: 'form',
      window: { title: 'FVTTCONDITIONS.Configured.Title', contentClasses: ['standard-form'], icon: 'fa-solid fa-puzzle-piece' },
      position: { width: 860, height: 780 },
      actions: { newDefinition: this.newDefinition, editDefinition: this.editDefinition,
        saveDefinition: this.saveDefinition, deleteDefinition: this.deleteDefinition,
        addMechanism: this.addMechanism, removeMechanism: this.removeMechanism },
    };
    static PARTS = { body: { template: `modules/${MODULE_ID}/templates/configured-editor.hbs` } };
    api: CustomConditionsApi;
    draft: DefinitionDraft = blankDefinition();
    editingId: string | null = null;

    constructor(options?: { api?: CustomConditionsApi }) {
      super();
      this.api = options?.api ?? api ?? globals.game?.modules?.get?.(MODULE_ID)?.api;
      if (!this.api?.configuredConditions) throw new Error('Configured Conditions API is unavailable.');
    }

    async _prepareContext() {
      const choices = localizedConditionDefinitions(globals);
      const mechanisms = this.draft.components.map((component, index) => ({
        index, kind: component.kind,
        builtin: component.kind === 'builtin-condition',
        movement: component.kind === 'movement-reduction',
        native: component.kind === 'native-condition',
        nativeChoices: Object.entries(NATIVE_LIFECYCLE_STATUS_DEFINITIONS).map(([id, value]) => ({
          id, label: `${value.label} ${id}`, selected: component.kind === 'native-condition' && component.status === id,
        })),
        feet: component.kind === 'movement-reduction' ? component.feet : '',
        choices: choices.map(item => ({ ...item, selected: component.kind === 'builtin-condition' && component.conditionId === item.id })),
        parameters: component.kind === 'builtin-condition'
          ? CONDITION_DEFINITIONS[component.conditionId].parameters.map(parameter => ({
            ...parameter,
            value: component.params[parameter.id] ?? parameter.default ?? '',
            isSelect: parameter.type === 'select' || parameter.type === 'boolean',
            isNumber: parameter.type === 'number',
            isBoolean: parameter.type === 'boolean',
            choices: (parameter.type === 'boolean' ? ['true', 'false'] : parameter.options ?? []).map(value => ({
              value, selected: String(component.params[parameter.id] ?? parameter.default ?? '') === value,
            })),
          })) : [],
      }));
      return { draft: this.draft, editing: !!this.editingId, definitions: this.api.configuredConditions.catalog(), mechanisms };
    }

    _onRender(...args: any[]) {
      super._onRender?.(...args);
      this.element?.querySelectorAll?.('select[data-mechanism-choice]')?.forEach((select: any) => {
        select.addEventListener('change', async () => {
          this.captureDraft();
          const index = Number(select.dataset.index);
          if (select.dataset.mechanismChoice === 'kind') this.draft.components[index] = select.value === 'movement-reduction'
            ? { kind: 'movement-reduction', feet: 10 }
            : select.value === 'native-condition' ? { kind: 'native-condition', status: 'blinded' }
              : { kind: 'builtin-condition', conditionId: 'sickened', params: {} };
          if (select.dataset.mechanismChoice === 'conditionId') this.draft.components[index] = {
            kind: 'builtin-condition', conditionId: select.value as ConditionId, params: {},
          };
          await this.render({ force: true });
        });
      });
    }

    captureDraft(): void {
      if (!this.element || typeof FormData !== 'function') return;
      const data = Object.fromEntries(new FormData(this.element).entries());
      const previous = this.draft;
      const components = previous.components.map((component, index): MechanismDraft => {
        const kind = String(data[`component-${index}-kind`] ?? component.kind);
        if (kind === 'movement-reduction') return { kind, feet: String(data[`component-${index}-feet`] ?? '10') };
        if (kind === 'native-condition') return { kind, status: String(data[`component-${index}-status`] ?? 'blinded') as NativeLifecycleStatus };
        const conditionId = String(data[`component-${index}-conditionId`] ?? (component.kind === 'builtin-condition' ? component.conditionId : 'sickened')) as ConditionId;
        const params: ConditionParams = {};
        for (const parameter of CONDITION_DEFINITIONS[conditionId]?.parameters ?? []) {
          const value = data[`component-${index}-param-${parameter.id}`];
          if (value === undefined || value === '') continue;
          params[parameter.id] = parameter.type === 'number' ? Number(value)
            : parameter.type === 'boolean' ? value === 'true' : String(value);
        }
        return { kind: 'builtin-condition', conditionId, params };
      });
      this.draft = { id: previous.id, name: String(data.name ?? ''), description: String(data.description ?? ''),
        englishAliases: String(data.englishAliases ?? ''), chineseAliases: String(data.chineseAliases ?? ''), components };
    }

    static async newDefinition(this: any) { this.draft = blankDefinition(); this.editingId = null; await this.render({ force: true }); }

    static async editDefinition(this: any, _event: unknown, target: any) {
      const definition = this.api.configuredConditions.catalog().find((item: ConfiguredConditionDefinition) => item.id === target.dataset.definitionId);
      if (!definition) return;
      this.editingId = definition.id;
      this.draft = { id: definition.id, name: definition.name, description: definition.description,
        englishAliases: definition.aliases.filter((alias: string) => /[A-Za-z]/u.test(alias)).join('\n'),
        chineseAliases: definition.aliases.filter((alias: string) => !/[A-Za-z]/u.test(alias)).join('\n'),
        components: structuredClone(definition.components) };
      await this.render({ force: true });
    }

    static async saveDefinition(this: any) {
      try {
        this.captureDraft();
        const data = Object.fromEntries(new FormData(this.element).entries());
        const definition = configuredDefinitionFromForm({ ...data,
          slug: this.editingId?.slice('configured.'.length) ?? '' }, this.draft.components.length);
        if (!this.editingId && this.api.configuredConditions.catalog().some((item: ConfiguredConditionDefinition) => item.id === definition.id)) {
          throw new Error('这个英文名称已对应一个已保存状态；请从左侧选择它进行编辑。');
        }
        const saved = await this.api.configuredConditions.save(definition);
        this.editingId = saved.id;
        await this.render({ force: true });
      } catch (error) { notify(globals, error); }
    }

    static async deleteDefinition(this: any, _event: unknown, target: any) {
      try {
        await this.api.configuredConditions.delete(target.dataset.definitionId);
        if (this.editingId === target.dataset.definitionId) { this.editingId = null; this.draft = blankDefinition(); }
        await this.render({ force: true });
      } catch (error) { notify(globals, error); }
    }

    static async addMechanism(this: any) {
      this.captureDraft();
      this.draft.components.push({ kind: 'builtin-condition', conditionId: 'sickened', params: {} });
      await this.render({ force: true });
    }

    static async removeMechanism(this: any, _event: unknown, target: any) {
      this.captureDraft();
      this.draft.components.splice(Number(target.dataset.index), 1);
      await this.render({ force: true });
    }
  };
}

export async function openConfiguredEditor(api: CustomConditionsApi, globals: any = globalThis): Promise<unknown> {
  const Editor = createConfiguredEditorApplicationClass(api, globals);
  return new Editor({ api }).render({ force: true });
}
