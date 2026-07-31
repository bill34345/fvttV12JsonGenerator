export type AvatarSource = 'system' | 'token' | 'actor' | 'hidden';
export type ImageMode = 'original' | 'thumbnail';

export interface ChatMemoryGuardDefaults {
  enabled: boolean;
  retainedMessages: number;
  avatarSource: AvatarSource;
  imageMode: ImageMode;
  thumbnailMaxEdge: number;
  thumbnailQuality: number;
}

export interface ChatMemoryGuardClientSettings {
  followWorldDefaults: boolean;
  overrides: ChatMemoryGuardDefaults;
}

export const MODULE_ID = 'chat-memory-guard';

export const DEFAULT_SETTINGS: Readonly<ChatMemoryGuardDefaults> = Object.freeze({
  enabled: true,
  retainedMessages: 40,
  avatarSource: 'token',
  imageMode: 'thumbnail',
  thumbnailMaxEdge: 128,
  thumbnailQuality: 75,
});

export const DEFAULT_CLIENT_SETTINGS: Readonly<ChatMemoryGuardClientSettings> = Object.freeze({
  followWorldDefaults: true,
  overrides: DEFAULT_SETTINGS,
});

function clampNumber(value: unknown, minimum: number, maximum: number, fallback: number): number {
  const number = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(maximum, Math.max(minimum, Math.round(number)));
}

export function normalizeDefaults(input: unknown): ChatMemoryGuardDefaults {
  const value = input && typeof input === 'object' ? input as Record<string, unknown> : {};
  const avatarSources: AvatarSource[] = ['system', 'token', 'actor', 'hidden'];
  const imageModes: ImageMode[] = ['original', 'thumbnail'];
  return {
    enabled: typeof value.enabled === 'boolean' ? value.enabled : DEFAULT_SETTINGS.enabled,
    retainedMessages: clampNumber(value.retainedMessages, 20, 200, DEFAULT_SETTINGS.retainedMessages),
    avatarSource: avatarSources.includes(value.avatarSource as AvatarSource)
      ? value.avatarSource as AvatarSource : DEFAULT_SETTINGS.avatarSource,
    imageMode: imageModes.includes(value.imageMode as ImageMode)
      ? value.imageMode as ImageMode : DEFAULT_SETTINGS.imageMode,
    thumbnailMaxEdge: clampNumber(value.thumbnailMaxEdge, 48, 256, DEFAULT_SETTINGS.thumbnailMaxEdge),
    thumbnailQuality: clampNumber(value.thumbnailQuality, 40, 95, DEFAULT_SETTINGS.thumbnailQuality),
  };
}

export function normalizeClientSettings(input: unknown): ChatMemoryGuardClientSettings {
  const value = input && typeof input === 'object' ? input as Record<string, unknown> : {};
  return {
    followWorldDefaults: typeof value.followWorldDefaults === 'boolean' ? value.followWorldDefaults : true,
    overrides: normalizeDefaults(value.overrides),
  };
}

export function resolveEffectiveSettings(
  world: unknown,
  client: unknown,
): ChatMemoryGuardDefaults {
  const normalizedWorld = normalizeDefaults(world);
  const normalizedClient = normalizeClientSettings(client);
  return normalizedClient.followWorldDefaults ? normalizedWorld : normalizedClient.overrides;
}

export function parseSettingsForm(values: Record<string, unknown>): {
  world: ChatMemoryGuardDefaults;
  client: ChatMemoryGuardClientSettings;
} {
  const layer = (prefix: string) => normalizeDefaults({
    enabled: values[`${prefix}.enabled`] === true || values[`${prefix}.enabled`] === 'on',
    retainedMessages: values[`${prefix}.retainedMessages`],
    avatarSource: values[`${prefix}.avatarSource`],
    imageMode: values[`${prefix}.imageMode`],
    thumbnailMaxEdge: values[`${prefix}.thumbnailMaxEdge`],
    thumbnailQuality: values[`${prefix}.thumbnailQuality`],
  });
  return {
    world: layer('world'),
    client: {
      followWorldDefaults: values['client.followWorldDefaults'] === true
        || values['client.followWorldDefaults'] === 'on',
      overrides: layer('client'),
    },
  };
}

