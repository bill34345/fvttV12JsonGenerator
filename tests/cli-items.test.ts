import { describe, expect, it } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

describe("CLI item import", () => {
  it("supports --ingest-items-json with final output under vault/output/items", () => {
    const root = mkdtempSync(join(tmpdir(), "fvtt-cli-items-"));
    const sourcePath = join(root, "items.md");
    const vaultPath = join(root, "vault");

    writeFileSync(
      sourcePath,
      [
        "# 下面是一个示例物品",
        "## 骑士之盾（Shield of the Cavalier）",
        "*护甲（盾牌），极珍稀（需同调）*",
        "",
        "持握这面盾牌期间，你的护甲等级获得 +2 加值。",
      ].join("\n"),
      "utf-8",
    );

    try {
      const result = spawnSync(
        "bun",
        [
          "run",
          resolve(process.cwd(), "src/index.ts"),
          "--ingest-items-json",
          sourcePath,
          "--vault",
          vaultPath,
        ],
        {
          cwd: process.cwd(),
          encoding: "utf-8",
        },
      );

      expect(result.status).toBe(0);
      expect(result.stdout).toContain("Detected items: 1");
      expect(result.stdout).toContain("JSON dir:");

      const outputPath = join(vaultPath, "output", "items", "shield-of-the-cavalier__骑士之盾.json");
      expect(existsSync(outputPath)).toBe(true);

      const item = JSON.parse(readFileSync(outputPath, "utf-8")) as { name?: string; type?: string };
      expect(item.name).toContain("骑士之盾");
      expect(item.type).toBe("equipment");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
