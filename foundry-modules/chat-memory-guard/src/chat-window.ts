export interface ChatWindowAdapter {
  getMessageIds(): string[];
  isAtBottom(): boolean;
  deleteMessage(messageId: string): Promise<unknown>;
  retainedMessages(): number;
  now?(): number;
}

export interface ChatWindowStats {
  renderedMessages: number;
  pendingRemovals: number;
  trimmedMessages: number;
  staleRemovalRetries: number;
}

const REMOVAL_DEADLINE_MS = 1_000;

export class ChatWindowController {
  readonly #adapter: ChatWindowAdapter;
  readonly #pending = new Map<string, number>();
  #queue: Promise<void> = Promise.resolve();
  #trimmedMessages = 0;
  #staleRemovalRetries = 0;

  constructor(adapter: ChatWindowAdapter) {
    this.#adapter = adapter;
  }

  reconcile(): Promise<void> {
    return this.#enqueue(() => this.#reconcile());
  }

  onDomMutation(): Promise<void> {
    return this.#enqueue(async () => {
      const ids = new Set(this.#adapter.getMessageIds());
      for (const id of this.#pending.keys()) {
        if (!ids.has(id)) {
          this.#pending.delete(id);
          this.#trimmedMessages++;
        }
      }
      await this.#reconcile();
    });
  }

  getStats(): ChatWindowStats {
    return {
      renderedMessages: this.#adapter.getMessageIds().length,
      pendingRemovals: this.#pending.size,
      trimmedMessages: this.#trimmedMessages,
      staleRemovalRetries: this.#staleRemovalRetries,
    };
  }

  async #reconcile(): Promise<void> {
    if (!this.#adapter.isAtBottom()) return;
    const now = this.#adapter.now?.() ?? Date.now();
    for (const [id, startedAt] of this.#pending) {
      if ((now - startedAt) <= REMOVAL_DEADLINE_MS) continue;
      this.#pending.delete(id);
      this.#staleRemovalRetries++;
    }

    const ids = this.#adapter.getMessageIds();
    const retained = Math.max(0, Math.floor(this.#adapter.retainedMessages()));
    const overflow = Math.max(0, ids.length - retained);
    if (!overflow) return;

    for (const id of ids.slice(0, overflow)) {
      if (this.#pending.has(id)) continue;
      this.#pending.set(id, now);
      try {
        await this.#adapter.deleteMessage(id);
      } catch (error) {
        this.#pending.delete(id);
        throw error;
      }
    }
  }

  #enqueue(task: () => Promise<void>): Promise<void> {
    const result = this.#queue.then(task, task);
    this.#queue = result.catch(() => {});
    return result;
  }
}
