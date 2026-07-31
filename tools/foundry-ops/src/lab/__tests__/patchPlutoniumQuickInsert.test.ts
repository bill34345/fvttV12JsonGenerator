import { describe, expect, test } from "bun:test";
// The implementation and its tests are owned by the Foundry Ops product.
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

import {
  decompressPlutoniumIndex,
  patchPlutoniumQuickInsertFile,
  patchPlutoniumQuickInsertSource,
  unpackPlutoniumFoundryExtras,
} from "../patchPlutoniumQuickInsert";

const vulnerableSource = `
class UtilIntegrationFauxCompendium {
	static async _pGetPlutoniumIndex () {
		const data = Omnidexer.decompressIndex(await DataUtil.loadJSON(\`\${Renderer.get().baseUrl}search/index-foundry.json\`));
		const out = [];
		for (const d of data) {
			out.push({
				extras: FoundryOmnidexerUtils.unpackFoundryExtras(d.xF),
			});
		}
		for (const ent of []) {
			out.push({
				extras: FoundryOmnidexerUtils.unpackFoundryExtras(
					FoundryOmnidexerUtils.getPackedFoundryExtras({prop, ent}),
				),
			});
		}
		return out;
	}
}
`;

describe("Plutonium Quick Insert compatibility patch", () => {
  test("decompresses metadata without relying on an Omnidexer global", () => {
    const packed = {
      x: [{ n: 0, s: 1, xF: { l: 3 } }, { n: 1, s: 0 }],
      m: {
        n: { Fireball: 0, Shield: 1 },
        s: { PHB: 0, XPHB: 1 },
      },
    };

    expect(decompressPlutoniumIndex(packed)).toEqual([
      { n: "Fireball", s: "XPHB", xF: { l: 3 } },
      { n: "Shield", s: "PHB" },
    ]);
  });

  test("unpacks the Foundry extras used by Quick Insert", () => {
    expect(unpackPlutoniumFoundryExtras({ l: 2, ft: "weapon" })).toEqual({
      level: 2,
      foundryType: "weapon",
    });
    expect(unpackPlutoniumFoundryExtras(null)).toBeNull();
  });

  test("guards all three missing-global call sites and is idempotent", () => {
    const once = patchPlutoniumQuickInsertSource(vulnerableSource);
    const twice = patchPlutoniumQuickInsertSource(once.source);

    expect(once.changed).toBe(true);
    expect(once.source).toContain("PLUTONIUM_QUICK_INSERT_COMPAT_V2_15_6");
    expect(once.source).not.toContain("Omnidexer.decompressIndex(");
    expect(once.source).not.toContain("FoundryOmnidexerUtils.unpackFoundryExtras(");
    expect(once.source).not.toContain("FoundryOmnidexerUtils.getPackedFoundryExtras(");
    expect(twice).toEqual({ source: once.source, changed: false });
  });

  test("rejects unexpected upstream source instead of partially patching it", () => {
    expect(() => patchPlutoniumQuickInsertSource("export class Other {}"))
      .toThrow("Plutonium CN 2.15.6 Quick Insert source block was not found");
  });

  test("preserves an adjacent upstream backup before replacing the bundle", async () => {
    const root = await mkdtemp(join(tmpdir(), "plutonium-quick-insert-patch-"));
    const moduleFile = join(root, "Bundle.js");
    try {
      await writeFile(moduleFile, vulnerableSource, "utf8");

      const result = await patchPlutoniumQuickInsertFile(moduleFile);

      expect(result.changed).toBe(true);
      expect(await readFile(`${moduleFile}.upstream-2.15.6.bak`, "utf8"))
        .toBe(vulnerableSource);
      expect(await readFile(moduleFile, "utf8"))
        .toContain("PLUTONIUM_QUICK_INSERT_COMPAT_V2_15_6");
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });
});
