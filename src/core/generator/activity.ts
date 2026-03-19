import { ActionData, Damage } from '../parser/action';

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
          includeBase: true
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

    // Add Range if present (Activity level in 4.3?)
    // Actually, Range is often on the Activity in 4.3.
    if (action.attack?.range) {
       // Parse "10 ft" or "150/600 ft"
       // TODO: Range parsing logic
    }

    return activities;
  }

  public generateCast(spellUuid: string): Record<string, any> {
    const id = this.generateId();
    return {
      [id]: {
        _id: id,
        type: 'cast',
        cast: {
          spell: spellUuid
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
    if (match) {
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
