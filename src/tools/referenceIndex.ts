import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { dirname, extname, join, relative, resolve } from 'node:path';

export interface FoundryApiDocEntry {
  relativePath: string;
  title: string;
  headings: string[];
  kind: 'index' | 'class' | 'other';
  name: string;
  textRelativePath: string;
}

export interface DndRepoFileEntry {
  relativePath: string;
  extension: string;
  category: string;
  symbols: string[];
  tokens: string[];
  bytes: number;
}

export interface ReferenceIndexSummary {
  foundryApiDocs: number;
  foundryTextFiles: number;
  dndRepoFiles: number;
  dndTokenCount: number;
}

const DND_TEXT_EXTENSIONS = new Set([
  '.js',
  '.mjs',
  '.cjs',
  '.ts',
  '.json',
  '.hbs',
  '.html',
  '.md',
  '.yml',
  '.yaml',
]);

export function decodeHtmlEntities(value: string): string {
  const named: Record<string, string> = {
    '&nbsp;': ' ',
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&#39;': "'",
  };

  let decoded = value;
  for (const [entity, replacement] of Object.entries(named)) {
    decoded = decoded.replaceAll(entity, replacement);
  }

  decoded = decoded.replace(/&#(\d+);/g, (_match, code) =>
    String.fromCodePoint(Number.parseInt(code, 10)),
  );
  decoded = decoded.replace(/&#x([0-9a-f]+);/gi, (_match, code) =>
    String.fromCodePoint(Number.parseInt(code, 16)),
  );

  return decoded;
}

