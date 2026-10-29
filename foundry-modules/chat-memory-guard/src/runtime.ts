import { applyAvatarToCard, createAvatarHookHandlers } from './avatar-rendering';
import { ChatWindowController } from './chat-window';
import {
  DEFAULT_SETTINGS,
  MODULE_ID,
  readEffectiveSettings,
  type ChatMemoryGuardDefaults,
  type FoundrySettingsApi,
} from './settings';
import { ThumbnailCache, type ThumbnailBackend } from './thumbnail-cache';

export function calculateMaximumCacheEntries(retainedMessages: number): number {
  return Math.min(256, Math.max(64, Math.max(0, Math.floor(retainedMessages)) * 2));
}

export function resolveFoundryAvatarContext(game: any, message: any, systemAvatar?: string) {
  const actor = message?.speakerActor ?? game?.actors?.get?.(message?.speaker?.actor);
  const scene = message?.speaker?.scene ? game?.scenes?.get?.(message.speaker.scene) : undefined;
  const token = scene && message?.speaker?.token ? scene.tokens?.get?.(message.speaker.token) : undefined;
  let canRevealIdentity = game?.user?.isGM === true;
  if (!canRevealIdentity && actor && typeof actor.testUserPermission === 'function') {
    try {
      canRevealIdentity = actor.testUserPermission(game.user, 'OBSERVER') === true;
    } catch {
      canRevealIdentity = false;
    }
  }
  return {
    message,
    systemAvatar,
    canRevealIdentity,
    sceneTokenAvatar: token?.texture?.src,
    prototypeTokenAvatar: actor?.prototypeToken?.texture?.src,
    actorAvatar: actor?.img,
  };
}

export interface DisposableChatAttachment {
  observer: Pick<MutationObserver, 'disconnect'>;
  scrollElement: Pick<HTMLElement, 'removeEventListener'>;
  scrollHandler: EventListener;
  retryTimer?: ReturnType<typeof setTimeout>;
}

interface AttachedChat extends DisposableChatAttachment {
  controller: ChatWindowController;
  observer: MutationObserver;
  scrollElement: HTMLElement;
  scrollHandler: () => void;
}

export function disposeChatAttachment(attachment: DisposableChatAttachment): void {
  attachment.observer.disconnect();
  attachment.scrollElement.removeEventListener('scroll', attachment.scrollHandler);
  if (attachment.retryTimer !== undefined) clearTimeout(attachment.retryTimer);
}

export class ChatMemoryGuardRuntime {
  readonly #game: any;
  readonly #hooks: any;
  readonly #ui: any;
  readonly #cache: ThumbnailCache;
  readonly #attached = new Map<any, AttachedChat>();
  #settings: ChatMemoryGuardDefaults = { ...DEFAULT_SETTINGS };
  #started = false;
  #generation = 0;
  readonly #hookIds: Array<{ name: string; id: unknown }> = [];
  readonly #beforeUnload = () => this.stop();

  constructor({ game, hooks, ui, thumbnailBackend }: {
    game: any;
    hooks: any;
    ui: any;
    thumbnailBackend?: ThumbnailBackend;
  }) {
    this.#game = game;
    this.#hooks = hooks;
    this.#ui = ui;
    this.#cache = new ThumbnailCache(
      thumbnailBackend ?? createBrowserThumbnailBackend(),
      () => calculateMaximumCacheEntries(this.#settings.retainedMessages),
      () => console.warn(`${MODULE_ID} | Avatar thumbnail generation failed.`),
    );
  }

