import { lstat, readFile } from "node:fs/promises";
import path from "node:path";
import { MODULE_ID, MODULE_VERSION } from "../src/constants";

const LOCAL_LAB_ROOT = path.normalize("F:\\FoundryLab\\foundry-v14");
const configuredRoot = process.env.FVTT_OPS_LAB_ROOT ? path.normalize(process.env.FVTT_OPS_LAB_ROOT) : "";
if (configuredRoot !== LOCAL_LAB_ROOT) throw new Error("Refusing verify: FVTT_OPS_LAB_ROOT is not the exact approved local v14 Lab root.");
const target = path.join(configuredRoot, "data", "server-mirror", "Data", "modules", MODULE_ID);
const info = await lstat(target);
if (!info.isDirectory() || info.isSymbolicLink()) throw new Error("Local Lab module target is not a real directory.");
const manifest = JSON.parse(await readFile(path.join(target, "module.json"), "utf8"));
if (manifest.id !== MODULE_ID || manifest.version !== MODULE_VERSION || manifest.compatibility?.verified !== "14.364") {
  throw new Error("Installed manifest identity or version mismatch.");
}
console.log(`Verified local Lab files for ${MODULE_ID}; no E2E behavior was run.`);
