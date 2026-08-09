import { cp, lstat, mkdir, stat } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { MODULE_ID } from "../src/constants";

const LOCAL_LAB_ROOT = path.normalize("F:\\FoundryLab\\foundry-v14");
const moduleRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const configuredRoot = process.env.FVTT_OPS_LAB_ROOT ? path.normalize(process.env.FVTT_OPS_LAB_ROOT) : "";
if (configuredRoot !== LOCAL_LAB_ROOT) throw new Error("Refusing install: FVTT_OPS_LAB_ROOT is not the exact approved local v14 Lab root.");
if (process.env.HOUSE_RULES_LOCAL_LAB_INSTALL !== "1") throw new Error("Refusing install: set HOUSE_RULES_LOCAL_LAB_INSTALL=1 after parent-owned Lab approval.");
for (const forbidden of ["FOUNDRY_REMOTE_HOST", "FOUNDRY_PRODUCTION", "FOUNDRY_PRODUCTION_URL"]) {
  if (process.env[forbidden]) throw new Error(`Refusing install: ${forbidden} is set.`);
}
const modulesDirectory = path.join(configuredRoot, "data", "server-mirror", "Data", "modules");
const target = path.join(modulesDirectory, MODULE_ID);
if (path.relative(modulesDirectory, target).startsWith("..") || !path.resolve(target).startsWith(path.resolve(modulesDirectory) + path.sep)) {
  throw new Error("Refusing install: module target escaped the local modules directory.");
}
try {
  const existing = await lstat(target);
  if (existing.isSymbolicLink()) throw new Error("Refusing install: existing module target is a link.");
  throw new Error("Refusing install: target exists; this installer never overwrites an existing module.");
} catch (error) {
  if (!(error as NodeJS.ErrnoException).code?.includes("ENOENT")) throw error;
}
await stat(modulesDirectory);
await mkdir(target, { recursive: false });
await cp(path.join(moduleRoot, "dist"), target, { recursive: true, errorOnExist: true, force: false });
console.log(`Installed ${MODULE_ID} to the approved local Lab target. Parent must perform runtime E2E.`);