  start(): void {
    if (this.#started) return;
    if (typeof this.#hooks?.on !== 'function' || typeof this.#hooks?.off !== 'function') {
      throw new Error('Chat Memory Guard requires public Hook registration and removal.');
    }
    this.#settings = readEffectiveSettings(this.#game.settings as FoundrySettingsApi);
    this.#started = true;
    this.#generation++;
    const avatarHooks = createAvatarHookHandlers((message, card) => this.processAvatar(message, card));
    try {
      this.#listen('renderChatMessageHTML', avatarHooks.renderChatMessageHTML);
      this.#listen('dnd5e.renderChatMessage', avatarHooks.dnd5eRenderChatMessage);
      this.#listen('renderChatLog', (application: any) => this.attachChat(application));
      this.#listen('closeChatLog', (application: any) => this.detachChat(application));
      this.attachChat(this.#ui.chat);
      if (this.#ui.chat?.popout?.rendered) this.attachChat(this.#ui.chat.popout);
      globalThis.addEventListener?.('beforeunload', this.#beforeUnload, { once: true });
    } catch (error) {
      this.stop();
      throw error;
    }
  }

  async refresh(): Promise<void> {
    if (!this.#started) return;
    const generation = ++this.#generation;
    this.#settings = readEffectiveSettings(this.#game.settings as FoundrySettingsApi);
    this.#cache.clear();
    windows: for (const [chat, attachment] of this.#attached) {
      if (attachment.retryTimer !== undefined) clearTimeout(attachment.retryTimer);
      attachment.retryTimer = undefined;
      const ids = readMessageIds(chat);
      for (const id of ids) {
        if (!this.#started || generation !== this.#generation) return;
        if (this.#attached.get(chat) !== attachment) continue windows;
        const message = this.#game.messages?.get?.(id);
        if (message && typeof chat.updateMessage === 'function') await chat.updateMessage(message, { notify: false });
      }
      if (!this.#started || generation !== this.#generation) return;
      if (this.#attached.get(chat) !== attachment) continue;
      if (this.#settings.enabled) await this.#reconcileWithRetry(attachment);
    }
  }

  attachChat(chat: any): void {
    if (!this.#started || !chat?.rendered || this.#attached.has(chat)) return;
    const log = chat.element?.querySelector?.('.chat-log') as HTMLElement | null;
    const scroll = chat.element?.querySelector?.('.chat-scroll') as HTMLElement | null;
    if (!log || !scroll) return;
    const controller = new ChatWindowController({
      getMessageIds: () => readMessageIds(chat),
      isAtBottom: () => chat.isAtBottom === true,
      deleteMessage: (id) => chat.deleteMessage(id),
      retainedMessages: () => this.#settings.enabled ? this.#settings.retainedMessages : Number.MAX_SAFE_INTEGER,
      isActive: () => this.#started && this.#settings.enabled && this.#attached.get(chat) === attachment,
      generation: () => this.#generation,
    });
    const attachment: AttachedChat = {
      controller,
      observer: undefined as unknown as MutationObserver,
      scrollElement: scroll,
      scrollHandler: () => {
        if (this.#settings.enabled) void this.#reconcileWithRetry(attachment);
      },
    };
    attachment.observer = new MutationObserver((records) => {
      if (!this.#started || this.#attached.get(chat) !== attachment) return;
      for (const record of records) {
        for (const node of record.addedNodes) {
          if (node instanceof HTMLElement && node.matches('.message')) {
            const message = this.#game.messages?.get?.(node.dataset.messageId);
            if (message) void this.processAvatar(message, node);
          }
        }
      }
      void attachment.controller.onDomMutation();
    });
    attachment.observer.observe(log, { childList: true });
    scroll.addEventListener('scroll', attachment.scrollHandler, { passive: true });
    this.#attached.set(chat, attachment);
    for (const card of Array.from(log.querySelectorAll<HTMLElement>('.message[data-message-id]'))) {
      const message = this.#game.messages?.get?.(card.dataset.messageId);
      if (message) void this.processAvatar(message, card);
    }
    if (this.#settings.enabled) void this.#reconcileWithRetry(attachment);
  }

  detachChat(chat: any): void {
    const attachment = this.#attached.get(chat);
    if (!attachment) return;
    attachment.controller.dispose();
    disposeChatAttachment(attachment);
    this.#attached.delete(chat);
  }

  async processAvatar(message: any, card: any): Promise<void> {
    if (!this.#started || !this.#settings.enabled) return;
    const generation = this.#generation;
    await applyAvatarToCard({
      message,
      card,
      settings: this.#settings,
      resolveContext: (systemAvatar) => resolveFoundryAvatarContext(this.#game, message, systemAvatar),
      thumbnail: this.#cache,
      defaultAvatar: (globalThis as any).CONST?.DEFAULT_TOKEN,
      isCurrent: () => this.#started && generation === this.#generation,
    });
  }

  getStats() {
    const windows = Array.from(this.#attached.values()).map((entry) => entry.controller.getStats());
    const thumbnail = this.#cache.getStats();
    return {
      renderedMessages: windows.reduce((sum, entry) => sum + entry.renderedMessages, 0),
      trimmedMessages: windows.reduce((sum, entry) => sum + entry.trimmedMessages, 0),
      pendingRemovals: windows.reduce((sum, entry) => sum + entry.pendingRemovals, 0),
      staleRemovalRetries: windows.reduce((sum, entry) => sum + entry.staleRemovalRetries, 0),
      thumbnailCacheEntries: thumbnail.entries,
      thumbnailCacheEstimatedBytes: thumbnail.estimatedBytes,
      thumbnailFailures: thumbnail.failures,
      moduleListenerCount: this.#attached.size,
      effectiveSettings: { ...this.#settings },
    };
  }

  stop(): void {
    if (!this.#started) return;
    this.#started = false;
    this.#generation++;
    for (const { name, id } of this.#hookIds) this.#hooks.off(name, id);
    this.#hookIds.length = 0;
    globalThis.removeEventListener?.('beforeunload', this.#beforeUnload);
    for (const chat of Array.from(this.#attached.keys())) this.detachChat(chat);
    this.#cache.clear();
  }

  #listen(name: string, callback: (...args: any[]) => unknown): void {
    this.#hookIds.push({ name, id: this.#hooks.on(name, callback) });
  }

  async #reconcileWithRetry(attachment: AttachedChat): Promise<void> {
    const generation = this.#generation;
    const current = () => this.#started && this.#settings.enabled && generation === this.#generation
      && Array.from(this.#attached.values()).includes(attachment);
    if (!current()) return;
    await attachment.controller.reconcile();
    if (!current()) return;
    if (!attachment.controller.getStats().pendingRemovals) return;
    if (attachment.retryTimer) clearTimeout(attachment.retryTimer);
    attachment.retryTimer = setTimeout(() => {
      attachment.retryTimer = undefined;
      if (current()) void this.#reconcileWithRetry(attachment);
    }, 1_050);
  }
}

function readMessageIds(chat: any): string[] {
  return Array.from(chat?.element?.querySelectorAll?.('.chat-log .message[data-message-id]') ?? [])
    .map((element: any) => String(element?.dataset?.messageId ?? ''))
    .filter(Boolean);
}

export function createBrowserThumbnailBackend(): ThumbnailBackend {
  return {
    revoke: (url) => URL.revokeObjectURL(url),
    create: async (source, maxEdge, quality) => {
      const response = await fetch(source);
      if (!response.ok) throw new Error(`Avatar request failed with HTTP ${response.status}.`);
      const blob = await response.blob();
      const rendered = blob.type.startsWith('video/')
        ? await renderVideoFrame(blob, maxEdge)
        : await renderImage(blob, maxEdge);
      const output = await encodeRenderedThumbnail(
        rendered,
        (canvas) => canvasToWebp(canvas, quality / 100),
      );
      return { url: URL.createObjectURL(output), bytes: output.size };
    },
  };
}

export async function encodeRenderedThumbnail<T>(
  rendered: { canvas: HTMLCanvasElement; release(): void },
  encode: (canvas: HTMLCanvasElement) => Promise<T>,
): Promise<T> {
  try {
    return await encode(rendered.canvas);
  } finally {
    rendered.release();
  }
}

async function renderImage(blob: Blob, maxEdge: number) {
  const bitmap = await createImageBitmap(blob);
  const canvas = createScaledCanvas(bitmap.width, bitmap.height, maxEdge);
  canvas.getContext('2d')?.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return { canvas, release: () => bitmap.close() };
}

async function renderVideoFrame(blob: Blob, maxEdge: number) {
  const video = document.createElement('video');
  const source = URL.createObjectURL(blob);
  video.muted = true;
  video.playsInline = true;
  video.preload = 'metadata';
  video.src = source;
  try {
    await new Promise<void>((resolve, reject) => {
      video.addEventListener('loadeddata', () => resolve(), { once: true });
      video.addEventListener('error', () => reject(new Error('Animated avatar could not be decoded.')), { once: true });
    });
    const canvas = createScaledCanvas(video.videoWidth, video.videoHeight, maxEdge);
    canvas.getContext('2d')?.drawImage(video, 0, 0, canvas.width, canvas.height);
    return {
      canvas,
      release: () => {
        video.removeAttribute('src');
        video.load();
        URL.revokeObjectURL(source);
      },
    };
  } catch (error) {
    video.removeAttribute('src');
    URL.revokeObjectURL(source);
    throw error;
  }
}

function createScaledCanvas(width: number, height: number, maxEdge: number): HTMLCanvasElement {
  if (!width || !height) throw new Error('Avatar has invalid dimensions.');
  const scale = Math.min(1, maxEdge / Math.max(width, height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  return canvas;
}

function canvasToWebp(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => canvas.toBlob(
    (blob) => blob ? resolve(blob) : reject(new Error('Browser could not encode the avatar as WebP.')),
    'image/webp',
    quality,
  ));
}
