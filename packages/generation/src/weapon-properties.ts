import {
  WEAPON_PROPERTIES_MODULE_ID,
  isWeaponMasteryId,
  parseWeaponConfiguration,
  weaponConfigurationFlags,
  weaponCriticalBonus,
  type WeaponConfiguration,
} from '@fvtt-json-generator/contracts/weapon-properties';
import type { EffectProfile, FvttTargetVersion } from '@fvtt-json-generator/contracts/target';

export interface WeaponPropertiesProjectionOptions {
  configuration?: WeaponConfiguration;
  nativeMastery?: string;
  /** Actor structured-action logical path used to bind the output Item back to its source. */
  sourceLogicalPath?: string;
  effectProfile: EffectProfile;
  targetVersion: FvttTargetVersion;
}

/**
 * Project an explicitly configured weapon into a Foundry Item or embedded
 * Actor Item.  The function is intentionally idempotent: it may be called by
 * both the Activity and Item generation paths without adding a second Deadly
 * die or a second review paragraph.
 */
export function projectWeaponProperties(
  item: Record<string, any>,
  options: WeaponPropertiesProjectionOptions,
): void {
  if (!item || typeof item !== 'object') return;

  const nativeMastery = options.nativeMastery?.trim();
  if (nativeMastery && !isWeaponMasteryId(nativeMastery)) {
    throw new Error(`InvalidNativeWeaponMastery: unknown native mastery "${nativeMastery}".`);
  }
  if (nativeMastery) {
    item.system ??= {};
    item.system.mastery = nativeMastery;
  }

  const rawConfiguration = options.configuration;
  if (!rawConfiguration) {
    removeWeaponPropertyContributions(item);
    if (item.flags?.fvttJsonGenerator) {
      delete item.flags.fvttJsonGenerator.weaponProperties;
    }
    if (item.flags?.[WEAPON_PROPERTIES_MODULE_ID]) {
      delete item.flags[WEAPON_PROPERTIES_MODULE_ID];
    }
    if (nativeMastery && options.sourceLogicalPath) {
      const generatorFlags = ((item.flags ??= {}).fvttJsonGenerator ??= {});
      generatorFlags.weaponPropertiesSource = { logicalPath: options.sourceLogicalPath };
    } else if (item.flags?.fvttJsonGenerator) {
      delete item.flags.fvttJsonGenerator.weaponPropertiesSource;
    }
    return;
  }
  const configuration = parseWeaponConfiguration(rawConfiguration);
  if (!configuration) {
    throw new Error('InvalidWeaponConfiguration: generation requires a valid WeaponConfiguration.');
  }

  const generatorFlags = ((item.flags ??= {}).fvttJsonGenerator ??= {});
  generatorFlags.weaponProperties = {
    schemaVersion: configuration.schemaVersion,
    enabled: configuration.enabled,
    mastery: configuration.mastery,
    grantMastery: configuration.grantMastery,
    rules: configuration.rules,
    ...(nativeMastery ? { nativeMastery } : {}),
  };
  if (options.sourceLogicalPath) {
    generatorFlags.weaponPropertiesSource = {
      logicalPath: options.sourceLogicalPath,
    };
  }

  // A core export carries auditable source configuration, but does not ask
  // core to execute module-only effects.  The self-owned module receives the
  // exact shared contract under its fixed `.weapon` flag key.
  if (options.effectProfile === 'modded-v14') {
    Object.assign(item.flags, weaponConfigurationFlags(configuration));
  } else if (item.flags?.[WEAPON_PROPERTIES_MODULE_ID]) {
    delete item.flags[WEAPON_PROPERTIES_MODULE_ID];
  }

  if (!configuration.enabled) {
    removeWeaponPropertyContributions(item);
    return;
  }

  const selectedMastery = resolveSelectedNativeMastery(configuration.mastery);
  if (!nativeMastery && selectedMastery) {
    item.system ??= {};
    item.system.mastery = selectedMastery;
  }

  const criticalBonus = weaponCriticalBonus(configuration);
  if (criticalBonus) {
    for (const activity of Object.values(item.system?.activities ?? {}) as any[]) {
      if (activity?.type !== 'attack') continue;
      mergeWeaponCriticalBonus(activity, criticalBonus, configuration);
    }
  }

  if (options.effectProfile === 'core') {
    const unsupported = configuration.rules.filter((rule) =>
      rule.kind === 'fatal' || rule.kind === 'criticalBleeding');
    for (const rule of unsupported) {
      appendCoreReviewDescription(item, rule.kind, rule.label, options.targetVersion);
    }
  }
}

