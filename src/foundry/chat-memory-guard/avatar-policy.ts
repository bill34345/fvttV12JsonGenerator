import type { AvatarSource } from './settings';

export interface AvatarMessage {
  isContentVisible?: boolean;
  speaker?: { scene?: string; token?: string; actor?: string };
}

export interface AvatarContext {
  message: AvatarMessage;
  systemAvatar?: string;
  canRevealIdentity: boolean;
  sceneTokenAvatar?: string;
  prototypeTokenAvatar?: string;
  actorAvatar?: string;
}

export type AvatarChoice =
  | { kind: 'hidden' }
  | { kind: 'system'; src?: string }
  | { kind: 'image'; src: string };

export function chooseAvatar(source: AvatarSource, context: AvatarContext): AvatarChoice {
  if (source === 'hidden') return { kind: 'hidden' };
  const safeSystem = (): AvatarChoice => ({ kind: 'system', src: context.systemAvatar });
  if (source === 'system') return safeSystem();
  if (context.message.isContentVisible !== true || !context.canRevealIdentity) return safeSystem();
  if (source === 'actor') {
    return context.actorAvatar ? { kind: 'image', src: context.actorAvatar } : safeSystem();
  }
  const token = context.sceneTokenAvatar ?? context.prototypeTokenAvatar ?? context.actorAvatar;
  return token ? { kind: 'image', src: token } : safeSystem();
}
