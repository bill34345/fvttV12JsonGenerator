import {
  access,
  copyFile,
  readFile,
  rename,
  writeFile,
} from "node:fs/promises";
import { resolve } from "node:path";

import { assertInsideLabRoot, type FoundryLabConfig } from "./config";

export interface PatchResult {
  source: string;
  changed: boolean;
}

interface PackedIndex {
  x: Array<Record<string, unknown>>;
  m: Record<string, Record<string, string | number>>;
}

interface PackedFoundryExtras {
  l?: unknown;
  ft?: unknown;
}

const PATCH_SENTINEL = "PLUTONIUM_QUICK_INSERT_COMPAT_V2_15_6";
const LOAD_MARKER =
  "const data = Omnidexer.decompressIndex(await DataUtil.loadJSON(`${Renderer.get().baseUrl}search/index-foundry.json`));";
const UNPACK_MARKER = "FoundryOmnidexerUtils.unpackFoundryExtras(";
const PACK_MARKER = "FoundryOmnidexerUtils.getPackedFoundryExtras({prop, ent})";

export function decompressPlutoniumIndex(
  indexGroup: PackedIndex,
): Array<Record<string, unknown>> {
  const { x: index, m: metadata } = indexGroup;
  const properties = new Set(Object.keys(metadata));
  const lookup: Record<string, Record<string, string>> = {};

  for (const [property, values] of Object.entries(metadata)) {
    lookup[property] = {};
    for (const [key, value] of Object.entries(values)) {
      lookup[property][String(value)] = key;
    }
  }

  return index.map((entry) => {
    const expanded = { ...entry };
    for (const property of Object.keys(expanded).filter((key) =>
      properties.has(key)
    )) {
      const value = String(expanded[property]);
      expanded[property] = lookup[property]?.[value] ?? expanded[property];
    }
    return expanded;
  });
}

export function unpackPlutoniumFoundryExtras(
  packed: PackedFoundryExtras | null | undefined,
): { level: unknown; foundryType: unknown } | null {
  if (!packed) return null;
  return {
    level: packed.l,
    foundryType: packed.ft,
  };
}

function countOccurrences(source: string, marker: string): number {
  return source.split(marker).length - 1;
}

export function patchPlutoniumQuickInsertSource(source: string): PatchResult {
  if (source.includes(PATCH_SENTINEL)) {
    return { source, changed: false };
  }

  if (
    countOccurrences(source, LOAD_MARKER) !== 1 ||
    countOccurrences(source, UNPACK_MARKER) !== 2 ||
    countOccurrences(source, PACK_MARKER) !== 1
  ) {
    throw new Error(
      "Plutonium CN 2.15.6 Quick Insert source block was not found",
    );
  }

  const newline = source.includes("\r\n") ? "\r\n" : "\n";
  const indent = "\t\t";
  const compatibilityBlock = [
    `${indent}// ${PATCH_SENTINEL}: the Foundry bundle omits js/5et/omnidexer.js.`,
    `${indent}const _plutoniumQuickInsertCompat = {`,
    `${indent}\tdecompressIndex: globalThis.Omnidexer?.decompressIndex?.bind(globalThis.Omnidexer) || (indexGroup => {`,
    `${indent}\t\tconst {x: index, m: metadata} = indexGroup;`,
    `${indent}\t\tconst props = new Set(Object.keys(metadata));`,
    `${indent}\t\tconst lookup = {};`,
    `${indent}\t\tObject.keys(metadata).forEach(k => Object.entries(metadata[k]).forEach(([kk, vv]) => (lookup[k] = lookup[k] || {})[vv] = kk));`,
    `${indent}\t\tindex.forEach(it => Object.keys(it).filter(k => props.has(k)).forEach(k => it[k] = lookup[k][it[k]] ?? it[k]));`,
    `${indent}\t\treturn index;`,
    `${indent}\t}),`,
    `${indent}\tunpackFoundryExtras: globalThis.FoundryOmnidexerUtils?.unpackFoundryExtras?.bind(globalThis.FoundryOmnidexerUtils) || (packed => packed ? ({level: packed.l, foundryType: packed.ft}) : null),`,
    `${indent}\tgetPackedFoundryExtras: globalThis.FoundryOmnidexerUtils?.getPackedFoundryExtras?.bind(globalThis.FoundryOmnidexerUtils) || (({prop, ent}) => prop === "spell" ? ({l: ent.level}) : null),`,
    `${indent}};`,
    "",
  ].join(newline);

  let patched = source.replace(
    LOAD_MARKER,
    `${compatibilityBlock}${indent}const data = _plutoniumQuickInsertCompat.decompressIndex(await DataUtil.loadJSON(\`\${Renderer.get().baseUrl}search/index-foundry.json\`));`,
  );
  patched = patched.replaceAll(
    UNPACK_MARKER,
    "_plutoniumQuickInsertCompat.unpackFoundryExtras(",
  );
  patched = patched.replace(
    PACK_MARKER,
    '_plutoniumQuickInsertCompat.getPackedFoundryExtras({prop, ent})',
  );

  return { source: patched, changed: true };
}

export async function patchPlutoniumQuickInsertFile(
  moduleFile: string,
): Promise<PatchResult> {
  const source = await readFile(moduleFile, "utf8");
  const result = patchPlutoniumQuickInsertSource(source);
  if (!result.changed) return result;

  const backupFile = `${moduleFile}.upstream-2.15.6.bak`;
  try {
    await access(backupFile);
  } catch {
    await copyFile(moduleFile, backupFile);
  }

  const temporaryFile = `${moduleFile}.codex-patch.tmp`;
  await writeFile(temporaryFile, result.source, "utf8");
  await rename(temporaryFile, moduleFile);
  return result;
}

export async function patchPlutoniumQuickInsertInstall(
  config: FoundryLabConfig,
  options: { apply: boolean },
): Promise<{
  apply: boolean;
  changed: boolean;
  moduleFile: string;
  backupFile: string;
  version: string;
}> {
  const moduleRoot = resolve(
    config.profiles.serverMirror.dataPath,
    "Data/modules/plutonium-cn",
  );
  const manifestFile = resolve(moduleRoot, "module.json");
  const moduleFile = resolve(moduleRoot, "js/Bundle.js");
  assertInsideLabRoot(config, manifestFile);
  assertInsideLabRoot(config, moduleFile);

  const manifest = JSON.parse(await readFile(manifestFile, "utf8")) as {
    id?: string;
    version?: string;
  };
  if (manifest.id !== "plutonium-cn" || manifest.version !== "2.15.6") {
    throw new Error(
      `Expected plutonium-cn 2.15.6, found ${manifest.id ?? "<missing>"} ${manifest.version ?? "<missing>"}`,
    );
  }

  const result = options.apply
    ? await patchPlutoniumQuickInsertFile(moduleFile)
    : patchPlutoniumQuickInsertSource(await readFile(moduleFile, "utf8"));

  return {
    apply: options.apply,
    changed: result.changed,
    moduleFile,
    backupFile: `${moduleFile}.upstream-2.15.6.bak`,
    version: manifest.version,
  };
}
