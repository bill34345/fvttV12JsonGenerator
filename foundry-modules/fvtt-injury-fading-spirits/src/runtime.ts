import { MODULE_ID, SETTINGS } from './constants.ts';
import { isActiveGmWriter, readActorState, writeActorState } from './persistence.ts';
import { activateChatCard, openActorDashboard, openResurrectionWizard } from './ui.ts';

function customInjuryApi(): any {
  const module = game.modules?.get?.('fvtt-custom-conditions');
  return module?.active === true ? module.api?.injury : undefined;
}

export class InjuryFadingRuntime {
  supported = false;
  readonly hpSnapshots = new Map<string, number>();
  readonly episodeQueues = new Map<string, Promise<void>>();

  initialize(): void {
    registerSettings();
    Hooks.on('ready', () => { void this.onReady(); });
    Hooks.on('renderChatMessageHTML', (message: any, html: any) => activateChatCard(message, html));
    Hooks.on('dnd5e.renderChatMessage', (message: any, html: any) => activateChatCard(message, html));
    Hooks.on('getActorDirectoryEntryContext', (_html: unknown, entries: any[]) => this.addActorContext(entries));
    Hooks.on('chatMessage', (_log: unknown, text: string) => this.onChatCommand(text));
    Hooks.on('preUpdateActor', (actor: any, changes: any) => this.onPreUpdateActor(actor, changes));
    Hooks.on('updateActor', (actor: any, changes: any) => {
      void this.onUpdateActor(actor, changes).catch((error) => {
        console.error(`[${MODULE_ID}] death episode`, error);
        ui.notifications?.error?.(error instanceof Error ? error.message : String(error));
      });
    });
    Hooks.on('canvasReady', () => this.captureHpSnapshots());
  }

  async onReady(): Promise<void> {
    this.supported = game.system?.id === 'dnd5e' && (
      (game.version === '14.364' && game.system.version === '5.3.3')
      || (game.version === '14.368' && game.system.version === '5.3.3')
      || (game.version === '14.368' && game.system.version === '6.0.2')
      || (game.version === '14.368' && game.system.version === '6.0.5')
    );
    if (!this.supported && game.user?.isGM) ui.notifications.error(game.i18n.localize('IFS.Errors.UnsupportedRuntime'));
    if (this.supported) this.captureHpSnapshots();
  }

  private captureHpSnapshots(): void {
    for (const actor of [...(game.actors ?? []),
      ...((globalThis as any).canvas?.tokens?.placeables ?? []).map((token: any) => token.actor)]) {
      const value = Number(actor?.system?.attributes?.hp?.value);
      if (actor?.uuid && Number.isFinite(value)) this.hpSnapshots.set(actor.uuid, value);
    }
  }

  onPreUpdateActor(actor: any, changes: any): void {
    if (!this.supported || !hasHpChange(changes) || !actor?.uuid) return;
    const value = Number(actor?.system?.attributes?.hp?.value);
    if (Number.isFinite(value)) this.hpSnapshots.set(actor.uuid, value);
  }

  async onUpdateActor(actor: any, changes: any): Promise<void> {
    if (!this.supported || !actor?.uuid || !hasHpChange(changes)) return;
    const before = this.hpSnapshots.get(actor.uuid);
    const after = Number(actor?.system?.attributes?.hp?.value);
    if (Number.isFinite(after)) this.hpSnapshots.set(actor.uuid, after);
    if (!isActiveGmWriter() || customInjuryApi()?.isEnabled?.() === true
      || !Number.isFinite(before) || !Number.isFinite(after) || before! <= 0 || after !== 0) return;
    const revision = Number(actor?._stats?.modifiedTime);
    if (!Number.isFinite(revision)) return;
    await this.beginDeathEpisode(actor, `death:${actor.uuid}:${revision}`);
  }

