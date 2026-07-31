import { statusIconPath } from './actor-effects';
import type { EffectProfile } from '@fvtt-json-generator/contracts/target';

// Effect-profile application is a target projection policy.

export type { EffectProfile } from '@fvtt-json-generator/contracts/target';

export class EffectProfileApplier {
  public apply(actor: any, effectProfile: EffectProfile): void {
    if (!Array.isArray(actor?.items)) {
      return;
    }

    for (const item of actor.items) {
      if (!item || typeof item !== 'object') {
        continue;
      }

      if (!Array.isArray(item.effects)) {
        item.effects = [];
      }

      this.applyHints(item);

      if (effectProfile === 'modded-v12') {
        this.applyModdedV12(item);
      } else if (effectProfile === 'modded-v14') {
        this.applyModdedV14(item);
      } else {
        this.stripModuleAutomation(item);
      }
    }
  }

  public createBaseEffect(
    name: string,
    statuses: string[],
    tint = '#ffffff',
    flags?: Record<string, unknown>,
  ): any {
    const primaryStatus = statuses[0] ?? 'restrained';
    return {
      _id: this.createEffectId(),
      name,
      type: 'base',
      system: {},
      changes: [],
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
      description: '',
      origin: null,
      tint,
      transfer: false,
      img: statusIconPath(primaryStatus),
      statuses,
      ...(flags ? { flags } : {}),
    };
  }

  public attachEffectToActivities(item: any, effectId: string): void {
    const activities = item?.system?.activities;
    if (!activities || typeof activities !== 'object') {
      return;
    }

    for (const activity of Object.values(activities) as any[]) {
      if (!activity || typeof activity !== 'object') {
        continue;
      }

      if (!Array.isArray(activity.effects)) {
        activity.effects = [];
      }

      if (!activity.effects.some((effect: any) => effect?._id === effectId)) {
        activity.effects.push({ _id: effectId });
      }
    }
  }

  private applyHints(item: any): void {
    const text = this.getItemText(item);
    const flags = (item.flags ??= {});
    const featureFlags = (flags.fvttJsonGenerator ??= {});
    const hints = (featureFlags.effectHints ??= {});

    if (/(?:Heavy Hit|强击)/i.test(text)) {
      hints.heavyHit = true;
    }

    if (/(?:Dazed|恍惚)/i.test(text)) {
      hints.dazed = true;
    }

    if (/(?:Bleed|Bleeding|流血)/i.test(text)) {
      hints.bleed = true;
    }

    if (/(?:Swallow|吞咽|吞下|被吞下)/i.test(text)) {
      hints.swallow = true;
    }
  }

  private applyModdedV12(item: any): void {
    const text = this.getItemText(item);

    item.effects = (item.effects ?? []).filter((effect: any) => !/(?:Swallowed|吞咽中)/i.test(String(effect?.name ?? '')));

    if (/(?:Bleed|Bleeding|流血)/i.test(text)) {
      return;
    }
  }

  private applyModdedV14(item: any): void {
    item.effects = (item.effects ?? []).filter((effect: any) => !/(?:Swallowed|吞咽中)/i.test(String(effect?.name ?? '')));

    for (const effect of item.effects) {
      if (!effect || typeof effect !== 'object') {
        continue;
      }

      if (effect.flags?.fvttJsonGenerator?.sourceDuration === 'untilDamaged') {
        const flags = (effect.flags ??= {});
        flags.dae = {
          ...(flags.dae && typeof flags.dae === 'object' ? flags.dae : {}),
          // source-derived mapping checked against DAE 14.0.12's registered
          // `isDamaged` duration key; MIDI-QOL 14.0.11 consumes the key when
          // its damage workflow removes the effect.
          specialDuration: ['isDamaged'],
        };
      }

      const overTime = effect.flags?.['midi-qol.OverTime'];
      if (typeof overTime !== 'string' || !overTime.trim()) {
        continue;
      }

      // schema-derived: MIDI-QOL 14.0.11 scans v14 ActiveEffect system.changes
      // for flags.midi-qol.OverTime; a document flag is not consumed there.
      const system = (effect.system ??= {});
      const changes = Array.isArray(system.changes) ? system.changes : [];
      system.changes = changes.filter((change: any) => change?.key !== 'flags.midi-qol.OverTime');
      system.changes.push({
        key: 'flags.midi-qol.OverTime',
        mode: 5,
        value: overTime,
        priority: 20,
      });

      delete effect.flags['midi-qol.OverTime'];
      if (Object.keys(effect.flags).length === 0) {
        delete effect.flags;
      }
    }
  }

  private stripModuleAutomation(item: any): void {
    item.effects = (item.effects ?? []).filter((effect: any) => {
      if (!effect || typeof effect !== 'object') {
        return false;
      }

      if (/(?:Swallowed|吞咽中)/i.test(String(effect.name ?? ''))) {
        return false;
      }

      if (effect.flags && typeof effect.flags === 'object') {
        delete effect.flags['midi-qol.OverTime'];
        delete effect.flags.dae;
        if (Object.keys(effect.flags).length === 0) {
          delete effect.flags;
        }
      }

      if (Array.isArray(effect.system?.changes)) {
        effect.system.changes = effect.system.changes.filter(
          (change: any) => change?.key !== 'flags.midi-qol.OverTime',
        );
      }
      if (Array.isArray(effect.changes)) {
        effect.changes = effect.changes.filter(
          (change: any) => change?.key !== 'flags.midi-qol.OverTime',
        );
      }

      return true;
    });
  }

  private createEffectId(): string {
    const chars = 'abcdef0123456789';
    let result = '';
    for (let i = 0; i < 16; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return result;
  }

  private getItemText(item: any): string {
    const name = String(item?.name ?? '');
    const description = String(item?.system?.description?.value ?? '');
    return `${name} ${description}`;
  }
}
