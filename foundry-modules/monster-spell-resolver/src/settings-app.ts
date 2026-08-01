import { RESOLVER_MODULE_ID } from '../../../src/core/spell-resolution/types';
import type { SpellResolutionConfiguration } from '../../../src/core/spell-resolution';
import { projectResolverRuntimeDiagnostics, type ResolverRuntimeApi } from './runtime-api';

export interface ResolverSettingsContextInput {
  sourcePriority: SpellResolutionConfiguration['sourcePriority'];
  debugLogging: boolean;
  runtime?: ResolverRuntimeApi;
}

export interface ResolverSettingsFormValue {
  sourcePriority: SpellResolutionConfiguration['sourcePriority'];
  debugLogging: boolean;
}

interface RulesCounts {
  spellCount: number;
  rules2024Count: number;
  rules2014Count: number;
  unknownRulesCount: number;
}

export function buildResolverSettingsContext(input: ResolverSettingsContextInput) {
  const candidates = input.runtime?.sourceIndex?.candidates ?? [];
  const counts = new Map<string, RulesCounts>();
  const packCounts = new Map<string, { collection?: string; packageId: string; packageVersion?: string; packId: string } & RulesCounts>();
  for (const pack of input.runtime?.sourceIndex?.sourcePacks ?? []) {
    const key = JSON.stringify([pack.packageId, pack.packId]);
    packCounts.set(key, {
      collection: pack.collection,
      packageId: pack.packageId,
      packageVersion: pack.packageVersion,
      packId: pack.packId,
      ...emptyRulesCounts(),
    });
  }
  for (const candidate of candidates) {
    const packageCounts = counts.get(candidate.packageId) ?? emptyRulesCounts();
    incrementRulesCounts(packageCounts, candidate.rules);
    counts.set(candidate.packageId, packageCounts);
    const key = JSON.stringify([candidate.packageId, candidate.packId]);
    const current = packCounts.get(key) ?? { packageId: candidate.packageId, packId: candidate.packId, ...emptyRulesCounts() };
    incrementRulesCounts(current, candidate.rules);
    packCounts.set(key, current);
  }
  return {
    priority: input.sourcePriority.map((entry, index) => ({
      index,
      packageId: entry.packageId,
      packId: entry.packId ?? '',
      canMoveUp: index > 0,
      canMoveDown: index < input.sourcePriority.length - 1,
    })),
    packages: (input.runtime?.sourceIndex?.sourcePackages ?? []).map((entry) => ({
      ...entry,
      ...(counts.get(entry.packageId) ?? emptyRulesCounts()),
    })),
    packs: [...packCounts.values()].sort((left, right) => JSON.stringify([left.packageId, left.packId])
      .localeCompare(JSON.stringify([right.packageId, right.packId]), 'en')),
    debugLogging: input.debugLogging,
    canRebuild: input.runtime?.compatibility.supported === true && typeof input.runtime.rebuildSourceIndex === 'function',
    compatible: input.runtime?.compatibility.supported === true,
    candidateCount: candidates.length,
    diagnosticCount: input.runtime?.diagnostics?.length ?? 0,
    sourceDiagnostics: projectResolverRuntimeDiagnostics(input.runtime),
    rebuildFailed: input.runtime?.diagnostics?.some((entry) => entry.code === 'SOURCE_INDEX_FAILED') === true,
    rebuildBlocked: input.runtime?.diagnostics?.some((entry) => 'blocking' in entry && entry.blocking === true) === true,
  };
}

export async function rebuildResolverIndexFromSettings(
  runtime: ResolverRuntimeApi | undefined,
  notify: (level: 'info' | 'error', message: string) => void,
  localize: (key: string) => string,
): Promise<boolean> {
  try {
    if (typeof runtime?.rebuildSourceIndex !== 'function') throw new Error('Resolver source-index rebuild is unavailable.');
    const sourceIndex = await runtime.rebuildSourceIndex();
    if (sourceIndex.diagnostics.some((entry) => entry.blocking)) {
      notify('error', localize('FVTTJSONSPELL.Settings.RebuildBlocked'));
      return false;
    }
    notify('info', localize('FVTTJSONSPELL.Settings.RebuildComplete'));
    return true;
  } catch {
    notify('error', localize('FVTTJSONSPELL.Settings.RebuildFailed'));
    return false;
  }
}

export function parseResolverSettingsForm(values: Record<string, unknown>): ResolverSettingsFormValue {
  return { sourcePriority: readPriorityRows(values, true), debugLogging: values.debugLogging === true || values.debugLogging === 'on' };
}

function readPriorityRows(values: Record<string, unknown>, strict: boolean): SpellResolutionConfiguration['sourcePriority'] {
  const rows = new Map<number, { packageId?: string; packId?: string }>();
  for (const [key, value] of Object.entries(values)) {
    const match = /^priority\.(\d+)\.(packageId|packId)$/.exec(key);
    if (!match) continue;
    const row = rows.get(Number(match[1])) ?? {};
    row[match[2] as 'packageId' | 'packId'] = String(value ?? '').trim();
    rows.set(Number(match[1]), row);
  }
  const sourcePriority = [...rows.entries()].sort(([left], [right]) => left - right).map(([, row]) => {
    if (!row.packageId && strict) throw new TypeError('Every source priority row requires a package ID.');
    return row.packId ? { packageId: row.packageId, packId: row.packId } : { packageId: row.packageId };
  });
  return sourcePriority as SpellResolutionConfiguration['sourcePriority'];
}

