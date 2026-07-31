import { describe, expect, test } from 'bun:test';
import { chooseAvatar } from '../avatar-policy';

const visibleMessage = {
  isContentVisible: true,
  speaker: { scene: 'scene', token: 'token', actor: 'actor' },
};

describe('avatar policy', () => {
  test('uses scene token, prototype token, actor and system fallback in stable order', () => {
    const context = {
      message: visibleMessage,
      systemAvatar: 'system.webp',
      canRevealIdentity: true,
      sceneTokenAvatar: 'scene.webp',
      prototypeTokenAvatar: 'prototype.webp',
      actorAvatar: 'actor.webp',
    };
    expect(chooseAvatar('token', context)).toEqual({ kind: 'image', src: 'scene.webp' });
    expect(chooseAvatar('token', { ...context, sceneTokenAvatar: undefined })).toEqual({
      kind: 'image', src: 'prototype.webp',
    });
    expect(chooseAvatar('actor', context)).toEqual({ kind: 'image', src: 'actor.webp' });
    expect(chooseAvatar('system', context)).toEqual({ kind: 'system', src: 'system.webp' });
    expect(chooseAvatar('hidden', context)).toEqual({ kind: 'hidden' });
  });

  test('never reveals token or actor artwork for hidden content or unauthorized identity', () => {
    const unsafe = {
      message: { ...visibleMessage, isContentVisible: false },
      systemAvatar: 'safe-user.webp',
      canRevealIdentity: true,
      sceneTokenAvatar: 'secret-token.webp',
      actorAvatar: 'secret-actor.webp',
    };
    expect(chooseAvatar('token', unsafe)).toEqual({ kind: 'system', src: 'safe-user.webp' });
    expect(chooseAvatar('actor', { ...unsafe, message: visibleMessage, canRevealIdentity: false })).toEqual({
      kind: 'system', src: 'safe-user.webp',
    });
  });
});
