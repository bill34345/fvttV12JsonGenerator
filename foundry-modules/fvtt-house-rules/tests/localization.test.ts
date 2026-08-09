import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";

function leafKeys(value: unknown, prefix = ""): string[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [prefix];
  return Object.entries(value).flatMap(([key, child]) => leafKeys(child, prefix ? `${prefix}.${key}` : key));
}

describe("localization contract", () => {
  test("manifest supports Foundry Chinese package locale aliases", async () => {
    const manifest = JSON.parse(await readFile(new URL("../src/module.json", import.meta.url), "utf8"));
    expect(manifest.languages).toEqual(expect.arrayContaining([
      expect.objectContaining({ lang: "en", path: "lang/en.json" }),
      expect.objectContaining({ lang: "cn", path: "lang/zh-CN.json" }),
      expect.objectContaining({ lang: "zh-CN", path: "lang/zh-CN.json" }),
    ]));
  });

  test("English and Simplified Chinese bundles expose the same keys", async () => {
    const english = leafKeys(JSON.parse(await readFile(new URL("../src/lang/en.json", import.meta.url), "utf8"))).sort();
    const chinese = leafKeys(JSON.parse(await readFile(new URL("../src/lang/zh-CN.json", import.meta.url), "utf8"))).sort();
    expect(chinese).toEqual(english);
  });
});