export function extractHtmlDocData(html: string): { title: string; headings: string[]; text: string } {
  const withoutScripts = html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ');

  const titleMatch = withoutScripts.match(/<title>([\s\S]*?)<\/title>/i);
  const title = decodeHtmlEntities((titleMatch?.[1] ?? '').replace(/\s+/g, ' ').trim());

  const headings = Array.from(
    withoutScripts.matchAll(/<h[1-6][^>]*>([\s\S]*?)<\/h[1-6]>/gi),
    (match) =>
      decodeHtmlEntities(match[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()),
  ).filter(Boolean);

  const text = decodeHtmlEntities(
    withoutScripts
      .replace(/<\/?(?:p|div|section|article|header|footer|li|ul|ol|tr|td|th|table|h[1-6]|br)[^>]*>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\r/g, '')
      .replace(/[ \t]+\n/g, '\n')
      .replace(/\n{3,}/g, '\n\n')
      .replace(/[ \t]{2,}/g, ' ')
      .trim(),
  );

  return { title, headings, text };
}

export function extractSourceSymbols(content: string): string[] {
  const symbols = new Set<string>();
  const patterns = [
    /\bexport\s+class\s+([A-Za-z_]\w*)/g,
    /\bclass\s+([A-Za-z_]\w*)/g,
    /\bexport\s+function\s+([A-Za-z_]\w*)/g,
    /\bfunction\s+([A-Za-z_]\w*)/g,
    /\bexport\s+const\s+([A-Za-z_]\w*)/g,
    /\bexport\s+let\s+([A-Za-z_]\w*)/g,
    /\bexport\s+var\s+([A-Za-z_]\w*)/g,
  ];

  for (const pattern of patterns) {
    for (const match of content.matchAll(pattern)) {
      if (match[1]) symbols.add(match[1]);
    }
  }

  return Array.from(symbols).sort();
}

export function tokenizePath(relativePath: string): string[] {
  const normalized = relativePath.replace(/\\/g, '/').toLowerCase();
  const stem = normalized.replace(/\.[^.]+$/, '');
  const rawTokens = stem.split(/[^a-z0-9]+/g).filter(Boolean);
  return Array.from(new Set(rawTokens.filter((token) => token.length >= 3))).sort();
}

export function buildReferenceIndexes(projectRoot = process.cwd()): ReferenceIndexSummary {
  const root = resolve(projectRoot);
  const referencesDir = join(root, 'references');
  const indexesDir = join(referencesDir, 'indexes');
  const foundryCoreDir = join(referencesDir, 'foundry-v12-api-core');
  const foundryTextDir = join(referencesDir, 'foundry-v12-api-core-text');
  const dndRepoDir = join(referencesDir, 'dnd5e-4.3.9', 'repo');

  mkdirSync(indexesDir, { recursive: true });
  mkdirSync(foundryTextDir, { recursive: true });

  const foundryEntries: FoundryApiDocEntry[] = [];
  const foundryTokenMap: Record<string, string[]> = Object.create(null);

  for (const filePath of walkFiles(foundryCoreDir)) {
    if (extname(filePath).toLowerCase() !== '.html') continue;
    const relativePath = toPosix(relative(foundryCoreDir, filePath));
    const raw = readFileSync(filePath, 'utf8');
    const doc = extractHtmlDocData(raw);
    const textRelativePath = relativePath.replace(/\.html$/i, '.txt');
    const outPath = join(foundryTextDir, textRelativePath);
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, doc.text);

    const kind: FoundryApiDocEntry['kind'] =
      relativePath === 'index.html' ? 'index' : relativePath.includes('/classes/') ? 'class' : 'other';
    const name = relativePath
      .split('/')
      .pop()
      ?.replace(/\.html$/i, '') ?? relativePath;

    foundryEntries.push({
      relativePath,
      title: doc.title,
      headings: doc.headings.slice(0, 24),
      kind,
      name,
      textRelativePath: toPosix(textRelativePath),
    });

    const tokens = new Set([
      ...tokenizePath(relativePath),
      ...tokenizePath(doc.title),
      ...doc.headings.flatMap((heading) => tokenizePath(heading)),
    ]);
    for (const token of tokens) {
      const current = foundryTokenMap[token] ?? [];
      if (!current.includes(relativePath)) current.push(relativePath);
      foundryTokenMap[token] = current.sort();
    }
  }

  const dndEntries: DndRepoFileEntry[] = [];
  const dndTokenMap: Record<string, string[]> = Object.create(null);

  for (const filePath of walkFiles(dndRepoDir)) {
    const extension = extname(filePath).toLowerCase();
    if (!DND_TEXT_EXTENSIONS.has(extension)) continue;
    const relativePath = toPosix(relative(dndRepoDir, filePath));
    const bytes = statSync(filePath).size;
    const raw = readFileSync(filePath, 'utf8');
    const symbols = extractSourceSymbols(raw);
    const pathTokens = tokenizePath(relativePath);
    const symbolTokens = symbols.flatMap((symbol) => tokenizePath(symbol));
    const tokens = Array.from(new Set([...pathTokens, ...symbolTokens])).sort();
    const category = relativePath.split('/')[0] ?? 'root';

    dndEntries.push({
      relativePath,
      extension,
      category,
      symbols,
      tokens,
      bytes,
    });

    for (const token of tokens) {
      const current = dndTokenMap[token] ?? [];
      if (!current.includes(relativePath)) current.push(relativePath);
      dndTokenMap[token] = current.sort();
    }
  }

  writeFileSync(
    join(indexesDir, 'foundry-v12-api-core-index.json'),
    JSON.stringify(foundryEntries, null, 2),
  );
  writeFileSync(
    join(indexesDir, 'foundry-v12-api-core-token-index.json'),
    JSON.stringify(foundryTokenMap, null, 2),
  );
  writeFileSync(
    join(indexesDir, 'dnd5e-4.3.9-file-index.json'),
    JSON.stringify(dndEntries, null, 2),
  );
  writeFileSync(
    join(indexesDir, 'dnd5e-4.3.9-token-index.json'),
    JSON.stringify(dndTokenMap, null, 2),
  );

  return {
    foundryApiDocs: foundryEntries.length,
    foundryTextFiles: foundryEntries.length,
    dndRepoFiles: dndEntries.length,
    dndTokenCount: Object.keys(dndTokenMap).length,
  };
}

function walkFiles(root: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    const full = join(root, entry.name);
    if (entry.isDirectory()) {
      out.push(...walkFiles(full));
      continue;
    }
    if (entry.isFile()) {
      out.push(full);
    }
  }
  return out;
}

function toPosix(value: string): string {
  return value.replaceAll('\\', '/');
}

if (import.meta.main) {
  const summary = buildReferenceIndexes(process.cwd());
  console.log(JSON.stringify(summary, null, 2));
}
