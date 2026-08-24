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

function createRichProject(): ProjectDocument {
  const project = createProjectDocument({
    students,
    templateId: "original",
    dataView: "province",
  });
  return {
    ...project,
    map: {
      ...project.map,
      provinceStyles: {
        浙江省: { appearance: { kind: "manual-color", color: "#88aaff" }, labelFontId: "font-map" },
        北京市: {
          appearance: {
            kind: "texture",
            assetId: "asset-province",
            src: "data:image/png;base64,cHJvdmluY2U=",
            fit: "cover",
          },
        },
      },
    },
    guests: {
      ...project.guests,
      customText: "毕业快乐",
      people: [{ id: "guest-1", name: "王老师", title: "班主任", visibility: true }],
    },
    textElements: [
      ...project.textElements,
      {
        id: "text-custom",
        role: "custom",
        content: "山高水长",
        x: 200,
        y: 300,
        fontSize: 24,
        color: "#123456",
        fontWeight: 600,
        textAlign: "center",
        maxWidth: 400,
        visibility: true,
      },
    ],
    assetElements: [{
      id: "asset-1",
      assetId: "uploaded-1",
      label: "校徽",
      src: "data:image/png;base64,YXNzZXQ=",
      kind: "decoration",
      x: 120,
      y: 180,
      width: 80,
      height: 80,
      rotation: 5,
      opacity: 0.9,
      zIndex: 3,
      visibility: true,
    }],
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

  it("commits nothing when a transaction refuses by returning its input document", () => {
    const base = createProjectDocument({ students, templateId: "original", dataView: "province" });
    const seeded = applyTransaction(base, renameStudentTransaction("已落地"));

    const refused = applyTransaction(seeded, {
      id: "tx-refused",
      label: "被拒绝的落地",
      source: "ai",
      apply: (input) => input,
    });

    expect(refused).toBe(seeded);
    expect(refused.version).toBe(seeded.version);
    expect(refused.history.past).toHaveLength(seeded.history.past.length);
    expect(refused.history.past.at(-1)?.id).toBe("tx-已落地");
  });

  it("keeps a redo branch alive when a transaction refuses", () => {
    const base = createProjectDocument({ students, templateId: "original", dataView: "province" });
    const renamed = applyTransaction(base, renameStudentTransaction("林舟舟"));
    const undone = undoTransaction(renamed);

    const refused = applyTransaction(undone, {
      id: "tx-refused",
      label: "被拒绝的落地",
      source: "ai",
      apply: (input) => input,
    });

    expect(refused.history.future).toHaveLength(1);
    expect(redoTransaction(refused).students[0]?.name).toBe("林舟舟");
  });

  it("still commits a transaction that returns an unchanged copy of its input", () => {
    const base = createProjectDocument({ students, templateId: "original", dataView: "province" });

    const next = applyTransaction(base, {
      id: "tx-copy",
      label: "无改动副本",
      source: "manual",
      apply: (input) => ({ ...input }),
    });

    expect(next.version).toBe(base.version + 1);
    expect(next.history.past).toHaveLength(1);
  });

  it("isolates prior documents and history from hostile transaction references", () => {
    const base = createRichProject();
    const first = applyTransaction(base, renameStudentTransaction("稳定状态"));
    const firstBefore = structuredClone(first);
    const returnedStudent = { ...first.students[0]!, name: "返回状态" };
    let retainedInput: ProjectDocument | undefined;

    const next = applyTransaction(first, {
      id: "tx-hostile",
      label: "恶意事务",
      source: "manual",
      apply: (input) => {
        retainedInput = input;
        input.students[0]!.name = "输入内修改";
        input.guests.people[0]!.name = "输入内嘉宾修改";
        input.history.past[0]!.snapshot.students[0]!.name = "破坏旧历史";
        return { ...input, students: [returnedStudent] };
      },
    });

    expect(first).toEqual(firstBefore);
    expect(next.history.past[0]?.snapshot.students[0]?.name).toBe("林舟");
    expect(next.history.past[1]?.snapshot.students[0]?.name).toBe("稳定状态");
    const committedHistory = structuredClone(next.history);

    returnedStudent.name = "提交后修改返回引用";
    retainedInput!.students[0]!.name = "提交后修改输入引用";
    retainedInput!.map.provinceStyles!.浙江省 = { appearance: { kind: "manual-color", color: "#000000" } };
    retainedInput!.history.past[0]!.snapshot.students[0]!.name = "再次破坏旧历史";

    expect(first).toEqual(firstBefore);
    expect(next.history).toEqual(committedHistory);
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
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-27T12:00:00Z"));
    const base = createProjectDocument({ students, templateId: "original", dataView: "province" });
    const first = applyTransaction(base, { ...renameStudentTransaction("第一次"), historyGroup: "student-1:name" });
    vi.advanceTimersByTime(800);
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

  it("does not coalesce when a redo branch exists and clears that branch", () => {
    const base = createProjectDocument({ students, templateId: "original", dataView: "province" });
    const first = applyTransaction(base, { ...renameStudentTransaction("第一次"), historyGroup: "student-1:name" });
    const second = applyTransaction(first, { ...renameStudentTransaction("第二次"), historyGroup: "student-1:city" });
    const undone = undoTransaction(second);
    const next = applyTransaction(undone, {
      ...renameStudentTransaction("分叉"),
      historyGroup: "student-1:name",
    });

    expect(next.students[0]?.name).toBe("分叉");
    expect(next.history.past).toHaveLength(2);
    expect(next.history.future).toEqual([]);
  });

  it("trims history to the newest 50 entries", () => {
    let project: ProjectDocument = createProjectDocument({
      students,
      templateId: "original",
      dataView: "province",
    });

    for (let index = 0; index < 55; index += 1) {
      project = applyTransaction(project, renameStudentTransaction(`学生${index}`));
    }

    expect(project.history.past).toHaveLength(50);
    expect(project.history.past.map((entry) => entry.id)).toEqual(
      Array.from({ length: 50 }, (_, index) => `tx-学生${index + 5}`),
    );
    expect(project.students[0]?.name).toBe("学生54");
  });

  it("keeps rich scene data stable across undo, redo, and undo", () => {
    const base = createRichProject();
    const changed = applyTransaction(base, {
      id: "tx-rich",
      label: "修改丰富场景",
      source: "manual",
      apply: (current) => ({
        ...current,
        map: { ...current.map, opacity: 0.42 },
        guests: { ...current.guests, customText: "再会" },
        textElements: current.textElements.map((text) =>
          text.id === "text-custom" ? { ...text, content: "前程似锦" } : text
        ),
        assetElements: current.assetElements.map((asset) => ({ ...asset, rotation: 45 })),
      }),
    });

    const firstUndo = undoTransaction(changed);
    const redone = redoTransaction(firstUndo);
    const secondUndo = undoTransaction(redone);

    expect(secondUndo).toEqual(firstUndo);
    expect(secondUndo.map.provinceStyles).toEqual(base.map.provinceStyles);
    expect(secondUndo.guests).toEqual(base.guests);
    expect(secondUndo.textElements).toEqual(base.textElements);
    expect(secondUndo.assetElements).toEqual(base.assetElements);
    expect(redone).toMatchObject({ map: { opacity: 0.42 }, guests: { customText: "再会" } });
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
