import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { MODULE_ID, MODULE_VERSION } from "../src/constants";
import { writeDeterministicZip } from "./deterministic-zip";

const moduleRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceRoot = path.join(moduleRoot, "src");
const dist = path.join(moduleRoot, "dist");
const release = path.join(moduleRoot, "release");

async function copy(relative: string): Promise<void> {
  const from = path.join(sourceRoot, relative);
  const to = path.join(dist, relative);
  await mkdir(path.dirname(to), { recursive: true });
  await cp(from, to, { recursive: true });
}

const manifest = JSON.parse(await readFile(path.join(sourceRoot, "module.json"), "utf8"));
if (manifest.id !== MODULE_ID || manifest.version !== MODULE_VERSION) throw new Error("Manifest identity/version drift");
try {
  await rm(dist, { recursive: true, force: false });
} catch (error) {
  if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
}
await mkdir(path.join(dist, "scripts"), { recursive: true });
const result = await Bun.build({
  entrypoints: [path.join(sourceRoot, "module.ts")],
  outdir: path.join(dist, "scripts"),
  naming: "module.js",
  target: "browser",
  format: "esm",
  minify: false,
  sourcemap: "none"
});
if (!result.success) throw new Error(result.logs.map((log) => log.message).join("\n"));
await copy("module.json");
await copy("lang");
await copy("styles");
const packageJson = JSON.parse(await readFile(path.join(moduleRoot, "package.json"), "utf8"));
if (packageJson.version !== manifest.version) throw new Error("package.json and module.json versions differ");
await writeFile(path.join(dist, "package.json"), `${JSON.stringify({ name: packageJson.name, version: packageJson.version }, null, 2)}\n`);
await writeDeterministicZip(dist, path.join(release, `${MODULE_ID}-${MODULE_VERSION}.zip`));
