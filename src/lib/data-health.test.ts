import { describe, expect, it } from "vitest";
import { createProjectDocument } from "./project-document";
import {
  buildDataHealthSummary,
  dataIssueId,
  listDataIssues,
  resolveDataIssueId,
  withDataIssueId,
} from "./data-health";

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

  it("gives every issue a stable kind:studentId identifier the UI can locate", () => {
    const project = createProjectDocument({
      students: [
        { id: "student-1", name: "未匹配", university: "大学", city: "不存在", province: "火星省", visibility: false },
      ],
      templateId: "original",
      dataView: "province",
    });

    const issues = listDataIssues(project);
    const ids = issues.map((issue) => issue.id);

    expect(ids).toEqual(["manual-province:student-1", "hidden:student-1"]);
    expect(new Set(ids).size).toBe(ids.length);
    // Re-running on the same data must produce the same ids.
    expect(listDataIssues(project).map((issue) => issue.id)).toEqual(ids);
    expect(dataIssueId("hidden", "student-1")).toBe("hidden:student-1");
    expect(resolveDataIssueId({ studentId: "student-9", studentName: "无 id", kind: "duplicate", detail: "", severity: "warning" }))
      .toBe("duplicate:student-9");
  });

  it("sets an id on every listed issue whatever its kind", () => {
    const project = createProjectDocument({
      students: [
        { id: "student-1", name: "", university: "", city: "不存在", visibility: false },
        { id: "student-2", name: "周晴", university: "哈佛大学", city: "美国·波士顿", locationScope: "international", visibility: true },
        { id: "student-3", name: "林舟", university: "北京大学", city: "北京市", province: "北京市", visibility: true },
        { id: "student-4", name: "林舟", university: "北京大学", city: "北京市", visibility: true },
        { id: "student-5", name: "林舟", university: "北京大学", city: "北京市", visibility: true },
      ],
      templateId: "original",
      dataView: "province",
    });

    const issues = listDataIssues(project);
    const kinds = new Set(issues.map((issue) => issue.kind));

    expect(kinds).toEqual(new Set(["missing-field", "unresolved-location", "manual-province", "international", "hidden", "duplicate"]));
    expect(issues.every((issue) => issue.id === resolveDataIssueId(issue))).toBe(true);
    expect(issues.every((issue) => issue.id === `${issue.kind}:${issue.studentId}`)).toBe(true);
    expect(new Set(issues.map((issue) => issue.id)).size).toBe(issues.length);
  });

  it("fills in the id of an issue built outside listDataIssues", () => {
    const literal = { studentId: "student-9", studentName: "无 id", kind: "hidden" as const, detail: "", severity: "info" as const };

    expect(withDataIssueId(literal)).toEqual({ ...literal, id: "hidden:student-9" });
    expect(withDataIssueId({ ...literal, id: "custom" }).id).toBe("custom");
  });

  it("reports a whitespace-only name as a missing field and labels it 未命名学生", () => {
    const project = createProjectDocument({
      students: [
        { id: "blank-name", name: "   ", university: "浙江大学", city: "杭州市", visibility: true },
      ],
      templateId: "original",
      dataView: "province",
    });

    expect(buildDataHealthSummary(project).missingRequired).toBe(1);
    expect(listDataIssues(project)).toEqual([
      expect.objectContaining({
        id: "missing-field:blank-name",
        studentName: "未命名学生",
        kind: "missing-field",
        detail: "缺少姓名",
      }),
    ]);
  });

  it("flags a city-only row for its missing name and university without dropping it", () => {
    const project = createProjectDocument({
      students: [
        { id: "city-only", name: "", university: "", city: "杭州市", visibility: true },
      ],
      templateId: "original",
      dataView: "province",
    });

    expect(buildDataHealthSummary(project)).toMatchObject({ total: 1, missingRequired: 1, unresolved: 0 });
    expect(listDataIssues(project)).toEqual([
      expect.objectContaining({ kind: "missing-field", detail: "缺少姓名、院校" }),
    ]);
  });

  it("never asks an overseas record for a Chinese city or province", () => {
    const project = createProjectDocument({
      students: [
        { id: "overseas", name: "周晴", university: "哈佛大学", city: "美国·波士顿", locationScope: "international", visibility: true },
      ],
      templateId: "original",
      dataView: "province",
    });

    expect(buildDataHealthSummary(project)).toMatchObject({ unresolved: 0, international: 1, missingRequired: 0 });
    expect(listDataIssues(project)).toEqual([
      expect.objectContaining({ id: "international:overseas", kind: "international", severity: "info" }),
    ]);
  });
});
