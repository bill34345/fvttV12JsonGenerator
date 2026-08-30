import type { ActionData, Damage } from '@fvtt-json-generator/models/action';
import { spellsMapper } from './spellsMapper';
import { inferAttackAbility, type AttackAbility } from './attack-ability';
import { deriveSaveDc, type DcSourceKind } from './activity-derivation';
import { mapDamageType } from './actor-text';
import { getFoundryTarget, type FvttTargetVersion } from './target';
import { createStableDocumentId } from './stableId';
import { resolveLockedDnd5eV14Spell } from './v14SpellCatalog';

/** Compatibility-only fixed UUID lookup used by pre-Intake Item Markdown. */
const LEGACY_SPELL_UUIDS: Record<string, string> = {
  invisibility: 'Compendium.dnd5e.spells.Item.1N8dDMMgZ1h1YJ3B',
};

export interface ActivityGenerationContext {
  abilities?: Partial<Record<AttackAbility, number>>;
  proficiencyBonus?: number;
  spellcastingAbility?: AttackAbility;
  dcSourceKind?: DcSourceKind;
  preferNativeWeaponRolls?: boolean;
  /** Source Item Effect to be applied by an Activity (for example, token light). */
  appliedEffectId?: string;
}

export class ActivityGenerator {
  private readonly fvttVersion: FvttTargetVersion;

  public constructor(options: { fvttVersion?: FvttTargetVersion } = {}) {
    this.fvttVersion = options.fvttVersion ?? '12';
  }

