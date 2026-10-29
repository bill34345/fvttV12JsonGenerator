export type HandbookCategory = 'convert' | 'library' | 'play' | 'maintain';
export type HandbookTheme = 'light' | 'dark';

/** A presentation snapshot of the current client's module registry. */
export interface HandbookModuleState {
  readonly state: 'enabled' | 'disabled' | 'missing' | 'unknown';
  readonly version?: string;
}

export interface HandbookEntry {
  readonly id: string;
  readonly entryId: string;
  readonly ownerDirectory: string;
  readonly foundryModuleId: string | null;
  readonly module?: string;
  readonly category: HandbookCategory;
  readonly title: string;
  readonly summary: string;
  readonly when: string;
  readonly requires: readonly string[];
  readonly steps: readonly { readonly title: string; readonly text: string; readonly command?: string }[];
  readonly outputs: readonly string[];
  readonly limits: readonly string[];
  readonly keywords: readonly string[];
  readonly sources: readonly string[];
  readonly watch: readonly string[];
}

export interface HandbookReview {
  readonly fingerprint: string;
  readonly reviewedOn: string;
  readonly note: string;
}

export interface HandbookContent {
  readonly schemaVersion: 1;
  readonly entries: readonly HandbookEntry[];
  readonly reviews: Readonly<Record<string, HandbookReview>>;
  readonly sources: Readonly<Record<string, string>>;
}

export type HandbookRoute =
  | { readonly kind: 'home' | 'guide' | 'updates' | 'missing'; readonly title: string; readonly decoded: string }
  | { readonly kind: 'search'; readonly title: string; readonly decoded: string; readonly query: string }
  | { readonly kind: 'category'; readonly title: string; readonly decoded: string; readonly category: HandbookCategory | 'all'; readonly entries: readonly HandbookEntry[] }
  | { readonly kind: 'tool'; readonly title: string; readonly decoded: string; readonly entry: HandbookEntry }
  | { readonly kind: 'source'; readonly title: string; readonly decoded: string; readonly path: string; readonly text: string; readonly owners: readonly HandbookEntry[] };

export interface HandbookModel {
  readonly content: HandbookContent;
  readonly sourceNames: readonly string[];
  readonly latestReview: string;
  resolveRoute(rawRoute: string): HandbookRoute;
  search(query: string): readonly HandbookEntry[];
}

/** Only a host adapter may touch its URL, persistent theme, clipboard or page title. */
export interface HandbookHost {
  readonly surface?: 'standalone' | 'foundry';
  readonly initialRoute?: string;
  readonly initialTheme?: HandbookTheme;
  readonly idPrefix?: string;
  readonly contentDigest?: string;
  readModuleState?(moduleId: string): HandbookModuleState;
  href?(route: string): string;
  onNavigate?(route: string, options: { readonly replace: boolean }): void;
  onTitleChange?(title: string): void;
  onThemeChange?(theme: HandbookTheme): void;
  copyText?(text: string): Promise<void>;
  scrollToTop?(main: HTMLElement): void;
  subscribeRoute?(navigate: (route: string) => void): () => void;
  subscribeShortcuts?(keydown: (event: KeyboardEvent) => void): () => void;
}

export interface HandbookHandle {
  /** Accepts a stable entry ID or a handbook route; never changes the host URL itself. */
  navigate(entryIdOrRoute: string, section?: string): void;
  dispose(): void;
}
