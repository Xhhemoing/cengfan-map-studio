import { describe, expect, it } from "vitest";
import { applyTransaction, createProjectDocument } from "./project-document";
import type { Student } from "./project-data";
import { DEFAULT_RENDER_SETTINGS } from "./render-settings";
import type { UserAsset } from "./assets";
import type { WorkspaceSession } from "./workspace-session";
import {
  addAssetToLibrary,
  buildCollaborationPackage,
  buildWorkspaceSessionUpdate,
  canSendCollaborationUpdate,
  createStudentUpdateTransaction,
  deriveSessionSelection,
  describeProjectHistory,
  freezeCardPositions,
  planCollaborationSend,
  type CollaborationSendGate,
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

describe("canSendCollaborationUpdate", () => {
  const editableRoom: CollaborationSendGate = {
    roomId: "ROOM1",
    roomAccessToken: "token",
    roomRole: "owner",
    roomReadonly: false,
    roomClosed: false,
  };

  it("allows owners and editors of an open writable room with a baseline", () => {
    expect(canSendCollaborationUpdate(editableRoom, true)).toBe(true);
    expect(canSendCollaborationUpdate({ ...editableRoom, roomRole: "editor" }, true)).toBe(true);
  });

  it("blocks upload whenever the room, credentials or baseline are missing", () => {
    expect(canSendCollaborationUpdate({ ...editableRoom, roomId: null }, true)).toBe(false);
    expect(canSendCollaborationUpdate({ ...editableRoom, roomAccessToken: null }, true)).toBe(false);
    expect(canSendCollaborationUpdate(editableRoom, false)).toBe(false);
  });

  it("blocks viewers, readonly rooms and closed rooms", () => {
    expect(canSendCollaborationUpdate({ ...editableRoom, roomRole: "viewer" }, true)).toBe(false);
    expect(canSendCollaborationUpdate({ ...editableRoom, roomReadonly: true }, true)).toBe(false);
    expect(canSendCollaborationUpdate({ ...editableRoom, roomClosed: true }, true)).toBe(false);
  });
});

describe("planCollaborationSend", () => {
  const baselineExportedAt = "2026-08-24T00:00:00.000Z";

  function workspaceSnapshot(students: Student[]): WorkspaceStateSnapshot {
    return {
      project: projectWith(students),
      assets: [],
      fonts: [],
      customTemplates: [],
      renderSettings: { ...DEFAULT_RENDER_SETTINGS },
    };
  }

  it("returns no operations when the workspace matches the baseline", () => {
    const snapshot = workspaceSnapshot([domesticStudent]);
    const baseline = buildCollaborationPackage(snapshot, baselineExportedAt);
    expect(planCollaborationSend(baseline, snapshot)).toEqual([]);
  });

  it("ignores undo-history-only differences and never diffs the pinned exportedAt", () => {
    const snapshot = workspaceSnapshot([domesticStudent]);
    const baseline = buildCollaborationPackage(snapshot, baselineExportedAt);
    const withHistory = applyTransaction(snapshot.project, {
      id: "tx-history",
      label: "编辑后撤销",
      source: "manual",
      apply: (current) => current,
    });
    // 撤销栈与时间戳不产生增量；applyTransaction 的字段归一化（如 lineHeight 缺省
    // 落成自有属性）与版本号属于内容差异，允许出现。
    const operations = planCollaborationSend(baseline, { ...snapshot, project: withHistory });
    expect(operations.some((operation) => operation.path.includes("history"))).toBe(false);
    expect(operations.some((operation) => operation.path.includes("exportedAt"))).toBe(false);
    expect(operations).toContainEqual({ type: "set", path: ["project", "version"], value: withHistory.version });
    expect(operations.every((operation) => operation.path[0] === "project")).toBe(true);
  });

  it("emits incremental set operations for real content edits", () => {
    const snapshot = workspaceSnapshot([domesticStudent]);
    const baseline = buildCollaborationPackage(snapshot, baselineExportedAt);
    const edited = applyTransaction(snapshot.project, {
      id: "tx-view",
      label: "切换数据呈现",
      source: "manual",
      apply: (current) => ({ ...current, dataView: "city" }),
    });

    const operations = planCollaborationSend(baseline, { ...snapshot, project: edited });
    expect(operations).toContainEqual({ type: "set", path: ["project", "dataView"], value: "city" });
    expect(operations.every((operation) => operation.path[0] === "project")).toBe(true);
  });
});

describe("deriveSessionSelection", () => {
  const base: WorkspaceSession = { stage: "data", savedAt: "" };

  it("falls back to the default title text without a stored selection", () => {
    expect(deriveSessionSelection(base)).toEqual({ type: "text", id: "text-note" });
  });

  it("restores provinces, panels and asset instances", () => {
    expect(deriveSessionSelection({ ...base, selectedProvince: "浙江省" })).toEqual({ type: "province", province: "浙江省" });
    expect(deriveSessionSelection({ ...base, selectedObject: "cards" })).toEqual({ type: "cards" });
    expect(deriveSessionSelection({ ...base, selectedObject: "guests" })).toEqual({ type: "guests" });
    expect(deriveSessionSelection({ ...base, selectedObject: "asset-9" })).toEqual({ type: "asset", id: "asset-9" });
  });

  it("prefers the stored province over a stored object", () => {
    expect(deriveSessionSelection({ ...base, selectedProvince: "北京市", selectedObject: "cards" }))
      .toEqual({ type: "province", province: "北京市" });
  });
});

describe("buildWorkspaceSessionUpdate", () => {
  const previous: WorkspaceSession = { stage: "data", selectedProvince: "浙江省", savedAt: "2026-01-01T00:00:00.000Z" };

  it("replaces the stored selection instead of stacking old keys", () => {
    expect(buildWorkspaceSessionUpdate(previous, "map", { type: "asset", id: "asset-1" }, "t1"))
      .toEqual({ stage: "map", selectedObject: "asset-1", savedAt: "t1" });
    expect(buildWorkspaceSessionUpdate(previous, "content", { type: "province", province: "北京市" }, "t2"))
      .toEqual({ stage: "content", selectedProvince: "北京市", savedAt: "t2" });
  });

  it("stores cards/guests panels as objects and drops selection keys for canvas", () => {
    expect(buildWorkspaceSessionUpdate(previous, "frame", { type: "cards" }, "t3"))
      .toEqual({ stage: "frame", selectedObject: "cards", savedAt: "t3" });
    expect(buildWorkspaceSessionUpdate(previous, "export", { type: "canvas" }, "t4"))
      .toEqual({ stage: "export", savedAt: "t4" });
  });
});

describe("describeProjectHistory", () => {
  it("disables both directions with placeholder labels for an empty history", () => {
    expect(describeProjectHistory({ past: [], future: [] })).toEqual({
      canUndo: false,
      canRedo: false,
      undoLabel: "暂无可撤销操作",
      redoLabel: "暂无可重做操作",
    });
  });

  it("labels undo with the latest past entry and redo with the next future entry", () => {
    const project = projectWith([domesticStudent]);
    const withHistory = applyTransaction(project, {
      id: "tx-label",
      label: "切换数据呈现",
      source: "manual",
      apply: (current) => ({ ...current, dataView: "city" }),
    });

    const undoSide = describeProjectHistory(withHistory.history);
    expect(undoSide).toMatchObject({ canUndo: true, canRedo: false, undoLabel: "撤销：切换数据呈现" });

    const redoSide = describeProjectHistory({ past: [], future: withHistory.history.past });
    expect(redoSide).toMatchObject({ canUndo: false, canRedo: true, redoLabel: "重做：切换数据呈现" });
  });
});

describe("addAssetToLibrary", () => {
  const asset: UserAsset = {
    id: "asset-1",
    label: "校徽",
    kind: "decoration",
    src: "data:image/png;base64,AAA",
    provinceIds: [],
    source: "user",
  };

  it("appends a new asset and reports the library message", () => {
    const result = addAssetToLibrary([], asset);
    expect(result.assets).toEqual([asset]);
    expect(result.message).toBe("已加入素材库：校徽");
  });

  it("keeps the original array reference for duplicates by id", () => {
    const current = [asset];
    const result = addAssetToLibrary(current, { ...asset, label: "校徽副本" });
    expect(result.assets).toBe(current);
    expect(result.message).toBe("素材库已有相同素材：校徽副本");
  });

  it("treats same src+kind+provinces as a duplicate but same src with a different kind as new", () => {
    const current = [asset];
    const sameContent = { ...asset, id: "asset-2" };
    expect(addAssetToLibrary(current, sameContent).assets).toBe(current);

    const differentKind = { ...asset, id: "asset-3", kind: "background" as UserAsset["kind"] };
    expect(addAssetToLibrary(current, differentKind).assets).toHaveLength(2);

    const differentProvinces = { ...asset, id: "asset-4", provinceIds: ["浙江省"] };
    expect(addAssetToLibrary(current, differentProvinces).assets).toHaveLength(2);
  });
});