/** Create the v14 public ApplicationV2 submenu lazily, after Foundry globals exist during init. */
export function createResolverSettingsApplicationClass(): any {
  const foundryGlobal = (globalThis as any).foundry;
  const ApplicationV2 = foundryGlobal?.applications?.api?.ApplicationV2;
  const HandlebarsApplicationMixin = foundryGlobal?.applications?.api?.HandlebarsApplicationMixin;
  if (!ApplicationV2 || typeof HandlebarsApplicationMixin !== 'function') {
    throw new Error('Foundry 14 ApplicationV2 and HandlebarsApplicationMixin are unavailable.');
  }

  return class ResolverSettingsApplication extends HandlebarsApplicationMixin(ApplicationV2) {
    static DEFAULT_OPTIONS = {
      id: 'fvtt-json-generator-spell-resolver-settings',
      tag: 'form',
      window: {
        title: 'FVTTJSONSPELL.Settings.Menu.Name',
        contentClasses: ['standard-form'],
        icon: 'fa-solid fa-wand-magic-sparkles',
      },
      position: { width: 720 },
      form: { closeOnSubmit: true, handler: this.onSubmit },
      actions: {
        addPriority: this.addPriority,
        removePriority: this.removePriority,
        movePriority: this.movePriority,
        rebuildIndex: this.rebuildIndex,
      },
    };

    static PARTS = {
      body: { template: `modules/${RESOLVER_MODULE_ID}/templates/settings.hbs` },
      footer: { template: 'templates/generic/form-footer.hbs' },
    };

    priority?: SpellResolutionConfiguration['sourcePriority'];

    async _prepareContext() {
      this.priority ??= readSourcePriority();
      return {
        ...buildResolverSettingsContext({
          sourcePriority: this.priority,
          debugLogging: (globalThis as any).game.settings.get(RESOLVER_MODULE_ID, 'debugLogging') === true,
          runtime: readRuntime(),
        }),
        buttons: [{ type: 'submit', icon: 'fa-solid fa-save', label: 'FVTTJSONSPELL.Settings.Save' }],
      };
    }

    static async onSubmit(_event: unknown, _form: unknown, formData: any) {
      const value = parseResolverSettingsForm(formData?.object ?? {});
      await (globalThis as any).game.settings.set(RESOLVER_MODULE_ID, 'sourcePriority', value.sourcePriority);
      await (globalThis as any).game.settings.set(RESOLVER_MODULE_ID, 'debugLogging', value.debugLogging);
    }

    static async addPriority(this: any, _event: unknown, target: any) {
      this.capturePriority(target);
      this.priority.push({ packageId: '' });
      await this.render({ force: true });
    }

    static async removePriority(this: any, _event: unknown, target: any) {
      this.capturePriority(target);
      this.priority.splice(readIndex(target), 1);
      await this.render({ force: true });
    }

    static async movePriority(this: any, _event: unknown, target: any) {
      this.capturePriority(target);
      const index = readIndex(target);
      const direction = target?.dataset?.direction === 'up' ? -1 : 1;
      const next = index + direction;
      if (next >= 0 && next < this.priority.length) [this.priority[index], this.priority[next]] = [this.priority[next], this.priority[index]];
      await this.render({ force: true });
    }

    static async rebuildIndex(this: any) {
      const i18n = (globalThis as any).game?.i18n;
      await rebuildResolverIndexFromSettings(
        readRuntime(),
        (level, message) => (globalThis as any).ui?.notifications?.[level]?.(message),
        (key) => i18n?.localize?.(key) ?? key,
      );
      await this.render({ force: true });
    }

    capturePriority(target: any) {
      const form = target?.closest?.('form') ?? this.element?.querySelector?.('form') ?? this.element;
      if (!form) return;
      const object = Object.fromEntries(new FormData(form as HTMLFormElement).entries());
      this.priority = readPriorityRows(object, false);
    }
  };
}

function emptyRulesCounts(): RulesCounts {
  return { spellCount: 0, rules2024Count: 0, rules2014Count: 0, unknownRulesCount: 0 };
}

function incrementRulesCounts(counts: RulesCounts, rules: unknown): void {
  counts.spellCount++;
  if (rules === '2024') counts.rules2024Count++;
  else if (rules === '2014') counts.rules2014Count++;
  else counts.unknownRulesCount++;
}

function readRuntime(): ResolverRuntimeApi | undefined {
  return (globalThis as any).game?.modules?.get?.(RESOLVER_MODULE_ID)?.api;
}

function readSourcePriority(): SpellResolutionConfiguration['sourcePriority'] {
  const value = (globalThis as any).game?.settings?.get?.(RESOLVER_MODULE_ID, 'sourcePriority');
  if (!Array.isArray(value)) return [];
  return value.map((entry) => ({ packageId: String(entry?.packageId ?? ''), ...(entry?.packId ? { packId: String(entry.packId) } : {}) }));
}

function readIndex(target: any): number {
  const index = Number(target?.dataset?.index);
  if (!Number.isSafeInteger(index) || index < 0) throw new TypeError('Invalid source priority row index.');
  return index;
}