  public generate(action: ActionData, context: ActivityGenerationContext = {}): Record<string, any> {
    const activities: Record<string, any> = {};
    const id = this.generateId({
      path: action.logicalPath ?? action.name,
      type: action.type,
      action,
    });

    if (action.light) {
      if (!context.appliedEffectId) {
        throw new Error(`Light action "${action.name}" is missing its Item Effect reference.`);
      }
      activities[id] = {
        _id: id,
        type: 'utility',
        activation: {
          type: action.light.activation,
          value: action.light.activation === 'free' ? 0 : 1,
          override: false,
        },
        consumption: {
          targets: [],
          scaling: { allowed: false, max: '' },
          spellSlot: false,
        },
        effects: [{ _id: context.appliedEffectId }],
        duration: {
          units: 'inst',
          concentration: false,
          override: false,
        },
        range: { units: 'self', special: '', override: false },
        target: {
          template: { count: '', contiguous: false, type: '', size: '', width: '', height: '', units: '' },
          affects: { count: '', type: 'self', choice: false, special: '' },
          prompt: false,
          override: false,
        },
        uses: { spent: 0, recovery: [], max: '' },
      };
    } else if (action.attack) {
      const nativeRoll = this.inferNativeWeaponRoll(action, context);
      const explicitAbility = action.attack.ability;
      const primaryDamage = nativeRoll ? action.attack.damage[0] : undefined;
      activities[id] = {
        _id: id,
        type: 'attack',
        attack: {
          ability: nativeRoll?.ability ?? explicitAbility ?? '',
          bonus: nativeRoll || explicitAbility ? '' : `${action.attack.toHit}`,
          flat: !(nativeRoll || explicitAbility),
          type: {
            value: action.attack.type,
            classification: action.attack.type.endsWith('sak') ? 'spell' : 'weapon'
          }
        },
        damage: {
          parts: (nativeRoll ? action.attack.damage.slice(1) : action.attack.damage).map(d => this.formatDamage(d)),
          includeBase: true,
          ...(action.attack.versatile ? { versatile: this.formatDamage({ formula: action.attack.versatile.formula, type: action.attack.damage[0]?.type || '' }) } : {})
        },
        ...(nativeRoll && primaryDamage ? {
          flags: {
            fvttJsonGenerator: {
              nativeWeaponRoll: {
                ability: nativeRoll.ability,
                baseDamage: this.formatDamage(primaryDamage, { omitBonus: true })
              }
            }
          }
        } : {})
      };
      activities[id].range = this.buildAttackRange(action.attack);
      activities[id].target = this.buildTargetSchema();
    } else if (action.save) {
      const nativeSaveDc = this.inferNativeSaveDc(action, context);
      activities[id] = {
        _id: id,
        type: 'save',
        save: {
          ability: [action.save.ability],
          dc: this.buildSaveDc(action.save.dc, nativeSaveDc?.calculation)
        },
        damage: {
          ...(this.isV14() ? {
            onSave: (action.damage?.length ?? 0) > 0
              ? this.resolveSaveDamageResult(action.save.outcome, action.save.onSave)
              : 'none',
          } : {}),
          parts: (action.damage || []).map(d => this.formatDamage(d))
        },
        ...(action.aoe?.template ? {
          target: {
            prompt: true,
            override: false,
            template: {
              count: '',
              contiguous: false,
              type: action.aoe.template.type,
              size: action.aoe.template.distance,
              width: '',
              height: '',
              units: 'ft',
            },
            affects: { count: '', type: '', choice: false, special: '' },
          },
        } : {}),
      };
    } else if (action.type === 'heal' && action.healing) {
      activities[id] = {
        _id: id,
        type: 'heal',
        healing: this.formatHealing(action.healing),
        target: {
          override: false,
          prompt: false,
          template: { count: '', contiguous: false, type: '', size: '', width: '', height: '', units: 'ft' },
          affects: { count: '1', type: 'self', choice: false, special: '' },
        },
      };
    } else if (action.damage && action.damage.length > 0) {
      activities[id] = {
        _id: id,
        type: 'damage',
        damage: {
          parts: action.damage.map(d => this.formatDamage(d))
        }
      };
    } else if (action.type === 'spell' && action.spellName) {
      // item-mechanics is the formal V14 Item Intake contract.  It carries a
      // canonical identifier, so an unresolved spell must fail the formal
      // promotion rather than becoming a misleading Utility Activity.  The
      // older strict Markdown routes intentionally keep their established
      // best-effort fallback below; they have no evidence-gated identifier.
      const isFormalItemIntakeSpell = Boolean(action.spellIdentifier);
      const lockedSpell = action.spellIdentifier
        ? resolveLockedDnd5eV14Spell(action.spellIdentifier, action.englishName ?? action.spellName)
        : undefined;
      let spellInfo = isFormalItemIntakeSpell ? undefined : spellsMapper.get(action.spellName);
      if (!isFormalItemIntakeSpell && !spellInfo && action.englishName) {
        spellInfo = spellsMapper.get(action.englishName);
      }
      
      if (!spellInfo) {
        const lookupName = action.spellIdentifier || action.englishName || action.spellName;
        const foundaryUuid = lockedSpell?.uuid
          ?? (!isFormalItemIntakeSpell ? LEGACY_SPELL_UUIDS[lookupName.toLowerCase()] : undefined);
        
        if (foundaryUuid) {
          activities[id] = {
            _id: id,
            type: 'cast',
            spell: {
              uuid: foundaryUuid,
            },
            activation: {
              type: action.useAction?.activation || 'action',
              value: 1,
              override: false,
            },
            consumption: {
              targets: this.itemUseTargets(
                isFormalItemIntakeSpell ? (action.useAction?.consumption ?? 0) : (action.useAction?.consumption || 1),
              ),
              scaling: { allowed: false, max: '' },
              spellSlot: !isFormalItemIntakeSpell,
            },
            duration: {
              units: 'inst',
              concentration: false,
              override: false
            },
            range: { override: false },
            target: { template: { contiguous: false, units: 'ft' }, affects: { choice: false }, override: false, prompt: true },
            uses: { spent: 0, recovery: [], max: '' },
          };
        } else if (!isFormalItemIntakeSpell) {
          activities[id] = {
            _id: id,
            type: 'utility',
            activation: {
              type: action.useAction?.activation || 'action',
              value: 1,
              override: false,
            },
            consumption: {
              targets: this.itemUseTargets(action.useAction?.consumption || 1),
              scaling: { allowed: false, max: '' },
              spellSlot: false,
            },
            duration: {
              units: 'inst',
              concentration: false,
              override: false,
            },
            range: { override: false },
            target: { template: { contiguous: false, units: 'ft' }, affects: { choice: false }, override: false, prompt: true },
            uses: { spent: 0, recovery: [], max: '' },
          };
        } else {
          throw new Error(`Unable to uniquely resolve dnd5e spell "${lookupName}" for Item Activity.`);
        }
      } else {
        activities[id] = {
          _id: id,
          type: 'cast',
          spell: {
            uuid: spellInfo.sourceId,
          },
          activation: {
            type: action.useAction?.activation || 'action',
            value: 1,
            override: false,
          },
          consumption: {
            targets: this.itemUseTargets(
              isFormalItemIntakeSpell ? (action.useAction?.consumption ?? 0) : (action.useAction?.consumption || 1),
            ),
            scaling: { allowed: false, max: '' },
            spellSlot: !isFormalItemIntakeSpell,
          },
          duration: {
            units: 'inst',
            concentration: false,
            override: false
          },
          range: { override: false },
          target: { template: { contiguous: false, units: 'ft' }, affects: { choice: false }, override: false, prompt: true },
          uses: { spent: 0, recovery: [], max: '' },
        };
      }
    } else if (action.type === 'use' && action.useAction) {
      const consumptionTargets = action.useAction.limitedUses?.max
        ? [{
            type: 'activityUses',
            target: '',
            value: '1',
            scaling: { mode: '', formula: '' }
          }]
        : action.useAction.consumption > 0
        ? [{
            type: 'itemUses',
            target: '',
            value: action.useAction.consumption.toString(),
            scaling: { mode: '', formula: '' }
          }]
        : [];
      activities[id] = {
        _id: id,
        type: 'utility',
        activation: {
          type: action.useAction.activation,
          value: action.useAction.activation === 'free' ? 0 : 1,
          override: false,
        },
        consumption: {
          targets: consumptionTargets,
          scaling: { allowed: false, max: '' },
          spellSlot: false
        },
        duration: {
          units: 'inst',
          concentration: false,
          override: false
        },
        range: { units: 'self', special: '', override: false },
        target: { template: { count: '', contiguous: false, type: '', size: '', width: '', height: '', units: '' }, affects: { count: '', type: '', choice: false, special: '' }, prompt: true, override: false },
        uses: action.useAction.limitedUses ?? { spent: 0, recovery: [], max: '' },
      };
    } else if (action.type === 'effect' && action.passiveEffect) {
      if (action.passiveEffect.type === 'acBonus') {
        // Skip - handled by generatePassiveEffect() as Active Effect
      } else {
        activities[id] = {
          _id: id,
          type: 'utility',
          activation: {
            type: 'passive',
            value: null,
            override: false,
          },
          duration: {
            units: 'perm',
            concentration: false,
            override: false
          },
          range: { units: 'self', special: '', override: false },
          target: { template: { count: '', contiguous: false, type: '', size: '', width: '', height: '', units: '' }, affects: { count: '', type: 'self', choice: false, special: '' }, prompt: true, override: false },
          uses: { spent: 0, recovery: [], max: '' },
        };
      }
    } else {
      activities[id] = {
        _id: id,
        type: 'utility'
      };
    }

    if (action.recharge) {
      activities[id].uses = {
        spent: 0,
        max: "1",
        recovery: [
          { period: "recharge", type: "recoverAll", formula: action.recharge.value.toString() }
        ]
      };
    }

    if (action.target) {
      activities[id].target = {
        override: false,
        prompt: true,
        template: {
          count: 1,
          contiguous: false,
          type: action.target.type,
          size: action.target.value.toString(),
          width: "",
          height: "",
          units: action.target.units
        },
        affects: {
          count: "",
          type: "",
          choice: false,
          special: ""
        }
      };
    }

    const generatedActivity = activities[id];
    if (generatedActivity && action.desc) {
      generatedActivity.description = { chatFlavor: action.desc };
    }
    if (generatedActivity && action.activity?.duration) {
      generatedActivity.duration = {
        value: action.activity.duration.value,
        units: action.activity.duration.units,
        concentration: action.activity.duration.concentration,
        override: false,
      };
    }
    if (generatedActivity && action.activity?.range) {
      generatedActivity.range = {
        value: action.activity.range.value,
        units: action.activity.range.units,
        special: '',
        override: false,
      };
    }
    if (generatedActivity && action.activity?.target) {
      generatedActivity.target = {
        ...(generatedActivity.target ?? {}),
        template: {
          ...(generatedActivity.target?.template ?? {}),
          type: action.activity.target.template.type,
          size: action.activity.target.template.size,
          units: action.activity.target.template.units,
        },
      };
    }

    if (action.logicalPath) {
      for (const activity of Object.values(activities) as any[]) {
        const flags = (activity.flags ??= {});
        const ownFlags = (flags.fvttJsonGenerator ??= {});
        ownFlags.sourceLogicalPath = action.logicalPath;
      }
    }

    return activities;
  }

