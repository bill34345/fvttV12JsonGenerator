import type { ActionData, Damage } from '../parser/action';
import { spellsMapper } from '../mapper/spells';

export class ActivityGenerator {
  public generate(action: ActionData): Record<string, any> {
    const activities: Record<string, any> = {};
    const id = this.generateId();

    if (action.attack) {
      activities[id] = {
        _id: id,
        type: 'attack',
        attack: {
          ability: '',
          bonus: `${action.attack.toHit}`,
          flat: true,
          type: {
            value: action.attack.type,
            classification: 'weapon'
          }
        },
        damage: {
          parts: action.attack.damage.map(d => this.formatDamage(d)),
          includeBase: true,
          ...(action.attack.versatile ? { versatile: this.formatDamage({ formula: action.attack.versatile.formula, type: action.attack.damage[0]?.type || '' }) } : {})
        }
      };
      activities[id].range = this.buildAttackRange(action.attack);
      activities[id].target = this.buildTargetSchema();
    } else if (action.save) {
      activities[id] = {
        _id: id,
        type: 'save',
        save: {
          ability: [action.save.ability],
          dc: {
            calculation: '',
            formula: action.save.dc.toString(),
            value: action.save.dc
          }
        },
        damage: {
          parts: (action.damage || []).map(d => this.formatDamage(d))
        }
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
      let spellInfo = spellsMapper.get(action.spellName);
      if (!spellInfo && action.englishName) {
        spellInfo = spellsMapper.get(action.englishName);
      }
      
      const FOUNDRY_SPELL_UUIDS: Record<string, string> = {
        'Invisibility': 'Compendium.dnd5e.spells.Item.1N8dDMMgZ1h1YJ3B',
      };
      
      if (!spellInfo) {
        const englishName = action.englishName || action.spellName;
        const foundaryUuid = FOUNDRY_SPELL_UUIDS[englishName];
        
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
              targets: [{
                type: 'itemUses',
                target: '',
                value: (action.useAction?.consumption || 1).toString(),
                scaling: { mode: '', formula: '' }
              }],
              scaling: { allowed: false, max: '' },
              spellSlot: true
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
        } else {
          activities[id] = {
            _id: id,
            type: 'utility',
            activation: {
              type: action.useAction?.activation || 'action',
              value: 1,
              override: false,
            },
            consumption: {
              targets: [{
                type: 'itemUses',
                target: '',
                value: (action.useAction?.consumption || 1).toString(),
                scaling: { mode: '', formula: '' }
              }],
              scaling: { allowed: false, max: '' },
              spellSlot: false
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
            targets: [{
              type: 'itemUses',
              target: '',
              value: (action.useAction?.consumption || 1).toString(),
              scaling: { mode: '', formula: '' }
            }],
            scaling: { allowed: false, max: '' },
            spellSlot: true
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
      activities[id] = {
        _id: id,
        type: 'utility',
        activation: {
          type: action.useAction.activation,
          value: action.useAction.activation === 'free' ? 0 : 1,
          override: false,
        },
        consumption: {
          targets: [{
            type: 'itemUses',
            target: '',
            value: action.useAction.consumption.toString(),
            scaling: { mode: '', formula: '' }
          }],
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
        uses: { spent: 0, recovery: [], max: '' },
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

    return activities;
  }

  public generateCast(spellUuid: string): Record<string, any> {
    const id = this.generateId();
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

  private formatDamage(damage: Damage) {
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
        bonus: match[3] || '',
        types: [damage.type],
        custom: { enabled: false, formula: '' },
        scaling: { mode: 'whole', number: 1, formula: '' }
      };
    }
    // Fallback: simple formula string?
    // If strict object required, we might put whole formula in 'custom'?
    return {
        number: null,
        denomination: null,
        bonus: '',
        types: [damage.type],
        custom: { enabled: true, formula: damage.formula },
        scaling: { mode: 'whole', number: 1 }
    };
  }

  private generateId(): string {
    const chars = 'abcdef0123456789';
    let result = 'dnd5eactivity';
    for (let i = 0; i < 3; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }

  private buildAttackRange(attack: NonNullable<ActionData['attack']>): Record<string, unknown> {
    if (attack.type === 'mwak') {
      return {
        override: false,
        value: null,
        long: null,
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
      const id = this.generateId();
      return {
        _id: id,
        name: action.name || `AC +${action.passiveEffect.value} 加值`,
        type: 'passive',
        origin: '',
        changes: [{
          key: 'system.attributes.ac.bonus',
          mode: 2,
          value: `+${action.passiveEffect.value}`,
          priority: null
        }],
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
          coreVersion: '12.331',
          systemId: 'dnd5e',
          systemVersion: '4.0.0',
          createdTime: null,
          modifiedTime: null,
          lastModifiedBy: 'dnd5ebuilder0000'
        }
      };
    }

    return undefined;
  }
}
