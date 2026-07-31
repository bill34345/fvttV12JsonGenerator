import {
  constants,
  copyFile,
  readFile,
  readdir,
  rename,
  stat,
  unlink,
  writeFile,
} from "node:fs/promises";
import { createHash } from "node:crypto";
import { basename, resolve } from "node:path";

import { assertInsideLabRoot, type FoundryLabConfig } from "../config";

export interface SequencerWorkerPatchResult {
  source: string;
  changed: boolean;
}

export interface SequencerWorkerInstallResult {
  apply: boolean;
  restore: boolean;
  changed: boolean;
  version: string;
  moduleFile: string;
  backupFile: string;
  beforeSha256: string;
  afterSha256: string;
}

export const SEQUENCER_WORKER_PATCH_SENTINEL =
  "SEQUENCER_SPRITESHEET_WORKER_CAP_2_LOCAL_PATCH";

const EXPECTED_MODULE_ID = "sequencer";
const EXPECTED_VERSION = "4.2.3";
const BUNDLE_PATTERN = /^SpritesheetGenerator-[A-Za-z0-9_-]+\.js$/;
const UPSTREAM_FORMULA =
  "    const workerCount = Math.max(Math.floor((navigator.hardwareConcurrency - 2) / 2), 1);";
const PATCHED_FORMULA =
  "    const workerCount = Math.min(Math.max(Math.floor((navigator.hardwareConcurrency - 2) / 2), 1), 2);";

function countOccurrences(source: string, marker: string): number {
  return source.split(marker).length - 1;
}

function sha256(source: string | Buffer): string {
  return createHash("sha256").update(source).digest("hex").toUpperCase();
}

function assertUpstreamSource(source: string, label: string): void {
  const upstreamCount = countOccurrences(source, UPSTREAM_FORMULA);
  const sentinelCount = countOccurrences(source, SEQUENCER_WORKER_PATCH_SENTINEL);
  const patchedCount = countOccurrences(source, PATCHED_FORMULA);
  if (upstreamCount !== 1 || sentinelCount !== 0 || patchedCount !== 0) {
    throw new Error(
      `${label} is not the exact unpatched Sequencer 4.2.3 worker source shape`,
    );
  }
}

function assertPatchedSource(source: string, label: string): void {
  const upstreamCount = countOccurrences(source, UPSTREAM_FORMULA);
  const sentinelCount = countOccurrences(source, SEQUENCER_WORKER_PATCH_SENTINEL);
  const patchedCount = countOccurrences(source, PATCHED_FORMULA);
  if (upstreamCount !== 0 || sentinelCount !== 1 || patchedCount !== 1) {
    throw new Error(
      `${label} is not the exact local Sequencer 4.2.3 worker-cap patch shape`,
    );
  }
}

export function patchSequencerSpritesheetWorkerSource(
  source: string,
): SequencerWorkerPatchResult {
  if (source.includes(SEQUENCER_WORKER_PATCH_SENTINEL)) {
    assertPatchedSource(source, "Current bundle");
    return { source, changed: false };
  }

  assertUpstreamSource(source, "Current bundle");
  const newline = source.includes("\r\n") ? "\r\n" : "\n";
  return {
    source: source.replace(
      UPSTREAM_FORMULA,
      [
        `    // ${SEQUENCER_WORKER_PATCH_SENTINEL}: cap eager WASM workers at two.`,
        PATCHED_FORMULA,
      ].join(newline),
    ),
    changed: true,
  };
}

async function replaceFileAtomically(
  moduleFile: string,
  expectedCurrentSha256: string,
  replacement: string,
): Promise<void> {
  const temporaryFile = `${moduleFile}.codex-patch.tmp`;
  try {
    await writeFile(temporaryFile, replacement, { encoding: "utf8", flag: "wx" });
    const currentSha256 = sha256(await readFile(moduleFile));
    if (currentSha256 !== expectedCurrentSha256) {
      throw new Error(
        `Sequencer bundle changed concurrently: expected ${expectedCurrentSha256}, found ${currentSha256}`,
      );
    }
    await rename(temporaryFile, moduleFile);
  } catch (error) {
    try {
      await unlink(temporaryFile);
    } catch (cleanupError) {
      if ((cleanupError as NodeJS.ErrnoException).code !== "ENOENT") throw cleanupError;
    }
    throw error;
  }
}

