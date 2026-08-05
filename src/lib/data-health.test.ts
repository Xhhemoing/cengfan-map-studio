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
