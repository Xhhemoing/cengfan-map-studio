import { describe, expect, it } from "vitest";
import {
  explainRequestSchema,
  parseDataRequestSchema,
  proposeEditsRequestSchema,
  validateEditorCommandPayload,
} from "./schemas";
import { localParseData, localProposeEdits } from "./local-fallback";
import type { ProposeEditsRequest } from "./schemas";

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

  it("rejects invalid legacy AI field types", () => {
    expect(parseDataRequestSchema({ text: 42, source: "paste" }).ok).toBe(false);
    expect(parseDataRequestSchema({ text: "名单", source: 42 }).ok).toBe(false);
    expect(proposeEditsRequestSchema({ message: "修改", projectSummary: { studentCount: 1, templateId: 42 } }).ok).toBe(false);
    expect(proposeEditsRequestSchema({ message: "修改", projectSummary: { studentCount: -1 } }).ok).toBe(false);
    expect(explainRequestSchema({ message: "解释", studentCount: "1" }).ok).toBe(false);
    expect(explainRequestSchema({ message: " ", studentCount: 1 }).ok).toBe(false);
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

  it("proposes whitelist edit commands from natural language", () => {
    const request: ProposeEditsRequest = {
      message: "按城市分组，并改成紧凑卡片，地图放大一点",
      projectSummary: {
        studentCount: 48,
        templateId: "original",
        dataView: "province",
        cardPreset: "standard",
      },
    };
    const result = localProposeEdits(request);

    expect(result.mode).toBe("proposal");
    expect(result.commands.length).toBeGreaterThanOrEqual(2);
    for (const command of result.commands) {
      expect(validateEditorCommandPayload(command).ok).toBe(true);
    }
  });

  it("answers questions without commands", () => {
    const result = localProposeEdits({
      message: "为什么现在看起来很挤？",
      projectSummary: {
        studentCount: 62,
        templateId: "scenery",
        dataView: "province",
        cardPreset: "standard",
      },
    });
    expect(result.mode).toBe("explain");
    expect(result.commands).toEqual([]);
    expect(result.explanation).toContain("62");
  });
});
