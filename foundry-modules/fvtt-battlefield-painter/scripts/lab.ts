import { createHash } from "node:crypto";
import {
  cp,
  lstat,
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
} from "node:fs/promises";
import { resolve } from "node:path";

import {
  assertExactLabPath,
  assertInsideLabRoot,
  createLabConfig,
  type FoundryLabConfig,
} from "../../../tools/foundry-ops/src/config.ts";
import { buildModule, MODULE_ID, MODULE_VERSION } from "./build";

const APPROVED_LAB = resolve("F:/FoundryLab/foundry-v14");
const REPO_ROOT = resolve(import.meta.dir, "../../..");

export const createModuleLabConfig = (): FoundryLabConfig =>
  createLabConfig(REPO_ROOT);

const modulePaths = (configuration: FoundryLabConfig) => ({
  destination: resolve(
    configuration.profiles.serverMirror.dataPath,
    "Data/modules",
    MODULE_ID,
  ),
  staging: resolve(
    configuration.profiles.serverMirror.dataPath,
    "Data/modules",
    `.${MODULE_ID}.installing`,
  ),
  buildRoot: resolve(
    configuration.repoRoot,
    "foundry-modules",
    MODULE_ID,
    "dist/module",
  ),
});

export const assertApprovedLab = (configuration: FoundryLabConfig): void => {
  if (
    resolve(configuration.labRoot).toLocaleLowerCase("en") !==
    APPROVED_LAB.toLocaleLowerCase("en")
  ) {
    throw new Error(
      `Refusing Battlefield Painter installation outside the approved local Lab: ${APPROVED_LAB}`,
    );
  }
};

export const installLocal = async (
  configuration = createModuleLabConfig(),
  apply = false,
): Promise<Record<string, unknown>> => {
  assertApprovedLab(configuration);
  const paths = modulePaths(configuration);
  assertExactLabPath(
    configuration,
    paths.destination,
    ["data", "server-mirror", "Data", "modules", MODULE_ID],
    "Battlefield Painter destination",
  );
  assertInsideLabRoot(configuration, paths.staging);
  await buildModule();
  if (await exists(paths.staging)) {
    throw new Error(`Stale staging directory exists: ${paths.staging}`);
  }
  await assertEmptyInstallDestination(paths.destination);

  const preview = {
    apply,
    destination: paths.destination,
    buildRoot: paths.buildRoot,
    production: false,
  };
  if (!apply) return preview;

  let installedNew = false;
  try {
    await mkdir(resolve(paths.destination, ".."), { recursive: true });
    await assertEmptyInstallDestination(paths.destination);
    await cp(paths.buildRoot, paths.staging, {
      recursive: true,
      errorOnExist: true,
      force: false,
    });
    await rename(paths.staging, paths.destination);
    installedNew = true;
    await assertOwned(paths.destination);
    const expected = await hashTree(paths.buildRoot);
    const actual = await hashTree(paths.destination);
    if (JSON.stringify(expected) !== JSON.stringify(actual)) {
      throw new Error("Installed module bytes differ from the built artifact");
    }
    return { ...preview, changed: true, hash: treeHash(actual) };
  } catch (error) {
    if (await exists(paths.staging)) await rm(paths.staging, { recursive: true });
    if (installedNew && (await exists(paths.destination))) {
      await rm(paths.destination, { recursive: true });
    }
    throw error;
  }
};

export const verifyInstall = async (
  configuration = createModuleLabConfig(),
): Promise<Record<string, unknown>> => {
  assertApprovedLab(configuration);
  const paths = modulePaths(configuration);
  assertExactLabPath(
    configuration,
    paths.destination,
    ["data", "server-mirror", "Data", "modules", MODULE_ID],
    "Battlefield Painter destination",
  );
  await assertOwned(paths.destination);
  const manifest = JSON.parse(
    await readFile(resolve(paths.destination, "module.json"), "utf8"),
  ) as Record<string, unknown>;
  const script = resolve(paths.destination, "scripts/main.js");
  if (!(await lstat(script)).isFile()) {
    throw new Error(`Installed browser entry is missing: ${script}`);
  }
  return {
    ok: true,
    destination: paths.destination,
    version: manifest.version,
    hash: treeHash(await hashTree(paths.destination)),
    runtimeVerified: false,
  };
};

export const assertEmptyInstallDestination = async (
  destination: string,
): Promise<void> => {
  if (await exists(destination)) {
    throw new Error(
      `Refusing installation because destination already exists: ${destination}`,
    );
  }
};

const assertOwned = async (path: string): Promise<void> => {
  const stats = await lstat(path);
  if (!stats.isDirectory() || stats.isSymbolicLink()) {
    throw new Error(`Unsafe module path: ${path}`);
  }
  const manifest = JSON.parse(
    await readFile(resolve(path, "module.json"), "utf8"),
  ) as Record<string, unknown>;
  if (
    manifest.id !== MODULE_ID ||
    manifest.version !== MODULE_VERSION
  ) {
    throw new Error(`Refusing to replace or accept a foreign module at ${path}`);
  }
};

const hashTree = async (
  root: string,
): Promise<Array<{ path: string; sha256: string }>> => {
  const result: Array<{ path: string; sha256: string }> = [];
  const visit = async (directory: string): Promise<void> => {
    const entries = await readdir(directory, { withFileTypes: true });
    entries.sort((a, b) => a.name.localeCompare(b.name, "en"));
    for (const entry of entries) {
      const path = resolve(directory, entry.name);
      const stats = await lstat(path);
      if (stats.isSymbolicLink()) {
        throw new Error(`Module tree contains a symlink or junction: ${path}`);
      }
      if (stats.isDirectory()) await visit(path);
      else if (stats.isFile()) {
        result.push({
          path: path.slice(root.length + 1).replace(/\\/g, "/"),
          sha256: createHash("sha256")
            .update(await readFile(path))
            .digest("hex"),
        });
      }
    }
  };
  await visit(root);
  return result;
};

const treeHash = (entries: Array<{ path: string; sha256: string }>): string =>
  createHash("sha256").update(JSON.stringify(entries)).digest("hex");

const exists = async (path: string): Promise<boolean> =>
  Boolean(await lstat(path).catch(() => undefined));
