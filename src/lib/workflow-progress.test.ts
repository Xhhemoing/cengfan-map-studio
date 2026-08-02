import { describe, expect, it } from "vitest";
import { createProjectDocument } from "./project-document";
import type { Student } from "./project-data";
import { computeWorkflowProgress, listStudentWarnings } from "./workflow-progress";

function student(overrides: Partial<Student> = {}): Student {
  return {
    id: "s-1",
    name: "测试同学",
    university: "北京大学",
    city: "北京市",
    visibility: true,
    ...overrides,
  };
}

function projectWith(students: Student[]) {
  return createProjectDocument({ students, templateId: "original", dataView: "province" });
}

describe("computeWorkflowProgress", () => {
  it("empty roster: roster, presentation and export steps are empty while layout/local stay ready", () => {
    const progress = computeWorkflowProgress(projectWith([]));

    expect(progress.roster.status).toBe("empty");
    expect(progress.presentation.status).toBe("empty");
    expect(progress.exportStep.status).toBe("empty");
    expect(progress.layout.status).toBe("ready");
    expect(progress.local.status).toBe("ready");
  });

  it("fully matched roster is ready with zero warnings", () => {
    const progress = computeWorkflowProgress(projectWith([student(), student({ id: "s-2", name: "同学乙" })]));

    expect(progress.roster.status).toBe("ready");
    expect(progress.roster.counts).toEqual({ total: 2, unresolved: 0, hidden: 0, international: 0 });
    expect(progress.presentation.status).toBe("ready");
    expect(progress.exportStep.status).toBe("ready");
  });

  it("unmatched cities produce warning with unresolved count", () => {
    const progress = computeWorkflowProgress(
      projectWith([student({ city: "不存在的城市", province: undefined })]),
    );

    expect(progress.roster.status).toBe("warning");
    expect(progress.roster.counts?.unresolved).toBe(1);
    expect(progress.exportStep.status).toBe("warning");
  });

  it("hidden students produce warning with hidden count", () => {
    const progress = computeWorkflowProgress(projectWith([student(), student({ id: "s-2", visibility: false })]));

    expect(progress.roster.status).toBe("warning");
    expect(progress.roster.counts?.hidden).toBe(1);
    expect(progress.exportStep.status).toBe("warning");
  });

  it("international students never count as unresolved", () => {
    const progress = computeWorkflowProgress(
      projectWith([student({ city: "纽约", locationScope: "international" })]),
    );

    expect(progress.roster.status).toBe("ready");
    expect(progress.roster.counts?.unresolved).toBe(0);
    expect(progress.roster.counts?.international).toBe(1);
  });

  it("lists unresolved and hidden students for export review", () => {
    const warnings = listStudentWarnings(projectWith([
      student(),
      student({ id: "s-2", name: "未匹配同学", city: "不存在的城市", province: undefined }),
      student({ id: "s-3", name: "海外同学", city: "纽约", locationScope: "international" }),
      student({ id: "s-4", name: "隐藏同学", visibility: false }),
    ]));

    expect(warnings.unresolvedStudents).toEqual([{ id: "s-2", name: "未匹配同学", city: "不存在的城市" }]);
    expect(warnings.hiddenStudents).toEqual([{ id: "s-4", name: "隐藏同学" }]);
  });

  it("presentation and layout stay ready regardless of dataView", () => {
    const progress = computeWorkflowProgress(
      createProjectDocument({ students: [student()], templateId: "original", dataView: "pins" }),
    );

    expect(progress.presentation.status).toBe("ready");
    expect(progress.layout.status).toBe("ready");
  });
});
