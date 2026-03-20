import { describe, it, expect } from "bun:test";
import { normalizeChineseText } from "../../utils/normalize";

describe("normalizeChineseText", () => {
  it("should convert full-width punctuation to half-width", () => {
    const input = "命中：+5（钝击）";
    const expected = "命中:+5(钝击)";
    expect(normalizeChineseText(input)).toBe(expected);
  });

  it("should convert other common full-width punctuation", () => {
    const input = "你好，世界。真的吗？是的！";
    const expected = "你好,世界.真的吗?是的!";
    expect(normalizeChineseText(input)).toBe(expected);
  });

  it("should normalize spaces", () => {
    const input = "  Hello   World  　"; // Includes full-width space at the end
    const expected = "Hello World";
    expect(normalizeChineseText(input)).toBe(expected);
  });

  it("should handle empty or null input", () => {
    expect(normalizeChineseText("")).toBe("");
    // @ts-ignore
    expect(normalizeChineseText(null)).toBe("");
  });

  it("should handle mixed text", () => {
    const input = "攻击：1d20 + 5 【优势】";
    const expected = "攻击:1d20 + 5 [优势]";
    expect(normalizeChineseText(input)).toBe(expected);
  });
});