  async beginDeathEpisode(actor: any, episodeId: string): Promise<boolean> {
    if (!this.supported || !isActiveGmWriter()) throw new Error('Only the active GM can begin a death episode.');
    if (actor?.documentName !== 'Actor' || !actor.uuid || !episodeId || typeof episodeId !== 'string') {
      throw new Error('A valid Actor and episode ID are required.');
    }
    const key = actor.uuid;
    const previous = this.episodeQueues.get(key) ?? Promise.resolve();
    const run = previous.catch(() => undefined).then(async () => {
      if (!isActiveGmWriter()) throw new Error('Active GM changed before the death episode write.');
      const current = typeof (globalThis as any).fromUuid === 'function' ? await (globalThis as any).fromUuid(key) : actor;
      if (current?.uuid !== key || current.documentName !== 'Actor') throw new Error('Death episode Actor is unavailable.');
      const injury = customInjuryApi();
      if (injury?.isEnabled?.() === true) {
        const ccEpisode = injury.getState?.(current)?.episode;
        if (ccEpisode?.open === true && ccEpisode.id !== episodeId) return false;
      }
      const state = readActorState(current);
      if (state.fadingSpirits.currentDeathEpisodeId === episodeId) return true;
      if (state.fadingSpirits.resolutionInProgress || state.fadingSpirits.pendingRitual) {
        throw new Error('A resurrection is still in progress; GM must resolve it before starting a new death episode.');
      }
      state.fadingSpirits.currentDeathEpisodeId = episodeId;
      state.fadingSpirits.rapidResurrectionLockedForCurrentDeath = false;
      state.fadingSpirits.resurrectionConsumedForCurrentDeath = false;
      await writeActorState(current, state, `${episodeId}:fading-begin`);
      return true;
    });
    const tail = run.then(() => undefined, () => undefined);
    this.episodeQueues.set(key, tail);
    void tail.finally(() => { if (this.episodeQueues.get(key) === tail) this.episodeQueues.delete(key); });
    return run;
  }

  async setInjury(actor: any, stacks: number, reason: string): Promise<void> {
    const injury = customInjuryApi();
    if (typeof injury?.setStacks !== 'function') throw new Error('Custom Conditions injury API is unavailable.');
    await injury.setStacks(actor, stacks, reason);
  }

  async withInjurySuppressed<T>(actor: any, reason: string, callback: () => Promise<T> | T): Promise<T> {
    const injury = customInjuryApi();
    if (typeof injury?.withSuppressed !== 'function') throw new Error('Custom Conditions injury API is unavailable.');
    return injury.withSuppressed(actor, reason, callback);
  }

  addActorContext(entries: any[]): void {
    entries.push({
      name: game.i18n.localize('IFS.Title'), icon: '<i class="fa-solid fa-heart-crack"></i>',
      condition: () => game.user?.isGM === true,
      callback: (entry: any) => {
        const element = entry?.[0] ?? entry;
        const id = element?.dataset?.documentId ?? element?.dataset?.entryId;
        const actor = game.actors.get(id);
        if (actor) void openActorDashboard(actor);
      },
    });
  }

  onChatCommand(text: string): boolean | void {
    if (String(text).trim().toLocaleLowerCase() !== '/ifs') return;
    if (!game.user?.isGM) return false;
    const actor = (Array.from((globalThis as any).canvas?.tokens?.placeables ?? []) as any[]).find((token: any) => token.controlled)?.actor;
    if (!actor) ui.notifications.warn(game.i18n.localize('IFS.Messages.SelectTokenForCommand'));
    else void openActorDashboard(actor);
    return false;
  }
}

function hasHpChange(changes: any): boolean {
  return changes && typeof changes === 'object' && (
    Object.prototype.hasOwnProperty.call(changes, 'system.attributes.hp.value')
    || changes.system?.attributes?.hp?.value !== undefined);
}

export function registerSettings(): void {
  // Retained for migration of existing world choices; these no longer enable
  // any IFS injury hooks.
  game.settings.register(MODULE_ID, SETTINGS.enabled, {
    name: 'IFS.Settings.Enabled.Name', hint: 'IFS.Settings.Enabled.Hint', scope: 'world', config: false, type: Boolean, default: false,
  });
  game.settings.register(MODULE_ID, SETTINGS.manageNpcs, {
    name: 'IFS.Settings.ManageNpcs.Name', hint: 'IFS.Settings.ManageNpcs.Hint', scope: 'world', config: false, type: Boolean, default: false,
  });
  game.settings.register(MODULE_ID, SETTINGS.setupComplete, {
    name: 'IFS.Settings.SetupComplete.Name', scope: 'world', config: false, type: Boolean, default: false,
  });
}

export const runtime = new InjuryFadingRuntime();

export const publicApi = Object.freeze({
  injuryOwner: 'fvtt-custom-conditions' as const,
  getState(actor: any) {
    const state = readActorState(actor);
    const injury = customInjuryApi();
    if (typeof injury?.getState === 'function') state.injury = injury.getState(actor);
    return structuredClone(state);
  },
  setInjury(actor: any, stacks: number, reason = 'api') { return runtime.setInjury(actor, stacks, reason); },
  openResurrectionWizard(actor: any) { return openResurrectionWizard(actor); },
  getResurrectionState(actor: any) { return structuredClone(readActorState(actor).fadingSpirits); },
  withInjurySuppressed<T>(actor: any, reason: string, callback: () => Promise<T> | T) { return runtime.withInjurySuppressed(actor, reason, callback); },
  beginDeathEpisode(actor: any, episodeId: string) { return runtime.beginDeathEpisode(actor, episodeId); },
});