/** Add a Deadly contribution once while preserving every source bonus. */
export function mergeWeaponCriticalBonus(
  activity: Record<string, any>,
  bonus: string,
  configuration?: WeaponConfiguration,
): void {
  if (!activity || typeof activity !== 'object' || !bonus.trim()) return;
  activity.damage ??= { parts: [], includeBase: true };
  activity.damage.critical ??= {};
  let existing = typeof activity.damage.critical.bonus === 'string'
    ? activity.damage.critical.bonus.trim()
    : '';
  const rule = configuration?.rules.find((candidate) => candidate.kind === 'deadly');
  const contribution = activity.flags?.fvttJsonGenerator?.weaponPropertyContributions?.deadly;
  if (contribution && typeof contribution.bonus === 'string') {
    if (rule && contribution.ruleId === rule.ruleId && contribution.bonus === bonus && hasDiceTerm(existing, bonus)) {
      return;
    }
    existing = removeOneDiceTerm(existing, contribution.bonus);
  }
  activity.damage.critical.bonus = existing ? `${existing} + ${bonus}` : bonus;

  if (rule) {
    const flags = ((activity.flags ??= {}).fvttJsonGenerator ??= {});
    flags.weaponPropertyContributions = {
      ...(flags.weaponPropertyContributions ?? {}),
      deadly: { ruleId: rule.ruleId, bonus },
    };
  }
}

function hasDiceTerm(formula: string, term: string): boolean {
  return formula.split(/\s*\+\s*/u).some((candidate) => candidate.trim() === term.trim());
}

function removeOneDiceTerm(formula: string, term: string): string {
  const parts = formula.split(/\s*\+\s*/u);
  const index = parts.findIndex((candidate) => candidate.trim() === term.trim());
  if (index < 0) return formula.trim();
  parts.splice(index, 1);
  return parts.map((part) => part.trim()).filter(Boolean).join(' + ');
}

function removeWeaponPropertyContributions(item: Record<string, any>): void {
  for (const activity of Object.values(item.system?.activities ?? {}) as any[]) {
    const contribution = activity?.flags?.fvttJsonGenerator?.weaponPropertyContributions?.deadly;
    if (!contribution || typeof contribution.bonus !== 'string') continue;
    const current = typeof activity.damage?.critical?.bonus === 'string'
      ? activity.damage.critical.bonus
      : '';
    if (activity.damage?.critical) {
      const remaining = removeOneDiceTerm(current, contribution.bonus);
      if (remaining) activity.damage.critical.bonus = remaining;
      else delete activity.damage.critical.bonus;
    }
    const contributionFlags = activity.flags.fvttJsonGenerator.weaponPropertyContributions;
    delete contributionFlags.deadly;
    if (Object.keys(contributionFlags).length === 0) delete activity.flags.fvttJsonGenerator.weaponPropertyContributions;
    if (Object.keys(activity.flags.fvttJsonGenerator).length === 0) delete activity.flags.fvttJsonGenerator;
    if (Object.keys(activity.flags).length === 0) delete activity.flags;
  }
}

function resolveSelectedNativeMastery(value: WeaponConfiguration['mastery']): string | undefined {
  if (!value || value === 'native' || !value.startsWith('dnd2024.')) return undefined;
  const mastery = value.slice('dnd2024.'.length);
  return /^[a-z][a-z0-9-]*$/u.test(mastery) ? mastery : undefined;
}

function appendCoreReviewDescription(
  item: Record<string, any>,
  kind: string,
  label: string,
  targetVersion: FvttTargetVersion,
): void {
  const sentence = kind === 'fatal'
    ? `${label}: Fatal changes only the weapon base die on a critical and requires fvtt-weapon-mastery-properties; core output leaves the base damage unchanged.`
    : `${label}: critical bleeding requires fvtt-weapon-mastery-properties and its condition API; core output preserves this as GM-assisted text.`;
  item.system ??= {};
  item.system.description ??= { value: '', chat: '' };
  const current = String(item.system.description.value ?? '');
  const encoded = escapeHtml(sentence);
  const rendered = `<p><strong>GM review:</strong> ${encoded}</p>`;
  if (current.includes(sentence) || current.includes(rendered)) return;
  item.system.description.value = targetVersion === '14'
    ? `${current}${current ? '\n' : ''}${rendered}`
    : `${current}${current ? '\n' : ''}GM review: ${sentence}`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