export interface FoundrySettingsApi {
  register(moduleId: string, key: string, config: Record<string, unknown>): void;
  registerMenu(moduleId: string, key: string, config: Record<string, unknown>): void;
  get(moduleId: string, key: string): unknown;
  set(moduleId: string, key: string, value: unknown): Promise<unknown>;
}

export function registerSettings(settings: FoundrySettingsApi, menuType: unknown, onChange: () => void): void {
  settings.register(MODULE_ID, 'worldDefaults', {
    name: 'CMG.Settings.WorldDefaults',
    scope: 'world',
    config: false,
    type: Object,
    default: DEFAULT_SETTINGS,
    onChange,
  });
  settings.register(MODULE_ID, 'clientSettings', {
    name: 'CMG.Settings.ClientOverrides',
    scope: 'client',
    config: false,
    type: Object,
    default: DEFAULT_CLIENT_SETTINGS,
    onChange,
  });
  settings.registerMenu(MODULE_ID, 'configuration', {
    name: 'CMG.Settings.MenuName',
    label: 'CMG.Settings.MenuLabel',
    hint: 'CMG.Settings.MenuHint',
    icon: 'fa-solid fa-comments',
    type: menuType,
    restricted: false,
  });
}

export function readEffectiveSettings(settings: FoundrySettingsApi): ChatMemoryGuardDefaults {
  return resolveEffectiveSettings(
    settings.get(MODULE_ID, 'worldDefaults'),
    settings.get(MODULE_ID, 'clientSettings'),
  );
}

export function createSettingsApplicationClass(): any {
  const foundryGlobal = (globalThis as any).foundry;
  const ApplicationV2 = foundryGlobal?.applications?.api?.ApplicationV2;
  const HandlebarsApplicationMixin = foundryGlobal?.applications?.api?.HandlebarsApplicationMixin;
  if (!ApplicationV2 || typeof HandlebarsApplicationMixin !== 'function') {
    throw new Error('Foundry 14 ApplicationV2 and HandlebarsApplicationMixin are unavailable.');
  }
  return class ChatMemoryGuardSettingsApplication extends HandlebarsApplicationMixin(ApplicationV2) {
    static DEFAULT_OPTIONS = {
      id: 'chat-memory-guard-settings',
      tag: 'form',
      window: {
        title: 'CMG.Settings.MenuName',
        contentClasses: ['standard-form'],
        icon: 'fa-solid fa-comments',
      },
      position: { width: 620 },
      form: { closeOnSubmit: true, handler: this.onSubmit },
    };

    static PARTS = {
      body: { template: `modules/${MODULE_ID}/templates/settings.hbs` },
      footer: { template: 'templates/generic/form-footer.hbs' },
    };

    async _prepareContext() {
      const game = (globalThis as any).game;
      return {
        isGM: game.user?.isGM === true,
        world: normalizeDefaults(game.settings.get(MODULE_ID, 'worldDefaults')),
        client: normalizeClientSettings(game.settings.get(MODULE_ID, 'clientSettings')),
        avatarSources: ['system', 'token', 'actor', 'hidden'].map((value) => ({
          value, label: `CMG.Avatar.${value}`,
        })),
        imageModes: ['original', 'thumbnail'].map((value) => ({
          value, label: `CMG.ImageMode.${value}`,
        })),
        buttons: [{ type: 'submit', icon: 'fa-solid fa-save', label: 'CMG.Settings.Save' }],
      };
    }

    static async onSubmit(_event: unknown, _form: unknown, formData: any) {
      const game = (globalThis as any).game;
      const parsed = parseSettingsForm(formData?.object ?? {});
      if (game.user?.isGM === true) await game.settings.set(MODULE_ID, 'worldDefaults', parsed.world);
      await game.settings.set(MODULE_ID, 'clientSettings', parsed.client);
    }
  };
}