  public generateCast(spellUuid: string): Record<string, any> {
    const id = this.generateId({ type: 'cast', spellUuid });
    return {
      [id]: {
        _id: id,
        type: 'cast',
        spell: {
          uuid: spellUuid
        },
        sort: 0
      }
    };
  }

  public formatDamage(damage: Damage, options: { omitBonus?: boolean } = {}) {
    // dnd5e 4.0+ DamagePart: { number, denomination, bonus, types, custom }
    // OR Tuple: [formula, type] (Legacy but often supported)
    // Let's use Object format if we can parse the formula, or Tuple as fallback?
    // Modern dnd5e uses `system.damage.parts` as `DamagePart[]`.
    // Let's try to parse "2d10+8".
    const match = damage.formula.match(/^(\d+)d(\d+)(?:\s*\+\s*(\d+))?$/);
    if (match && match[1] && match[2]) {
      return {
        number: parseInt(match[1]),
        denomination: parseInt(match[2]),
        bonus: options.omitBonus ? '' : match[3] || '',
        types: this.normalizeDamageTypes(damage),
        custom: { enabled: false, formula: '' },
        scaling: { mode: 'whole', number: 1, formula: '' }
      };
    }
    // Fallback: simple formula string?
    // If strict object required, we might put whole formula in 'custom'?
    return {
        number: this.isV14() ? 0 : null,
        denomination: this.isV14() ? 0 : null,
        bonus: '',
        types: this.normalizeDamageTypes(damage),
        custom: { enabled: true, formula: damage.formula },
        scaling: { mode: 'whole', number: 1, ...(this.isV14() ? { formula: '' } : {}) }
    };
  }

