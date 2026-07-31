import { describe, expect, test } from 'bun:test';
import {
  calculateMaximumCacheEntries,
  disposeChatAttachment,
  encodeRenderedThumbnail,
  resolveFoundryAvatarContext,
} from '../runtime';

describe('Foundry runtime avatar resolution', () => {
  test('resolves exact speaker token and actor artwork without name guessing', () => {
    const actor = {
      img: 'actor.webp',
      prototypeToken: { texture: { src: 'prototype.webp' } },
      testUserPermission: () => true,
    };
    const game = {
      user: { isGM: false },
      scenes: { get: () => ({ tokens: { get: () => ({ texture: { src: 'scene.webp' } }) } }) },
      actors: { get: () => actor },
    };
    const message = {
      isContentVisible: true,
      speaker: { scene: 's1', token: 't1', actor: 'a1' },
      speakerActor: actor,
    };
    expect(resolveFoundryAvatarContext(game, message, 'system.webp')).toMatchObject({
      canRevealIdentity: true,
      sceneTokenAvatar: 'scene.webp',
      prototypeTokenAvatar: 'prototype.webp',
      actorAvatar: 'actor.webp',
      systemAvatar: 'system.webp',
    });
  });

  test('fails closed when Actor permission cannot be proven', () => {
    const actor = { img: 'secret.webp', testUserPermission: () => false };
    const game = { user: { isGM: false }, scenes: { get: () => undefined }, actors: { get: () => actor } };
    const context = resolveFoundryAvatarContext(game, {
      isContentVisible: true,
      speaker: { actor: 'a1' },
      speakerActor: actor,
    }, 'safe.webp');
    expect(context.canRevealIdentity).toBe(false);
  });

  test('caps the cache at max(64, retained times two) with a 256 hard ceiling', () => {
    expect(calculateMaximumCacheEntries(20)).toBe(64);
    expect(calculateMaximumCacheEntries(40)).toBe(80);
    expect(calculateMaximumCacheEntries(200)).toBe(256);
  });

  test('releases decoded image or video resources when WebP encoding fails', async () => {
    let released = 0;
    await expect(encodeRenderedThumbnail(
      { canvas: {} as HTMLCanvasElement, release: () => { released++; } },
      async () => { throw new Error('encode failed'); },
    )).rejects.toThrow('encode failed');
    expect(released).toBe(1);
  });

  test('disconnects every observer and listener when a chat popout closes', () => {
    let disconnected = 0;
    let removed = 0;
    let cleared: unknown;
    const previousClearTimeout = globalThis.clearTimeout;
    globalThis.clearTimeout = ((timer: unknown) => { cleared = timer; }) as typeof clearTimeout;
    try {
      const scrollHandler = () => {};
      disposeChatAttachment({
        observer: { disconnect: () => { disconnected++; } },
        scrollElement: {
          removeEventListener: (name: string, handler: EventListenerOrEventListenerObject) => {
            expect(name).toBe('scroll');
            expect(handler).toBe(scrollHandler);
            removed++;
          },
        },
        scrollHandler,
        retryTimer: 17 as unknown as ReturnType<typeof setTimeout>,
      });
      expect(disconnected).toBe(1);
      expect(removed).toBe(1);
      expect(cleared).toBe(17);
    } finally {
      globalThis.clearTimeout = previousClearTimeout;
    }
  });
});
