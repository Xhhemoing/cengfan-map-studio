import { describe, expect, it } from "vitest";
import { parseDataRequestSchema } from "./schemas";
import { localParseData } from "./local-fallback";

describe("ai schemas and local fallback", () => {
  it("accepts valid parse-data payload", () => {
    const parsed = parseDataRequestSchema({
      text: "林舟 北京大学 北京\n苏禾 浙江大学 杭州",
      source: "paste",
    });
    expect(parsed.ok).toBe(true);
  });

  it("rejects empty parse-data payload", () => {
    const parsed = parseDataRequestSchema({ text: "  ", source: "paste" });
    expect(parsed.ok).toBe(false);
  });

  it("rejects a non-object parse-data payload", () => {
    expect(parseDataRequestSchema("not-an-object").ok).toBe(false);
  });

  it("parses three-field candidates with local fallback", () => {
    const result = localParseData({
      text: "林舟 北京大学 北京\n无效行",
      source: "paste",
    });
    expect(result.candidates[0]).toMatchObject({
      name: "林舟",
      university: "北京大学",
      city: "北京",
    });
    expect(result.unparsed).toHaveLength(1);
  });
});
