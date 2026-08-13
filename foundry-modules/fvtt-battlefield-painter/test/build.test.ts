import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import {
  buildModule,
  MODULE_ID,
  MODULE_VERSION,
  validateManifest,
} from "../scripts/build";

describe("module manifest", () => {
  test("pins the authorized Foundry and dnd5e targets exactly", async () => {
    const manifest = JSON.parse(
      await readFile(resolve(import.meta.dir, "../module.json"), "utf8"),
    );

    expect(() => validateManifest(manifest)).not.toThrow();
    expect(manifest.id).toBe(MODULE_ID);
    expect(manifest.version).toBe(MODULE_VERSION);
    expect(manifest.version).toBe("0.1.0-alpha.1");
    expect(manifest.description).toContain("runtime acceptance pending");
  });

  test("rejects compatibility drift", async () => {
    const manifest = JSON.parse(
      await readFile(resolve(import.meta.dir, "../module.json"), "utf8"),
    );
    manifest.compatibility.verified = "14.365";

    expect(() => validateManifest(manifest)).toThrow("14.364");
  });

  test("builds the complete install tree including art, template, and CSS", async () => {
    const result = await buildModule();

    expect(result.files).toContain("scripts/main.js");
    expect(result.files).toContain("templates/painter.hbs");
    expect(result.files).toContain("styles/painter.css");
    expect(result.files.filter((name) => name.endsWith(".webp"))).toHaveLength(6);
    expect(result.zipPath).toEndWith("fvtt-battlefield-painter.zip");
  });

  test("produces byte-identical ZIPs and a browser-only entry bundle", async () => {
    const first = await buildModule();
    const firstBytes = await readFile(first.zipPath);
    const second = await buildModule();
    const secondBytes = await readFile(second.zipPath);
    const digest = (bytes: Uint8Array) =>
      createHash("sha256").update(bytes).digest("hex");

    expect(digest(secondBytes)).toBe(digest(firstBytes));
    const bundle = await readFile(resolve(second.moduleRoot, "scripts/main.js"), "utf8");
    expect(bundle).not.toMatch(
      /node:|process\.env|OPENAI_API_KEY|[A-Z]:\\|sourceMappingURL/i,
    );
  });
});
