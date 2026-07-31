import { chooseAvatar, type AvatarContext, type AvatarMessage } from './avatar-policy';
import type { ChatMemoryGuardDefaults } from './settings';

interface MediaLike {
  tagName?: string;
  src: string;
  currentSrc?: string;
  removeAttribute?(name: string): void;
  replaceWith?(replacement: MediaLike): void;
  ownerDocument?: { createElement(tag: string): MediaLike };
}

interface AvatarLike {
  classList: { toggle(name: string, value?: boolean): unknown };
  querySelector(selector: string): MediaLike | null;
  replaceChildren(...children: unknown[]): void;
}

interface CardLike {
  querySelector(selector: string): AvatarLike | null;
}

export interface AvatarThumbnailCache {
  get(source: string, maxEdge: number, quality: number): Promise<string | undefined>;
}

export interface ApplyAvatarInput {
  message: AvatarMessage;
  card: CardLike;
  settings: ChatMemoryGuardDefaults;
  resolveContext(systemAvatar?: string): AvatarContext;
  thumbnail?: AvatarThumbnailCache;
  defaultAvatar?: string;
}

const generations = new WeakMap<object, number>();

export async function applyAvatarToCard(input: ApplyAvatarInput): Promise<void> {
  const avatar = input.card.querySelector('.message-header .message-sender .avatar');
  if (!avatar) return;
  const generation = (generations.get(avatar as object) ?? 0) + 1;
  generations.set(avatar as object, generation);
  let media = avatar.querySelector('img, video');
  const systemAvatar = media?.currentSrc || media?.src;
  const choice = chooseAvatar(input.settings.avatarSource, input.resolveContext(systemAvatar));
  avatar.classList.toggle('cmg-avatar-hidden', choice.kind === 'hidden');

  if (choice.kind === 'hidden') {
    media?.removeAttribute?.('src');
    avatar.replaceChildren();
    return;
  }
  if (choice.kind === 'system' || input.settings.imageMode === 'original') {
    if (choice.src && media) media.src = choice.src;
    return;
  }

  const source = choice.src;
  if (!media || !input.thumbnail) return;
  if (media.tagName?.toUpperCase() === 'VIDEO') {
    const replacement = media.ownerDocument?.createElement('img')
      ?? (globalThis as any).document?.createElement?.('img');
    if (replacement) {
      media.removeAttribute?.('src');
      media.replaceWith?.(replacement);
      media = replacement;
    }
  }
  if (!media) return;
  media.removeAttribute?.('src');
  media.src = '';
  const thumbnail = await input.thumbnail.get(
    source,
    input.settings.thumbnailMaxEdge,
    input.settings.thumbnailQuality,
  );
  if (generations.get(avatar as object) !== generation) return;
  media.src = thumbnail ?? input.defaultAvatar ?? 'icons/svg/mystery-man.svg';
}

export type AvatarHookPhase = 'core' | 'dnd5e';

export function createAvatarHookHandlers(
  process: (message: unknown, card: unknown, phase: AvatarHookPhase) => void | Promise<void>,
) {
  return {
    renderChatMessageHTML: (message: unknown, card: unknown) => process(message, card, 'core'),
    dnd5eRenderChatMessage: (message: unknown, card: unknown) => process(message, card, 'dnd5e'),
  };
}