  private formatHealing(healing: NonNullable<ActionData['healing']>): Record<string, unknown> {
    const match = healing.formula.match(/^(\d+)d(\d+)(?:\s*\+\s*(\d+))?$/u);
    if (match?.[1] && match[2]) {
      return {
        number: Number.parseInt(match[1], 10),
        denomination: Number.parseInt(match[2], 10),
        bonus: match[3] ?? '',
        types: [healing.type],
        custom: { enabled: false, formula: '' },
        scaling: { mode: 'whole', number: 1, formula: '' },
      };
    }
    return {
      number: null,
      denomination: null,
      bonus: '',
      types: [healing.type],
      custom: { enabled: true, formula: healing.formula },
      scaling: { mode: 'whole', number: null, formula: '' },
    };
  }

  private normalizeDamageTypes(damage: Damage): string[] {
    const rawTypes = damage.types && damage.types.length > 0 ? damage.types : [damage.type];
    const types = rawTypes
      .map((type) => mapDamageType(type) || type.trim().toLowerCase())
      .filter((type): type is string => Boolean(type));
    return [...new Set(types)];
  }

  private inferNativeWeaponRoll(
    action: ActionData,
    context: ActivityGenerationContext,
  ): { ability: AttackAbility } | null {
    if (!context.preferNativeWeaponRolls || !action.attack || action.attack.damage.length === 0) {
      return null;
    }
    if (action.attack.type !== 'mwak' && action.attack.type !== 'rwak') {
      return null;
    }
    if (!context.abilities || typeof context.proficiencyBonus !== 'number') {
      return null;
    }

    return inferAttackAbility({
      abilities: context.abilities,
      proficiencyBonus: context.proficiencyBonus,
      attackType: action.attack.type,
      toHit: action.attack.toHit,
      damageFormula: action.attack.damage[0]?.formula,
    });
  }

