import { describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

import {
  buildModule,
  MODULE_ID,
  MODULE_VERSION,
  validateManifest,
  validateMediaAssets,
} from "../scripts/build";

describe("module manifest", () => {
  test("declares the candidate range while retaining the prior verified targets", async () => {
    const manifest = JSON.parse(
      await readFile(resolve(import.meta.dir, "../module.json"), "utf8"),
    );

    expect(() => validateManifest(manifest)).not.toThrow();
    expect(manifest.id).toBe(MODULE_ID);
    expect(manifest.version).toBe(MODULE_VERSION);
    expect(manifest.version).toBe("0.3.0-alpha.2");
    expect(manifest.compatibility).toEqual({
      minimum: "14.364",
      verified: "14.364",
      maximum: "14.368",
    });
    expect(manifest.relationships.systems[0].compatibility).toEqual({
      minimum: "5.3.3",
      verified: "5.3.3",
      maximum: "6.0.5",
    });
    expect(manifest.description).toContain("clustered lights");
    expect(manifest.description).not.toContain("ambience");
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
    expect(result.files.filter((name) => name.endsWith(".webp"))).toHaveLength(4);
    expect(result.files.filter((name) => name.endsWith(".webm"))).toHaveLength(6);
    expect(result.files.filter((name) => name.endsWith(".ogg"))).toHaveLength(0);
    expect(result.files.some((name) => name.startsWith("assets/audio/"))).toBe(false);
    expect(result.zipPath).toEndWith("fvtt-battlefield-painter.zip");
  });

  test("validates the generated WebM alpha signatures and retired-audio absence", async () => {
    const result = await buildModule();
    await expect(validateMediaAssets(result.moduleRoot)).resolves.toBeUndefined();
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
      /node:|process\.env|OPENAI_API_KEY|ffmpeg|generate-media|[A-Z]:\\|sourceMappingURL/i,
    );
    expect(second.files.some((name) => name.includes("generate-media"))).toBe(false);
  });
});
