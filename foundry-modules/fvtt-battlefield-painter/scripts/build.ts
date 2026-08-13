import {
  cp,
  lstat,
  mkdir,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { relative, resolve } from "node:path";

export const MODULE_ID = "fvtt-battlefield-painter" as const;
export const MODULE_VERSION = "0.3.0-alpha.1" as const;

const root = resolve(import.meta.dir, "..");
const dist = resolve(root, "dist");
const moduleRoot = resolve(dist, "module");

export const validateManifest = (manifest: Record<string, any>): void => {
  if (manifest.id !== MODULE_ID || manifest.version !== MODULE_VERSION) {
    throw new Error("Manifest identity/version mismatch");
  }

  const core = manifest.compatibility ?? {};
  if (
    core.minimum !== "14.364" ||
    core.verified !== "14.364" ||
    core.maximum !== "14.364"
  ) {
    throw new Error("Foundry compatibility must be exactly 14.364");
  }

  const dnd5e = (manifest.relationships?.systems ?? []).find(
    (system: any) => system.id === "dnd5e",
  );
  const compatibility = dnd5e?.compatibility ?? {};
  if (
    compatibility.minimum !== "5.3.3" ||
    compatibility.verified !== "5.3.3" ||
    compatibility.maximum !== "5.3.3"
  ) {
    throw new Error("dnd5e compatibility must be exactly 5.3.3");
  }

  if (JSON.stringify(manifest.esmodules) !== JSON.stringify(["scripts/main.js"])) {
    throw new Error("Manifest browser entry drifted");
  }
  if (JSON.stringify(manifest.styles) !== JSON.stringify(["styles/painter.css"])) {
    throw new Error("Manifest stylesheet entry drifted");
  }
  if (manifest.relationships?.requires) {
    throw new Error("Battlefield Painter must not have hard module dependencies");
  }
};

const mediaFiles = [
  "assets/terrain/fire-embers.webm",
  "assets/terrain/fire-blaze.webm",
  "assets/terrain/frost-rime.webm",
  "assets/terrain/frost-deep.webm",
  "assets/terrain/brambles-creeping.webm",
  "assets/terrain/brambles-thicket.webm",
  "assets/audio/fire.ogg",
  "assets/audio/frost.ogg",
  "assets/audio/brambles.ogg",
] as const;

const hasPrefix = (bytes: Uint8Array, prefix: readonly number[]): boolean =>
  prefix.every((value, index) => bytes[index] === value);

export const validateMediaAssets = async (moduleRoot: string): Promise<void> => {
  for (const relativePath of mediaFiles) {
    const path = resolve(moduleRoot, relativePath);
    const bytes = new Uint8Array(await readFile(path));
    if (bytes.length < 1024) throw new Error(`Media asset is unexpectedly small: ${relativePath}`);
    const valid = relativePath.endsWith(".webm")
      ? hasPrefix(bytes, [0x1a, 0x45, 0xdf, 0xa3]) &&
        new TextDecoder().decode(bytes).toLowerCase().includes("alpha_mode")
      : hasPrefix(bytes, [0x4f, 0x67, 0x67, 0x53]);
    if (!valid) throw new Error(`Media asset has an invalid container signature: ${relativePath}`);
  }
};

export const buildModule = async (): Promise<{
  moduleRoot: string;
  zipPath: string;
  files: string[];
}> => {
  if (await exists(dist)) await rm(dist, { recursive: true });
  await mkdir(resolve(moduleRoot, "scripts"), { recursive: true });

  const build = await Bun.build({
    entrypoints: [resolve(root, "src/main.ts")],
    outdir: resolve(moduleRoot, "scripts"),
    naming: "main.js",
    target: "browser",
    format: "esm",
    splitting: false,
    minify: false,
    sourcemap: "none",
  });
  if (!build.success) {
    throw new Error(`Browser build failed: ${build.logs.map(String).join("; ")}`);
  }

  await cp(resolve(root, "module.json"), resolve(moduleRoot, "module.json"));
  await cp(resolve(root, "templates"), resolve(moduleRoot, "templates"), {
    recursive: true,
  });
  await cp(resolve(root, "styles"), resolve(moduleRoot, "styles"), {
    recursive: true,
  });
  await cp(resolve(root, "assets"), resolve(moduleRoot, "assets"), {
    recursive: true,
  });
  await validateMediaAssets(moduleRoot);
  await cp(resolve(root, "README.zh-CN.md"), resolve(moduleRoot, "README.zh-CN.md"));

  const manifest = JSON.parse(
    await readFile(resolve(moduleRoot, "module.json"), "utf8"),
  );
  validateManifest(manifest);

  const browserBundle = await readFile(
    resolve(moduleRoot, "scripts/main.js"),
    "utf8",
  );
  const forbidden = [/node:/i, /process\.env/i, /from ['"](?:node:|fs|path|os)/i];
  const match = forbidden.find((pattern) => pattern.test(browserBundle));
  if (match) {
    throw new Error(`Browser bundle contains a server-only dependency: ${match}`);
  }

  const filePaths = await collectFiles(moduleRoot);
  const entries = await Promise.all(
    filePaths.map(async (path) => ({
      name: relative(moduleRoot, path).replace(/\\/g, "/"),
      bytes: new Uint8Array(await readFile(path)),
    })),
  );
  const zipPath = resolve(dist, `${MODULE_ID}.zip`);
  await writeFile(zipPath, createStoredZip(entries));

  return { moduleRoot, zipPath, files: entries.map(({ name }) => name) };
};

const collectFiles = async (directory: string): Promise<string[]> => {
  const files: string[] = [];
  const visit = async (current: string): Promise<void> => {
    const entries = await readdir(current, { withFileTypes: true });
    entries.sort((a, b) => a.name.localeCompare(b.name, "en"));
    for (const entry of entries) {
      const path = resolve(current, entry.name);
      const stats = await lstat(path);
      if (stats.isSymbolicLink()) {
        throw new Error(`Build tree contains a symlink or junction: ${path}`);
      }
      if (stats.isDirectory()) await visit(path);
      else if (stats.isFile()) files.push(path);
    }
  };
  await visit(directory);
  return files;
};

interface ZipEntry {
  name: string;
  bytes: Uint8Array;
}

export const createStoredZip = (entries: ZipEntry[]): Uint8Array => {
  const ordered = [...entries].sort((a, b) => a.name.localeCompare(b.name, "en"));
  const encoder = new TextEncoder();
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;

  for (const entry of ordered) {
    const name = encoder.encode(entry.name);
    const crc = crc32(entry.bytes);
    const local = new Uint8Array(30 + name.length + entry.bytes.length);
    const localView = new DataView(local.buffer);
    localView.setUint32(0, 0x04034b50, true);
    localView.setUint16(4, 20, true);
    localView.setUint16(6, 0x0800, true);
    localView.setUint32(14, crc, true);
    localView.setUint32(18, entry.bytes.length, true);
    localView.setUint32(22, entry.bytes.length, true);
    localView.setUint16(26, name.length, true);
    local.set(name, 30);
    local.set(entry.bytes, 30 + name.length);
    locals.push(local);

    const central = new Uint8Array(46 + name.length);
    const centralView = new DataView(central.buffer);
    centralView.setUint32(0, 0x02014b50, true);
    centralView.setUint16(4, 20, true);
    centralView.setUint16(6, 20, true);
    centralView.setUint16(8, 0x0800, true);
    centralView.setUint32(16, crc, true);
    centralView.setUint32(20, entry.bytes.length, true);
    centralView.setUint32(24, entry.bytes.length, true);
    centralView.setUint16(28, name.length, true);
    centralView.setUint32(42, offset, true);
    central.set(name, 46);
    centrals.push(central);
    offset += local.length;
  }

  const centralSize = centrals.reduce((sum, entry) => sum + entry.length, 0);
  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(8, ordered.length, true);
  endView.setUint16(10, ordered.length, true);
  endView.setUint32(12, centralSize, true);
  endView.setUint32(16, offset, true);
  return concat([...locals, ...centrals, end]);
};

const concat = (parts: Uint8Array[]): Uint8Array => {
  const output = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }
  return output;
};

const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[index] = value;
  }
  return table;
})();

const crc32 = (bytes: Uint8Array): number => {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc = (crc >>> 8) ^ crcTable[(crc ^ byte) & 0xff]!;
  }
  return (crc ^ 0xffffffff) >>> 0;
};

const exists = async (path: string): Promise<boolean> =>
  Boolean(await lstat(path).catch(() => undefined));

if (import.meta.main) {
  console.log(JSON.stringify({ ok: true, ...(await buildModule()) }, null, 2));
}
