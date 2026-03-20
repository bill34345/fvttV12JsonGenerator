import { describe, it, expect } from "bun:test";
import { CHINESE_ACTION_REGEX } from "../chineseActionRegex";

describe("Chinese Action Regex", () => {
  it("should parse recharge", () => {
    const match = "[充能 5-6]".match(CHINESE_ACTION_REGEX.RECHARGE);
    expect(match).not.toBeNull();
    expect(match![1]).toBe("5");
    expect(match![2]).toBe("6");
  });

  it("should parse AOE target/area", () => {
    const match1 = "60尺锥形".match(CHINESE_ACTION_REGEX.AOE);
    expect(match1).not.toBeNull();
    expect(match1![1]).toBe("60");
    expect(match1![2]).toBe("锥形");

    const match2 = "30尺线形".match(CHINESE_ACTION_REGEX.AOE);
    expect(match2).not.toBeNull();
    expect(match2![1]).toBe("30");
    expect(match2![2]).toBe("线形");

    const match3 = "覆盖 90 尺锥形区域".match(CHINESE_ACTION_REGEX.AOE);
    expect(match3).not.toBeNull();
    expect(match3![1]).toBe("90");
    expect(match3![2]).toBe("锥形");
  });

  it("should parse reach", () => {
    const match = "触及 5 尺".match(CHINESE_ACTION_REGEX.REACH);
    expect(match).not.toBeNull();
    expect(match![1]).toBe("5");
  });

  it("should parse range", () => {
    const match = "射程 150/600 尺".match(CHINESE_ACTION_REGEX.RANGE);
    expect(match).not.toBeNull();
    expect(match![1]).toBe("150");
    expect(match![2]).toBe("600");
  });

  it("should parse versatile damage", () => {
    const match = "双手使用时为 16 (2d12+6)".match(CHINESE_ACTION_REGEX.VERSATILE_DAMAGE);
    expect(match).not.toBeNull();
    expect(match![1]).toBe("2d12+6");
  });

  it("should parse half damage on save", () => {
    const match = "豁免成功则伤害减半".match(CHINESE_ACTION_REGEX.HALF_DAMAGE_ON_SAVE);
    expect(match).not.toBeNull();
  });
});
