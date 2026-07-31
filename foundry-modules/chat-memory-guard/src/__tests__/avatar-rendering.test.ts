import { describe, expect, test } from 'bun:test';
import { applyAvatarToCard, createAvatarHookHandlers } from '../avatar-rendering';
import { DEFAULT_SETTINGS } from '../settings';

function createCard(source = 'original.webp') {
  const media = {
    tagName: 'IMG',
    src: source,
    currentSrc: source,
    removed: [] as string[],
    removeAttribute(name: string) { this.removed.push(name); if (name === 'src') this.src = ''; },
  };
  const avatar = {
    hidden: false,
    classes: new Set<string>(),
    querySelector: () => media,
    classList: { toggle: (name: string, value: boolean) => value ? avatar.classes.add(name) : avatar.classes.delete(name) },
    replaceChildren: () => { media.src = ''; },
  };
  return {
    media,
    avatar,
    card: { querySelector: () => avatar },
  };
}

describe('avatar card rendering', () => {
  test('clears the original source before awaiting a dnd5e thumbnail', async () => {
    const fixture = createCard();
    let resolveThumbnail!: (value: string) => void;
    const thumbnail = new Promise<string>((resolve) => { resolveThumbnail = resolve; });
    const pending = applyAvatarToCard({
      message: { isContentVisible: true },
      card: fixture.card,
      settings: { ...DEFAULT_SETTINGS, avatarSource: 'actor', imageMode: 'thumbnail' },
      resolveContext: () => ({
        message: { isContentVisible: true },
        canRevealIdentity: true,
        actorAvatar: 'actor.webp',
        systemAvatar: 'original.webp',
      }),
      thumbnail: { get: () => thumbnail },
    });
    expect(fixture.media.src).toBe('');
    resolveThumbnail('blob:actor');
    await pending;
    expect(fixture.media.src).toBe('blob:actor');
  });

  test('hidden mode removes media without changing the speaker title', async () => {
    const fixture = createCard();
    await applyAvatarToCard({
      message: { isContentVisible: true },
      card: fixture.card,
      settings: { ...DEFAULT_SETTINGS, avatarSource: 'hidden' },
      resolveContext: () => ({
        message: { isContentVisible: true },
        canRevealIdentity: true,
        systemAvatar: 'original.webp',
      }),
    });
    expect(fixture.avatar.classes.has('cmg-avatar-hidden')).toBe(true);
    expect(fixture.media.src).toBe('');
  });

  test('uses both Core and dnd5e post-enrichment hooks idempotently', async () => {
    const calls: string[] = [];
    const handlers = createAvatarHookHandlers(async (_message, _card, phase) => { calls.push(phase); });
    await handlers.renderChatMessageHTML({}, {});
    await handlers.dnd5eRenderChatMessage({}, {});
    expect(calls).toEqual(['core', 'dnd5e']);
  });
});