  private inferNativeSaveDc(
    action: ActionData,
    context: ActivityGenerationContext,
  ): { calculation: AttackAbility } | null {
    if (!action.save || !context.abilities || typeof context.proficiencyBonus !== 'number') {
      return null;
    }

    const contextualSourceAbility = action.save.dcSourceKind || context.dcSourceKind
      ? context.spellcastingAbility
      : undefined;

    const result = deriveSaveDc({
      abilities: context.abilities,
      proficiencyBonus: context.proficiencyBonus,
      dc: action.save.dc,
      targetSaveAbility: action.save.ability,
      actionName: action.name,
      englishName: action.englishName,
      description: action.desc,
      dcSourceAbility: action.save.dcSourceAbility ?? contextualSourceAbility,
      dcSourceKind: action.save.dcSourceKind ?? context.dcSourceKind,
    });

    return result.kind === 'native' ? { calculation: result.calculation } : null;
  }

  public static mergeUnique(
    target: Record<string, any>,
    incoming: Record<string, any>,
  ): Record<string, any> {
    for (const [id, activity] of Object.entries(incoming)) {
      if (Object.prototype.hasOwnProperty.call(target, id)) {
        throw new Error(`Activity ID collision at "${id}"; existing activity was not overwritten.`);
      }
      target[id] = activity;
    }
    return target;
  }

  private generateId(seed: unknown): string {
    return createStableDocumentId(seed);
  }

  private buildAttackRange(attack: NonNullable<ActionData['attack']>): Record<string, unknown> {
    if (attack.type === 'mwak' || attack.type === 'msak') {
      const thrownMatch = attack.range?.match(/(?:射程|range)\s*(\d+)\s*\/\s*(\d+)/i);
      const value = thrownMatch?.[1] ? Number.parseInt(thrownMatch[1], 10) : null;
      const long = thrownMatch?.[2] ? Number.parseInt(thrownMatch[2], 10) : null;
      return {
        override: false,
        value,
        long,
        reach: this.parseNumericDistance(attack.reach ?? attack.range) ?? 5,
        units: 'ft',
        special: '',
      };
    }

    const [value, long] = this.parseRangeValues(attack.range);
    return {
      override: false,
      value,
      long,
      reach: null,
      units: 'ft',
      special: '',
    };
  }

  private buildTargetSchema(): Record<string, unknown> {
    return {
      override: false,
      prompt: true,
      template: {
        count: '',
        contiguous: false,
        type: '',
        size: '',
        width: '',
        height: '',
        units: 'ft',
      },
      affects: {
        count: '',
        type: '',
        choice: false,
        special: '',
      },
    };
  }

  private parseRangeValues(range: string | undefined): [number | null, number | null] {
    const match = range?.match(/(\d+)(?:\s*\/\s*(\d+))?/);
    if (!match?.[1]) {
      return [null, null];
    }

    return [
      Number.parseInt(match[1], 10),
      match[2] ? Number.parseInt(match[2], 10) : null,
    ];
  }

  private parseNumericDistance(value: string | undefined): number | null {
    const match = value?.match(/(\d+)/);
    return match?.[1] ? Number.parseInt(match[1], 10) : null;
  }

