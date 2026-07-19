import { DEFAULT_SPELL_RESOLUTION_CONFIGURATION } from '../../core/spell-resolution/resolver';

export interface ResolverSettingDefinition {
  key: 'sourcePriority' | 'savedMappings' | 'debugLogging' | 'indexMetadata';
  name: string;
  hint: string;
  scope: 'world' | 'client';
  config: boolean;
  type: ArrayConstructor | ObjectConstructor | BooleanConstructor;
  default: unknown;
}

export interface ResolverSettingsAdapter {
  registerSetting(definition: ResolverSettingDefinition): void;
  registerSettingsMenu(definition: ResolverSettingsMenuDefinition): void;
}

export interface ResolverSettingsMenuDefinition {
  key: 'resolverSettings';
  name: string;
  label: string;
  hint: string;
  icon: string;
  restricted: true;
}

export const RESOLVER_SETTING_DEFINITIONS: ResolverSettingDefinition[] = [
  {
    key: 'sourcePriority',
    name: 'FVTTJSONSPELL.Settings.SourcePriority.Name',
    hint: 'FVTTJSONSPELL.Settings.SourcePriority.Hint',
    scope: 'world',
    // Foundry 14.364 SettingsConfig renders unrecognized complex constructors as a StringField.
    // Keep this object array hidden until Task 8 provides a structure-preserving GM editor.
    config: false,
    type: Array,
    default: DEFAULT_SPELL_RESOLUTION_CONFIGURATION.sourcePriority.map((entry) => ({ ...entry })),
  },
  {
    key: 'savedMappings',
    name: 'FVTTJSONSPELL.Settings.SavedMappings.Name',
    hint: 'FVTTJSONSPELL.Settings.SavedMappings.Hint',
    scope: 'world',
    config: false,
    type: Object,
    default: {},
  },
  {
    key: 'debugLogging',
    name: 'FVTTJSONSPELL.Settings.DebugLogging.Name',
    hint: 'FVTTJSONSPELL.Settings.DebugLogging.Hint',
    scope: 'client',
    config: true,
    type: Boolean,
    default: false,
  },
  {
    key: 'indexMetadata',
    name: 'FVTTJSONSPELL.Settings.IndexMetadata.Name',
    hint: 'FVTTJSONSPELL.Settings.IndexMetadata.Hint',
    scope: 'world',
    config: false,
    type: Object,
    default: {},
  },
];

export function registerResolverSettings(adapter: ResolverSettingsAdapter): void {
  for (const definition of RESOLVER_SETTING_DEFINITIONS) adapter.registerSetting(definition);
  adapter.registerSettingsMenu({
    key: 'resolverSettings',
    name: 'FVTTJSONSPELL.Settings.Menu.Name',
    label: 'FVTTJSONSPELL.Settings.Menu.Label',
    hint: 'FVTTJSONSPELL.Settings.Menu.Hint',
    icon: 'fa-solid fa-wand-magic-sparkles',
    restricted: true,
  });
}
