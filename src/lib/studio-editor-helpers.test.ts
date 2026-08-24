import { describe, expect, it } from "vitest";
import { applyTransaction, createProjectDocument } from "./project-document";
import type { Student } from "./project-data";
import { DEFAULT_RENDER_SETTINGS } from "./render-settings";
import {
  buildCollaborationPackage,
  createStudentUpdateTransaction,
  freezeCardPositions,
  type WorkspaceStateSnapshot,
} from "./studio-editor-helpers";

function projectWith(students: Student[]) {
  return createProjectDocument({ students, templateId: "original", dataView: "province" });
}

const overseasStudent: Student = {
  id: "student-overseas",
  name: "林远",
  university: "早稻田大学",
  city: "东京",
  province: "海外",
  locationScope: "international",
  visibility: true,
};

const domesticStudent: Student = {
  id: "student-domestic",
  name: "苏禾",
  university: "浙江大学",
  city: "杭州市",
  visibility: true,
};

describe("createStudentUpdateTransaction", () => {
  it("removes both the manual province and the locationScope when they are cleared together", () => {
    const project = projectWith([overseasStudent, domesticStudent]);
    const next = createStudentUpdateTransaction(overseasStudent.id, {
      city: "杭州市",
      province: undefined,
      locationScope: undefined,
    }).apply(project);

    const edited = next.students.find((student) => student.id === overseasStudent.id)!;
    expect(edited.city).toBe("杭州市");
    expect(edited).not.toHaveProperty("province");
    expect(edited).not.toHaveProperty("locationScope");
    // 其他学生保持原引用，不被无关编辑触碰。
    expect(next.students.find((student) => student.id === domesticStudent.id)).toBe(next.students[1]);
    expect(next.students[1]).toEqual(domesticStudent);
  });

  it("removes only the locationScope when the province stays", () => {
    const project = projectWith([{ ...overseasStudent, province: "浙江省" }]);
    const next = createStudentUpdateTransaction(overseasStudent.id, {
      locationScope: undefined,
    }).apply(project);

    const edited = next.students[0]!;
    expect(edited.province).toBe("浙江省");
    expect(edited).not.toHaveProperty("locationScope");
  });

  it("merges a plain field edit without dropping existing scope or province", () => {
    const project = projectWith([overseasStudent]);
    const next = createStudentUpdateTransaction(overseasStudent.id, { name: "林远航" }).apply(project);

    const edited = next.students[0]!;
    expect(edited.name).toBe("林远航");
    expect(edited.province).toBe("海外");
    expect(edited.locationScope).toBe("international");
  });

  it("keeps a switch back to an explicit china scope as a stored value", () => {
    const project = projectWith([overseasStudent]);
    const next = createStudentUpdateTransaction(overseasStudent.id, { locationScope: "china" }).apply(project);

    expect(next.students[0]!.locationScope).toBe("china");
  });
});

describe("freezeCardPositions", () => {
  it("returns the current cards untouched when no resolved positions were captured", () => {
    const project = projectWith([domesticStudent]);
    expect(freezeCardPositions(project, null)).toBe(project.cards);
    expect(freezeCardPositions(project, {})).toBe(project.cards);
  });

  it("freezes resolved automatic positions while manual overrides win", () => {
    const project = projectWith([domesticStudent]);
    project.cards = { ...project.cards, positions: { 北京市: { x: 100, y: 200 } } };

    const frozen = freezeCardPositions(project, {
      北京市: { x: 999, y: 999 },
      浙江省: { x: 300, y: 400 },
    });

    expect(frozen.positions).toEqual({
      北京市: { x: 100, y: 200 },
      浙江省: { x: 300, y: 400 },
    });
    // 其余卡片设置保持不变。
    expect(frozen.preset).toBe(project.cards.preset);
    expect(frozen.maxWidth).toBe(project.cards.maxWidth);
  });
});

describe("buildCollaborationPackage", () => {
  it("packages the workspace with a pinned exportedAt and an emptied undo history", () => {
    const base = projectWith([domesticStudent]);
    const withHistory = applyTransaction(base, {
      id: "tx-test-history",
      label: "测试编辑",
      source: "manual",
      apply: (current) => ({ ...current, dataView: "city" }),
    });
    expect(withHistory.history.past.length).toBeGreaterThan(0);

    const snapshot: WorkspaceStateSnapshot = {
      project: withHistory,
      assets: [],
      fonts: [],
      customTemplates: [],
      renderSettings: { ...DEFAULT_RENDER_SETTINGS },
    };
    const exportedAt = "2026-08-24T00:00:00.000Z";
    const pack = buildCollaborationPackage(snapshot, exportedAt);

    expect(pack.kind).toBe("cengfan-project-package");
    expect(pack.exportedAt).toBe(exportedAt);
    expect(pack.project.history).toEqual({ past: [], future: [] });
    expect(pack.project.dataView).toBe("city");
    expect(pack.project.students).toEqual([domesticStudent]);
    // 打包不得修改工作区内的原工程（撤销栈保留）。
    expect(withHistory.history.past.length).toBeGreaterThan(0);
  });
});
