import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { MODULE_ID, MODULE_VERSION } from "../src/constants";
import { fileSize, zipEntryNames } from "./deterministic-zip";

const moduleRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(await readFile(path.join(moduleRoot, "src", "module.json"), "utf8"));
const builtManifest = JSON.parse(await readFile(path.join(moduleRoot, "dist", "module.json"), "utf8"));
const packageJson = JSON.parse(await readFile(path.join(moduleRoot, "package.json"), "utf8"));
for (const candidate of [manifest, builtManifest, packageJson]) {
  if (candidate.version !== MODULE_VERSION) throw new Error("Version drift in source/build/package metadata");
}
if (manifest.id !== MODULE_ID || builtManifest.id !== MODULE_ID) throw new Error("Module id drift");
for (const required of ["scripts/module.js", "styles/house-rules.css", "lang/zh-CN.json", "lang/en.json"]) {
  await access(path.join(moduleRoot, "dist", required));
}
const archive = path.join(moduleRoot, "release", `${MODULE_ID}-${MODULE_VERSION}.zip`);
const names = await zipEntryNames(archive);
for (const required of ["module.json", "scripts/module.js", "styles/house-rules.css", "lang/zh-CN.json", "lang/en.json"]) {
  if (!names.includes(required)) throw new Error(`Release archive misses ${required}`);
}
if ((await fileSize(archive)) < 200) throw new Error("Release archive is unexpectedly small");
console.log(`Verified ${archive} (${names.length} deterministic entries).`);
