interface ResolverFoundryPack {
  collection: string;
  documentName: string;
  visible: boolean;
  metadata: {
    name?: string;
    packageName?: string;
    packageType?: 'system' | 'module' | 'world';
    type?: string;
    flags?: Record<string, unknown>;
  };
  getIndex(options: { fields: string[] }): Promise<unknown>;
}

declare const game: {
  version?: string;
  system?: { id?: string; version?: string };
  world?: { id?: string; version?: string };
  user?: { isGM?: boolean };
  packs?: Iterable<ResolverFoundryPack> & { get(id: string): ResolverFoundryPack | undefined };
  modules?: { get(id: string): ({ active?: boolean; version?: string; api?: unknown } & Record<string, unknown>) | undefined };
  settings?: {
    register(namespace: string, key: string, definition: Record<string, unknown>): void;
    registerMenu(namespace: string, key: string, definition: Record<string, unknown>): void;
    get(namespace: string, key: string): unknown;
    set(namespace: string, key: string, value: unknown): Promise<unknown>;
  };
};

declare const Hooks: {
  once(hook: 'init' | 'ready', callback: () => void | Promise<void>): unknown;
};

declare const foundry: {
  utils?: {
    fromUuid(uuid: string): Promise<unknown | null>;
  };
};
