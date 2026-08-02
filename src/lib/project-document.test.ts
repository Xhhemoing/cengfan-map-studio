import { afterEach, describe, expect, it, vi } from "vitest";
import {
  applyTransaction,
  createProjectDocument,
  redoTransaction,
  restoreProjectDocument,
  undoTransaction,
  type ProjectDocument,
  type ProjectTransaction,
} from "./project-document";
import type { Student } from "./project-data";

const students: Student[] = [
  {
    id: "student-1",
    name: "林舟",
    university: "北京大学",
    city: "北京市",
    visibility: true,
  },
];

function renameStudentTransaction(name: string): ProjectTransaction {
  return {
    id: `tx-${name}`,
    label: `重命名为${name}`,
    source: "manual",
    apply: (project) => ({
      ...project,
      students: project.students.map((student) =>
        student.id === "student-1" ? { ...student, name } : student,
      ),
    }),
  };
}

describe("project document history", () => {
  afterEach(() => vi.useRealTimers());

  it("creates a project with empty history", () => {
    const project = createProjectDocument({
      students,
      templateId: "original",
      dataView: "province",
    });

    expect(project.students).toHaveLength(1);
    expect(project.history.past).toEqual([]);
    expect(project.history.future).toEqual([]);
    expect(project.version).toBe(0);
    expect(project.schemaVersion).toBe(2);
    expect(project.canvas).toMatchObject({ width: 1500, height: 1000 });
    expect(project.map).toMatchObject({ x: 350, y: 120, width: 800, height: 690 });
    expect(project.cards.visibleFields).toEqual(["name", "university", "city"]);
  });

  it("keeps built-in scene text when custom text is supplied", () => {
    const project = createProjectDocument({
      students,
      templateId: "original",
      dataView: "province",
      textElements: [
        {
          id: "text-wish",
          content: "山高水长，来日再聚",
          x: 745,
          y: 905,
          fontSize: 20,
          color: "#c85d4b",
        },
      ],
    });

    expect(project.textElements.some((item) => item.id === "text-title")).toBe(true);
    expect(project.textElements.some((item) => item.id === "text-watermark")).toBe(true);
    expect(project.textElements.find((item) => item.id === "text-wish")).toMatchObject({
      role: "custom",
      visibility: true,
    });
  });

  it("applies a transaction atomically and records history", () => {
    const project = createProjectDocument({
      students,
      templateId: "original",
      dataView: "province",
    });

    const next = applyTransaction(project, renameStudentTransaction("林舟舟"));

    expect(next.students[0]?.name).toBe("林舟舟");
    expect(next.history.past).toHaveLength(1);
    expect(next.history.past[0]?.label).toBe("重命名为林舟舟");
    expect(next.history.future).toEqual([]);
    expect(next.version).toBe(1);
    expect(project.students[0]?.name).toBe("林舟");
  });

  it("reuses immutable history entries instead of cloning every prior snapshot", () => {
    const base = createProjectDocument({ students, templateId: "original", dataView: "province" });
    const first = applyTransaction(base, renameStudentTransaction("第一次"));
    const priorEntry = first.history.past[0];

    const second = applyTransaction(first, renameStudentTransaction("第二次"));

    expect(second.history.past[0]).toBe(priorEntry);
    expect(second.students[0]?.name).toBe("第二次");
    expect(first.students[0]?.name).toBe("第一次");
  });

  it("coalesces consecutive transactions with the same history group", () => {
    const base = createProjectDocument({ students, templateId: "original", dataView: "province" });
    const first = applyTransaction(base, { ...renameStudentTransaction("第一次"), historyGroup: "student-1:name" });
    const second = applyTransaction(first, { ...renameStudentTransaction("第二次"), historyGroup: "student-1:name" });

    expect(second.history.past).toHaveLength(1);
    expect(second.history.past[0]?.snapshot.students[0]?.name).toBe("林舟");
    expect(undoTransaction(second).students[0]?.name).toBe("林舟");
  });

  it("keeps different history groups as separate undo steps", () => {
    const base = createProjectDocument({ students, templateId: "original", dataView: "province" });
    const first = applyTransaction(base, { ...renameStudentTransaction("第一次"), historyGroup: "student-1:name" });
    const second = applyTransaction(first, { ...renameStudentTransaction("第二次"), historyGroup: "student-1:city" });

    expect(second.history.past).toHaveLength(2);
  });

  it("starts a new undo step when the coalescing window has elapsed", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-27T12:00:00Z"));
    const base = createProjectDocument({ students, templateId: "original", dataView: "province" });
    const first = applyTransaction(base, { ...renameStudentTransaction("第一次"), historyGroup: "student-1:name" });
    vi.advanceTimersByTime(801);
    const second = applyTransaction(first, { ...renameStudentTransaction("第二次"), historyGroup: "student-1:name" });

    expect(second.history.past).toHaveLength(2);
  });

  it("undoes and redoes the latest transaction", () => {
    const base = createProjectDocument({
      students,
      templateId: "original",
      dataView: "province",
    });
    const renamed = applyTransaction(base, renameStudentTransaction("林舟舟"));
    const undone = undoTransaction(renamed);
    const redone = redoTransaction(undone);

    expect(undone.students[0]?.name).toBe("林舟");
    expect(undone.history.past).toEqual([]);
    expect(undone.history.future).toHaveLength(1);
    expect(redone.students[0]?.name).toBe("林舟舟");
    expect(redone.history.past).toHaveLength(1);
    expect(redone.history.future).toEqual([]);
  });

  it("clears redo branch when a new transaction is applied after undo", () => {
    const base = createProjectDocument({
      students,
      templateId: "original",
      dataView: "province",
    });
    const renamed = applyTransaction(base, renameStudentTransaction("林舟舟"));
    const undone = undoTransaction(renamed);
    const next = applyTransaction(undone, renameStudentTransaction("林舟舟舟"));

    expect(next.students[0]?.name).toBe("林舟舟舟");
    expect(next.history.past).toHaveLength(1);
    expect(next.history.future).toEqual([]);
  });

  it("keeps at most 50 history entries", () => {
    let project: ProjectDocument = createProjectDocument({
      students,
      templateId: "original",
      dataView: "province",
    });

    for (let index = 0; index < 55; index += 1) {
      project = applyTransaction(project, renameStudentTransaction(`学生${index}`));
    }

    expect(project.history.past).toHaveLength(50);
    expect(project.students[0]?.name).toBe("学生54");
  });

  it("restores legacy history snapshots with a safe scene before undo", () => {
    const restored = restoreProjectDocument(JSON.stringify({
      students,
      templateId: "original",
      dataView: "province",
      textElements: [],
      style: {
        cardPreset: "standard",
        mapScale: 1,
        visibleFields: ["name", "university", "city"],
        regionalAssets: {},
      },
      version: 1,
      history: {
        past: [{
          id: "tx-legacy",
          label: "旧草稿操作",
          source: "manual",
          snapshot: {
            students: [],
            templateId: "original",
            dataView: "province",
            textElements: [],
            style: {
              cardPreset: "standard",
              mapScale: 1,
              visibleFields: ["name", "university", "city"],
              regionalAssets: {},
            },
            version: 0,
          },
        }],
        future: [],
      },
    }));

    expect(undoTransaction(restored).canvas).toMatchObject({ width: 1500, height: 1000 });
  });
});
