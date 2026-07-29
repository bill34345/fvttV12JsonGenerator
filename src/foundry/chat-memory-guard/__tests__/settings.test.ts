import { describe, expect, test } from 'bun:test';
import { DEFAULT_SETTINGS, normalizeDefaults, parseSettingsForm, resolveEffectiveSettings } from '../settings';

describe('chat memory guard settings', () => {
  test('normalizes world defaults to the supported boundaries', () => {
    expect(normalizeDefaults({
      enabled: 'yes',
      retainedMessages: 3,
      avatarSource: 'unknown',
      imageMode: 'huge',
      thumbnailMaxEdge: 999,
      thumbnailQuality: 2,
    })).toEqual({
      ...DEFAULT_SETTINGS,
      retainedMessages: 20,
      thumbnailMaxEdge: 256,
      thumbnailQuality: 40,
    });
  });

  test('uses normalized client overrides only when world following is disabled', () => {
    const world = { ...DEFAULT_SETTINGS, retainedMessages: 80, avatarSource: 'actor' as const };
    expect(resolveEffectiveSettings(world, {
      followWorldDefaults: true,
      overrides: { ...DEFAULT_SETTINGS, retainedMessages: 20 },
    })).toEqual(world);
    expect(resolveEffectiveSettings(world, {
      followWorldDefaults: false,
      overrides: { ...DEFAULT_SETTINGS, retainedMessages: 500, avatarSource: 'hidden' },
    })).toMatchObject({ retainedMessages: 200, avatarSource: 'hidden' });
  });

  test('parses the two-layer Foundry settings form without granting world writes to players', () => {
    const parsed = parseSettingsForm({
      'world.enabled': 'on',
      'world.retainedMessages': '60',
      'world.avatarSource': 'actor',
      'world.imageMode': 'original',
      'client.followWorldDefaults': '',
      'client.enabled': 'on',
      'client.retainedMessages': '25',
      'client.avatarSource': 'hidden',
      'client.imageMode': 'thumbnail',
      'client.thumbnailMaxEdge': '96',
      'client.thumbnailQuality': '70',
    });
    expect(parsed.world).toMatchObject({ enabled: true, retainedMessages: 60, avatarSource: 'actor' });
    expect(parsed.client).toMatchObject({
      followWorldDefaults: false,
      overrides: { enabled: true, retainedMessages: 25, avatarSource: 'hidden' },
    });
  });
});
