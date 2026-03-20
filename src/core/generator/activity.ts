import type { ActionData, Damage } from '../parser/action';

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
    } else {
      activities[id] = {
        _id: id,
        type: 'utility'
      };
    }

    // Add Range if present
    if (action.attack) {
      if (action.attack.type === 'mwak' && action.attack.reach) {
        activities[id].range = {
          value: action.attack.reach,
          units: 'ft',
          special: ''
        };
      } else if (action.attack.range) {
        const rangeMatch = action.attack.range.match(/^(\d+)(?:\/(\d+))?/);
        if (rangeMatch) {
          activities[id].range = {
            value: rangeMatch[1],
            long: rangeMatch[2] || '',
            units: 'ft',
            special: ''
          };
        }
      }
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
}
