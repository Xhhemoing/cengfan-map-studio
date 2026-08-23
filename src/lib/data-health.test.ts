import { describe, expect, it } from "vitest";
import { createProjectDocument } from "./project-document";
import { buildDataHealthSummary, listDataIssues } from "./data-health";

describe("project data health", () => {
  it("summarizes visible, hidden, international, unresolved, and missing records", () => {
    const project = createProjectDocument({
      students: [
        { id: "visible", name: "可见", university: "大学", city: "北京市", visibility: true },
        { id: "hidden", name: "隐藏", university: "大学", city: "杭州市", visibility: false },
        { id: "international", name: "海外", university: "大学", city: "美国·波士顿", locationScope: "international", visibility: true },
        { id: "unresolved", name: "未匹配", university: "大学", city: "不存在的城市", visibility: true },
        { id: "missing", name: "", university: "", city: "", visibility: true },
      ],
      templateId: "original",
      dataView: "province",
    });

    expect(buildDataHealthSummary(project)).toEqual({
      total: 5,
      visible: 4,
      hidden: 1,
      international: 1,
      unresolved: 2,
      missingRequired: 1,
      duplicate: 0,
    });
  });

  it("lists actionable issues with stable student ids", () => {
    const project = createProjectDocument({
      students: [
        { id: "student-1", name: "未匹配", university: "大学", city: "不存在", visibility: true },
        { id: "student-2", name: "隐藏", university: "大学", city: "北京市", visibility: false },
      ],
      templateId: "original",
      dataView: "province",
    });

    expect(listDataIssues(project)).toEqual([
      expect.objectContaining({ studentId: "student-1", kind: "unresolved-location" }),
      expect.objectContaining({ studentId: "student-2", kind: "hidden" }),
    ]);
  });

  it("skips the manual-province notice when the province matches the city resolution", () => {
    const project = createProjectDocument({
      students: [
        // 与「杭州市」解析出的省份一致：自动填充的冗余值，不是覆盖。
        { id: "auto", name: "自动", university: "浙江大学", city: "杭州市", province: "浙江省", visibility: true },
        // 简称也应视为一致。
        { id: "alias", name: "简称", university: "浙江大学", city: "杭州", province: "浙江", visibility: true },
        // 与城市解析不一致：仍然是需要提示的省份覆盖。
        { id: "override", name: "覆盖", university: "大学", city: "杭州市", province: "江苏省", visibility: true },
        // 城市无法解析时保留省份覆盖提示。
        { id: "unknown-city", name: "未知城", university: "大学", city: "不存在的城市", province: "浙江省", visibility: true },
      ],
      templateId: "original",
      dataView: "province",
    });

    const manualProvince = listDataIssues(project).filter((issue) => issue.kind === "manual-province");
    expect(manualProvince.map((issue) => issue.studentId)).toEqual(["override", "unknown-city"]);
  });

  it("counts and lists duplicate records as locatable warnings", () => {
    const project = createProjectDocument({
      students: [
        { id: "student-1", name: " 林舟 ", university: "北京 大学", city: "北京市", visibility: false },
        { id: "student-2", name: "林舟", university: "北京大学", city: " 北京市 ", visibility: true },
      ],
      templateId: "original",
      dataView: "province",
    });

    expect(buildDataHealthSummary(project).duplicate).toBe(2);
    expect(listDataIssues(project).map((issue) => `${issue.studentId}:${issue.kind}`)).toEqual([
      "student-1:hidden",
      "student-1:duplicate",
      "student-2:duplicate",
    ]);
  });
});
