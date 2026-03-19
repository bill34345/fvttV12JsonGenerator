import type { ActionData, Damage } from './action';

const ABILITY_ALIASES: Record<string, string> = {
  str: 'str',
  strength: 'str',
  dex: 'dex',
  dexterity: 'dex',
  con: 'con',
  constitution: 'con',
  int: 'int',
  intelligence: 'int',
  wis: 'wis',
  wisdom: 'wis',
  cha: 'cha',
  charisma: 'cha',
};

const DAMAGE_TYPES = new Set([
  'acid',
  'bludgeoning',
  'cold',
  'fire',
  'force',
  'lightning',
  'necrotic',
  'piercing',
  'poison',
  'psychic',
  'radiant',
  'slashing',
  'thunder',
]);

interface HeaderMetadata {
  name: string;
  recharge?: ActionData['recharge'];
  legendaryCost?: number;
}

type ExtendedActionData = ActionData & {
  damage?: Damage[];
  legendaryCost?: number;
};

export class EnglishActionParser {
  public parse(line: string): ActionData | null {
    const trimmed = line.trim();
    if (!trimmed || !this.looksLikeEnglish(trimmed)) {
      return null;
    }

    const compactAttack = this.parseCompactAttack(trimmed);
    if (compactAttack) {
      return compactAttack;
    }

    const split = this.splitNameAndBody(trimmed);
    if (!split) {
      return {
        name: trimmed,
        type: 'utility',
        desc: trimmed,
      };
    }

    const metadata = this.extractHeaderMetadata(split.namePart);
    const desc = split.body;

    const attack = this.parseStatblockAttack(desc);
    if (attack) {
      const action: ExtendedActionData = {
        name: metadata.name,
        type: 'attack',
        desc,
        attack,
      };
      if (metadata.recharge) {
        action.recharge = metadata.recharge;
      }
      if (metadata.legendaryCost !== undefined) {
        action.legendaryCost = metadata.legendaryCost;
      }
      return action;
    }

    const saveInfo = this.parseSave(desc);
    if (saveInfo) {
      const action: ExtendedActionData = {
        name: metadata.name,
        type: 'save',
        desc,
        save: saveInfo,
      };
      action.damage = this.parseDamages(desc);
      if (metadata.recharge) {
        action.recharge = metadata.recharge;
      }
      if (metadata.legendaryCost !== undefined) {
        action.legendaryCost = metadata.legendaryCost;
      }
      return action;
    }

    const utility: ExtendedActionData = {
      name: metadata.name,
      type: 'utility',
      desc,
    };
    if (metadata.recharge) {
      utility.recharge = metadata.recharge;
    }
    if (metadata.legendaryCost !== undefined) {
      utility.legendaryCost = metadata.legendaryCost;
    }
    return utility;
  }

  private looksLikeEnglish(line: string): boolean {
    return /[A-Za-z]/.test(line);
  }

  private splitNameAndBody(line: string): { namePart: string; body: string } | null {
    const match = line.match(/^(.+?)\.\s+(.+)$/) ?? line.match(/^(.+?):\s+(.+)$/);
    if (!match?.[1] || !match[2]) {
      return null;
    }

    return {
      namePart: match[1].trim(),
      body: match[2].trim(),
    };
  }

  private extractHeaderMetadata(namePart: string): HeaderMetadata {
    let name = namePart.trim();
    let recharge: ActionData['recharge'] | undefined;
    let legendaryCost: number | undefined;

    const rechargeMatch = name.match(/[\[(]\s*Recharge\s*(\d+)(?:\s*-\s*\d+)?\s*[\])]/i);
    if (rechargeMatch?.[1]) {
      recharge = {
        value: Number.parseInt(rechargeMatch[1], 10),
        charged: true,
      };
      name = name.replace(rechargeMatch[0], '').trim();
    }

    const costMatch = name.match(/[\[(]\s*Costs?\s+(\d+)\s+Actions?\s*[\])]/i);
    if (costMatch?.[1]) {
      legendaryCost = Number.parseInt(costMatch[1], 10);
      name = name.replace(costMatch[0], '').trim();
    }

    name = name.replace(/\s{2,}/g, ' ').trim();

    return {
      name: name || namePart.trim(),
      recharge,
      legendaryCost,
    };
  }

  private parseCompactAttack(line: string): ActionData | null {
    const match = line.match(
      /^(.+?)\s*\[(Melee|Ranged)[^\]]*Weapon Attack\]:\s*\+(\d+)\s*(?:to\s+hit|hit),\s*([^,]+),\s*(.+)$/i,
    );
    if (!match?.[1] || !match[2] || !match[3] || !match[4] || !match[5]) {
      return null;
    }

    const attackType = match[2].toLowerCase() === 'ranged' ? 'rwak' : 'mwak';
    const damage = this.parseDamages(match[5]);

    return {
      name: match[1].trim(),
      type: 'attack',
      attack: {
        type: attackType,
        toHit: Number.parseInt(match[3], 10),
        range: match[4].trim(),
        damage,
      },
      desc: match[5].trim(),
    };
  }

  private parseStatblockAttack(body: string): ActionData['attack'] | undefined {
    const match = body.match(
      /^(Melee(?:\s+or\s+Ranged)?|Ranged)\s+Weapon\s+Attack:\s*\+(\d+)\s+to\s+hit,\s*(reach|range)\s+([^,]+),/i,
    );

    if (!match?.[1] || !match[2] || !match[3] || !match[4]) {
      return undefined;
    }

    const attackType = match[1].toLowerCase().startsWith('ranged') ? 'rwak' : 'mwak';
    const range = `${match[3].toLowerCase()} ${match[4].trim()}`;

    return {
      type: attackType,
      toHit: Number.parseInt(match[2], 10),
      range,
      damage: this.parseDamages(body),
    };
  }

  private parseSave(body: string): ActionData['save'] | undefined {
    const match = body.match(/DC\s*(\d+)\s*([A-Za-z]+)\s+saving\s+throw/i);
    if (!match?.[1] || !match[2]) {
      return undefined;
    }

    const ability = ABILITY_ALIASES[match[2].toLowerCase()];
    if (!ability) {
      return undefined;
    }

    const onSave = /half\s+as\s+much\s+damage|half\s+damage/i.test(body) ? 'half damage' : undefined;

    return {
      dc: Number.parseInt(match[1], 10),
      ability,
      onSave,
    };
  }

  private parseDamages(text: string): Damage[] {
    const parts: Damage[] = [];
    const seen = new Set<string>();

    const addDamage = (formulaRaw: string, typeRaw: string) => {
      const type = typeRaw.trim().toLowerCase();
      if (!DAMAGE_TYPES.has(type)) {
        return;
      }
      const formula = formulaRaw.replace(/\s+/g, '');
      if (!formula) {
        return;
      }
      const key = `${formula}:${type}`;
      if (seen.has(key)) {
        return;
      }
      seen.add(key);
      parts.push({ formula, type });
    };

    const parenthesizedPattern = /\b\d+\s*\(([^)]+)\)\s*([A-Za-z]+)\s+damage/gi;
    for (const match of text.matchAll(parenthesizedPattern)) {
      if (match[1] && match[2]) {
        addDamage(match[1], match[2]);
      }
    }

    const plainPattern = /\b((?:\d+d\d+)(?:\s*[+-]\s*\d+)?)\s*([A-Za-z]+)(?:\s+damage)?\b/gi;
    for (const match of text.matchAll(plainPattern)) {
      if (match[1] && match[2]) {
        addDamage(match[1], match[2]);
      }
    }

    return parts;
  }
}