export async function patchSequencerSpritesheetWorkerFile(
  moduleFile: string,
): Promise<SequencerWorkerPatchResult> {
  const source = await readFile(moduleFile, "utf8");
  const result = patchSequencerSpritesheetWorkerSource(source);
  if (!result.changed) return result;
  await replaceFileAtomically(moduleFile, sha256(source), result.source);
  return result;
}

async function locateInstall(config: FoundryLabConfig): Promise<{
  version: string;
  moduleFile: string;
  backupFile: string;
}> {
  const moduleRoot = resolve(
    config.profiles.serverMirror.dataPath,
    "Data/modules/sequencer",
  );
  const manifestFile = resolve(moduleRoot, "module.json");
  const distRoot = resolve(moduleRoot, "dist");
  for (const target of [moduleRoot, manifestFile, distRoot]) {
    assertInsideLabRoot(config, target);
  }

  const manifest = JSON.parse(await readFile(manifestFile, "utf8")) as {
    id?: string;
    version?: string;
  };
  if (
    manifest.id !== EXPECTED_MODULE_ID ||
    manifest.version !== EXPECTED_VERSION
  ) {
    throw new Error(
      `Expected sequencer 4.2.3, found ${manifest.id ?? "<missing>"} ${manifest.version ?? "<missing>"}`,
    );
  }

  const bundleNames = (await readdir(distRoot)).filter((name) =>
    BUNDLE_PATTERN.test(name)
  );
  if (bundleNames.length !== 1) {
    throw new Error(
      `Expected exactly one Sequencer spritesheet bundle, found ${bundleNames.length}`,
    );
  }

  const moduleFile = resolve(distRoot, bundleNames[0]!);
  const backupFile = `${moduleFile}.upstream-${EXPECTED_VERSION}.bak`;
  assertInsideLabRoot(config, moduleFile);
  assertInsideLabRoot(config, backupFile);
  return { version: manifest.version, moduleFile, backupFile };
}

async function readExistingBackup(backupFile: string): Promise<string | null> {
  try {
    const backup = await readFile(backupFile, "utf8");
    assertUpstreamSource(backup, "Existing backup");
    return backup;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw error;
  }
}

async function createBackupExclusively(
  moduleFile: string,
  backupFile: string,
  expectedSha256: string,
): Promise<void> {
  try {
    await copyFile(moduleFile, backupFile, constants.COPYFILE_EXCL);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
  }
  const backup = await readFile(backupFile, "utf8");
  assertUpstreamSource(backup, "Backup");
  const backupSha256 = sha256(backup);
  if (backupSha256 !== expectedSha256) {
    throw new Error(
      `Backup hash mismatch: expected ${expectedSha256}, found ${backupSha256}`,
    );
  }
}

export async function patchSequencerSpritesheetWorkerInstall(
  config: FoundryLabConfig,
  options: { apply: boolean; restore?: boolean },
): Promise<SequencerWorkerInstallResult> {
  const { version, moduleFile, backupFile } = await locateInstall(config);
  const restore = options.restore === true;
  const source = await readFile(moduleFile, "utf8");
  const beforeSha256 = sha256(source);

  if (restore) {
    assertPatchedSource(source, "Current bundle");
    const backup = await readExistingBackup(backupFile);
    if (backup === null) {
      throw new Error(`Sequencer restore backup is missing: ${backupFile}`);
    }
    const afterSha256 = sha256(backup);
    if (options.apply) {
      await replaceFileAtomically(moduleFile, beforeSha256, backup);
    }
    return {
      apply: options.apply,
      restore,
      changed: true,
      version,
      moduleFile,
      backupFile,
      beforeSha256,
      afterSha256,
    };
  }

  const result = patchSequencerSpritesheetWorkerSource(source);
  const afterSha256 = sha256(result.source);
  if (options.apply && result.changed) {
    await createBackupExclusively(moduleFile, backupFile, beforeSha256);
    await replaceFileAtomically(moduleFile, beforeSha256, result.source);
  } else if (!result.changed) {
    const backup = await readExistingBackup(backupFile);
    if (backup === null) {
      throw new Error(
        `Patched Sequencer bundle has no verified restore backup: ${backupFile}`,
      );
    }
  }

  return {
    apply: options.apply,
    restore,
    changed: result.changed,
    version,
    moduleFile,
    backupFile,
    beforeSha256,
    afterSha256,
  };
}

export async function sequencerWorkerPatchArtifacts(
  moduleFile: string,
): Promise<{ temporaryExists: boolean }> {
  try {
    await stat(`${moduleFile}.codex-patch.tmp`);
    return { temporaryExists: true };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { temporaryExists: false };
    }
    throw error;
  }
}
