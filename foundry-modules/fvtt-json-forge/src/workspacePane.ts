/** Application-owned panes reuse the existing workflows without registering child windows. */
export interface ForgePaneBinding {
  active(): boolean;
  changed(): void;
}

export interface ForgePaneState {
  stage: 'input' | 'review' | 'created';
  locked: boolean;
}

export interface ForgeWorkspacePane {
  mount(root: HTMLElement): void;
  suspend(): boolean;
  dispose(): Promise<unknown>;
  workspaceState(): ForgePaneState;
  _prepareContext(): Promise<Record<string, unknown>>;
}

/** A local controller base, never a Foundry Application or a prototype override. */
export function createForgePaneBase() {
  return class ForgePaneController {
    private paneRoot?: HTMLElement;
    get element(): HTMLElement | undefined { return this.paneRoot; }
    mount(root: HTMLElement): void {
      this.paneRoot = root;
      (this as any)._onRender({}, {});
    }
    suspend(): boolean { return (this as any).invalidateWorkspaceCandidate(); }
    async dispose(): Promise<unknown> { return (this as any).close(); }
    async close(_options?: unknown): Promise<this> { this.paneRoot = undefined; return this; }
  };
}
