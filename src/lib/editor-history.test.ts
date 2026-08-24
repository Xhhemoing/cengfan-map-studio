import { describe, expect, it } from "vitest";
import { describeHistoryActions, matchEditorHistoryShortcut } from "./editor-history";
import { applyTransaction, createProjectDocument, type ProjectDocument } from "./project-document";

function documentFixture(): ProjectDocument {
  return createProjectDocument({ students: [], templateId: "original", dataView: "province" });
}

function withOneEdit(): ProjectDocument {
  return applyTransaction(documentFixture(), {
    id: "tx-1",
    label: "调整数据框位置",
    source: "manual",
    apply: (current) => ({ ...current, cards: { ...current.cards, positions: { a: { x: 1, y: 1 } } } }),
  });
}

describe("describeHistoryActions", () => {
  it("says nothing is available on a fresh project", () => {
    expect(describeHistoryActions(documentFixture())).toEqual({
      canUndo: false,
      canRedo: false,
      undoLabel: "暂无可撤销操作",
      redoLabel: "暂无可重做操作",
    });
  });

  it("names the step that undo would take back", () => {
    const labels = describeHistoryActions(withOneEdit());

    expect(labels.canUndo).toBe(true);
    expect(labels.undoLabel).toBe("撤销：调整数据框位置");
    expect(labels.redoLabel).toBe("暂无可重做操作");
  });

  it("falls back to a neutral phrase when the counted entry is not actually there", () => {
    const project = documentFixture();
    const hole = undefined as unknown as ProjectDocument["history"]["past"][number];
    const gappy: ProjectDocument = { ...project, history: { past: [hole], future: [hole] } };

    const labels = describeHistoryActions(gappy);

    expect(labels.undoLabel).toBe("撤销：上一步");
    expect(labels.redoLabel).toBe("重做：下一步");
  });
});

describe("matchEditorHistoryShortcut", () => {
  function event(overrides: Partial<Parameters<typeof matchEditorHistoryShortcut>[0]> = {}) {
    return { key: "z", metaKey: false, ctrlKey: true, shiftKey: false, target: null, ...overrides };
  }

  it("recognises undo on both modifier keys", () => {
    expect(matchEditorHistoryShortcut(event())).toBe("undo");
    expect(matchEditorHistoryShortcut(event({ ctrlKey: false, metaKey: true }))).toBe("undo");
    expect(matchEditorHistoryShortcut(event({ key: "Z" }))).toBe("undo");
  });

  it("recognises both redo spellings", () => {
    expect(matchEditorHistoryShortcut(event({ shiftKey: true }))).toBe("redo");
    expect(matchEditorHistoryShortcut(event({ key: "y" }))).toBe("redo");
  });

  it("ignores unmodified keys and unrelated combinations", () => {
    expect(matchEditorHistoryShortcut(event({ ctrlKey: false }))).toBeNull();
    expect(matchEditorHistoryShortcut(event({ key: "s" }))).toBeNull();
  });

  it("leaves the browser's own undo alone while the user is typing", () => {
    for (const tagName of ["INPUT", "TEXTAREA", "SELECT"]) {
      expect(matchEditorHistoryShortcut(event({ target: { tagName } as unknown as EventTarget }))).toBeNull();
    }
    expect(matchEditorHistoryShortcut(event({
      target: { tagName: "DIV", isContentEditable: true } as unknown as EventTarget,
    }))).toBeNull();
  });

  it("still fires when the event comes from a plain element", () => {
    expect(matchEditorHistoryShortcut(event({
      target: { tagName: "DIV", isContentEditable: false } as unknown as EventTarget,
    }))).toBe("undo");
  });
});
