import { describe, expect, it } from "bun:test";
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ItemTextWorkflow } from "../itemTextWorkflow";

describe("ItemTextWorkflow", () => {
  it("writes middle markdown, promotes it to input/items, and writes final item json into output/items", async () => {
    const root = mkdtempSync(join(tmpdir(), "fvtt-item-workflow-"));
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
        "",
        "**强力猛击（Forceful Bash）.** 若命中，盾牌会对目标造成 2d6 + 2 + 你力量调整值的力场伤害。",
      ].join("\n"),
      "utf-8",
    );

    try {
      const workflow = new ItemTextWorkflow();
      const result = await workflow.run({ sourcePath, vaultPath });

      expect(result.ingestion.files).toHaveLength(1);
      expect(result.sync.failed).toBe(0);

      const middlePath = join(vaultPath, "middle", "items", "shield-of-the-cavalier__骑士之盾.md");
      const inputPath = join(vaultPath, "input", "items", "shield-of-the-cavalier__骑士之盾.md");
      const outputPath = join(vaultPath, "output", "items", "shield-of-the-cavalier__骑士之盾.json");

      expect(existsSync(middlePath)).toBe(true);
      expect(existsSync(inputPath)).toBe(true);
      expect(existsSync(outputPath)).toBe(true);
      expect(readdirSync(join(vaultPath, "output", "items")).filter((name) => name.endsWith(".md"))).toEqual([]);

      const item = JSON.parse(readFileSync(outputPath, "utf-8")) as {
        name?: string;
        type?: string;
        system?: { activities?: Record<string, unknown> };
      };

      expect(item.name).toContain("骑士之盾");
      expect(item.type).toBe("equipment");
      expect(JSON.stringify(item.system?.activities ?? {})).not.toContain("你力量调整值");
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