  /**
   * Generate Passive Effect (Active Effect) for AC bonus, etc.
   */
  public generatePassiveEffect(action: ActionData): Record<string, any> | undefined {
    if (action.type !== 'effect' || !action.passiveEffect) {
      return undefined;
    }

    if (action.passiveEffect.type === 'acBonus') {
      const id = this.generateId({
        type: 'passive',
        name: action.name,
        passiveEffect: action.passiveEffect,
      });
      const change = this.isV14()
        ? {
            key: 'system.attributes.ac.bonus',
            type: 'add',
            value: action.passiveEffect.value,
            phase: 'initial',
            priority: null,
          }
        : {
            key: 'system.attributes.ac.bonus',
            mode: 2,
            value: `+${action.passiveEffect.value}`,
            priority: null,
          };
      return {
        _id: id,
        name: action.name || `AC +${action.passiveEffect.value} 加值`,
        type: this.isV14() ? 'base' : 'passive',
        origin: '',
        ...(this.isV14() ? { system: { changes: [change] } } : { changes: [change] }),
        disabled: false,
        duration: {
          startTime: null,
          seconds: null,
          combat: null,
          rounds: null,
          turns: null,
          startRound: null,
          startTurn: null
        },
        transfer: true,
        flags: {},
        tint: '#ffffff',
        description: action.passiveEffect.description || '',
        statuses: [],
        _stats: {
          compendiumSource: null,
          duplicateSource: null,
          coreVersion: getFoundryTarget(this.fvttVersion).stats.coreVersion,
          systemId: 'dnd5e',
          systemVersion: getFoundryTarget(this.fvttVersion).stats.systemVersion,
          createdTime: null,
          modifiedTime: null,
          lastModifiedBy: 'dnd5ebuilder0000'
        }
      };
    }

    return undefined;
  }

  /** Create a V14-native, non-transfer Token light Effect for an Item Activity. */
  public generateLightEffect(action: ActionData): Record<string, any> | undefined {
    if (!action.light) return undefined;
    if (!this.isV14()) {
      throw new Error('item-mechanics light is supported only for Foundry V14 targets.');
    }
    const id = this.generateId({ type: 'item-light', name: action.name, light: action.light });
    return {
      _id: id,
      name: action.name || '点亮',
      type: 'base',
      origin: '',
      system: {
        changes: [
          { key: 'token.light.bright', type: 'override', value: action.light.bright, phase: 'initial', priority: null },
          { key: 'token.light.dim', type: 'override', value: action.light.dim, phase: 'initial', priority: null },
        ],
      },
      disabled: false,
      duration: {
        startTime: null,
        seconds: null,
        combat: null,
        rounds: null,
        turns: null,
        startRound: null,
        startTurn: null,
      },
      transfer: false,
      flags: {},
      tint: '#ffffff',
      description: '通过 Activity 应用到角色；禁用或删除角色上的此效果即可熄灭。',
      statuses: [],
      _stats: {
        compendiumSource: null,
        duplicateSource: null,
        coreVersion: getFoundryTarget(this.fvttVersion).stats.coreVersion,
        systemId: 'dnd5e',
        systemVersion: getFoundryTarget(this.fvttVersion).stats.systemVersion,
        createdTime: null,
        modifiedTime: null,
        lastModifiedBy: 'dnd5ebuilder0000',
      },
    };
  }

  private itemUseTargets(consumption: number): Array<Record<string, unknown>> {
    if (consumption <= 0) return [];
    return [{
      type: 'itemUses',
      target: '',
      value: consumption.toString(),
      scaling: { mode: '', formula: '' },
    }];
  }

  private buildSaveDc(dc: number, calculation: AttackAbility | undefined): Record<string, unknown> {
    const value = {
      calculation: calculation ?? '',
      formula: calculation ? '' : dc.toString(),
    };
    return this.isV14() ? value : { ...value, value: dc };
  }

  private resolveSaveDamageResult(
    outcome: NonNullable<ActionData['save']>['outcome'],
    legacyText: string | undefined,
  ): 'none' | 'half' | 'full' {
    if (outcome === 'half' || outcome === 'full' || outcome === 'none') {
      return outcome;
    }
    if (outcome === 'literal') {
      return 'none';
    }
    if (legacyText && /half\s+(?:as\s+much\s+)?damage|减半|一半/i.test(legacyText)) {
      return 'half';
    }
    if (legacyText && /full\s+damage|same\s+damage/i.test(legacyText)) {
      return 'full';
    }
    return 'none';
  }

  private isV14(): boolean {
    return this.fvttVersion === '14';
  }
}
