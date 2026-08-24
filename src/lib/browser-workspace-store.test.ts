import { describe, expect, it, vi } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import { createProjectDocument } from "./project-document";
import { createProjectPackage, type ProjectPackage } from "./project-package";
import {
  createIndexedDbWorkspaceStore,
  loadBrowserWorkspaceMirror,
  loadLatestBrowserWorkspace,
  saveBrowserWorkspaceSnapshot,
  WorkspaceStoreConflictError,
  type AsyncWorkspaceStore,
  type SyncWorkspaceStore,
} from "./browser-workspace-store";

function packageAt(name: string, exportedAt: string): ProjectPackage {
  return createProjectPackage({
    project: createProjectDocument({
      students: [{ id: "student-1", name, university: "测试大学", city: "杭州市", visibility: true }],
      templateId: "original",
      dataView: "province",
    }),
    assets: [],
    fonts: [],
    customTemplates: [],
    renderSettings: { mode: "normal", fixedFps: 20 },
    now: new Date(exportedAt),
  });
}

function memorySyncStore(initial: string | null = null): SyncWorkspaceStore {
  let value = initial;
  return {
    get: vi.fn(() => value),
    set: vi.fn((next) => { value = next; }),
  };
}

/** 内存版 durable store：与 IndexedDB 实现一样按 expectedExportedAt 做 CAS。 */
function memoryAsyncStore(initial: ProjectPackage | null = null): AsyncWorkspaceStore {
  let value = initial;
  return {
    get: vi.fn(async () => value),
    set: vi.fn(async (next, options) => {
      const expected = options?.expectedExportedAt;
      if (expected !== undefined && value && value.exportedAt !== expected) {
        throw new WorkspaceStoreConflictError("durable", expected, value.exportedAt);
      }
      value = structuredClone(next);
    }),
  };
}

describe("browser workspace store", () => {
  it("writes a complete workspace to the durable store and synchronous mirror", async () => {
    const pack = packageAt("双副本", "2026-07-27T10:00:00.000Z");
    const mirror = memorySyncStore();
    const durable = memoryAsyncStore();

    const result = await saveBrowserWorkspaceSnapshot(pack, { mirror, durable });

    expect(result).toEqual({ durable: "saved", mirror: "saved" });
    expect(await durable.get()).toEqual(pack);
    expect(JSON.parse(mirror.get()!)).toEqual(pack);
  });

  it("keeps the durable copy when the synchronous mirror exceeds quota", async () => {
    const pack = packageAt("容量降级", "2026-07-27T11:00:00.000Z");
    const mirror: SyncWorkspaceStore = {
      get: () => null,
      set: () => { throw new DOMException("Quota exceeded", "QuotaExceededError"); },
    };
    const durable = memoryAsyncStore();

    const result = await saveBrowserWorkspaceSnapshot(pack, { mirror, durable });

    expect(result).toEqual({ durable: "saved", mirror: "failed" });
    expect((await durable.get())?.project.students[0]?.name).toBe("容量降级");
  });

  it("loads the newest valid copy and ignores a damaged mirror", async () => {
    const older = packageAt("旧副本", "2026-07-27T09:00:00.000Z");
    const newer = packageAt("新副本", "2026-07-27T12:00:00.000Z");
    const durable = memoryAsyncStore(older);
    const mirror = memorySyncStore(JSON.stringify(newer));

    await expect(loadLatestBrowserWorkspace({ mirror, durable })).resolves.toEqual(newer);

    const damagedMirror = memorySyncStore("not-json");
    await expect(loadLatestBrowserWorkspace({ mirror: damagedMirror, durable })).resolves.toEqual(older);
  });

  it("restores the complete synchronous mirror before asynchronous hydration", () => {
    const pack = packageAt("首屏恢复", "2026-07-27T13:00:00.000Z");

    expect(loadBrowserWorkspaceMirror(memorySyncStore(JSON.stringify(pack)))).toEqual(pack);
    expect(loadBrowserWorkspaceMirror(memorySyncStore("damaged"))).toBeNull();
  });
});

const durableFactories: Array<[string, (initial?: ProjectPackage) => AsyncWorkspaceStore]> = [
  ["memory", (initial) => memoryAsyncStore(initial ?? null)],
  ["IndexedDB", () => createIndexedDbWorkspaceStore(new IDBFactory())],
];

describe.each(durableFactories)("durable workspace store compare-and-set (%s)", (_label, createStore) => {
  it("writes when expectedExportedAt matches the stored snapshot", async () => {
    const store = createStore();
    await store.set(packageAt("初始", "2026-08-01T00:00:00.000Z"));

    await store.set(packageAt("本页保存", "2026-08-01T00:05:00.000Z"), {
      expectedExportedAt: "2026-08-01T00:00:00.000Z",
    });

    const stored = await store.get();
    expect(stored?.project.students[0]?.name).toBe("本页保存");
    expect(stored?.exportedAt).toBe("2026-08-01T00:05:00.000Z");
  });

  it("writes the first snapshot even when expectedExportedAt is provided", async () => {
    const store = createStore();

    await store.set(packageAt("首存", "2026-08-01T00:00:00.000Z"), {
      expectedExportedAt: "2026-08-01T00:00:00.000Z",
    });

    expect((await store.get())?.project.students[0]?.name).toBe("首存");
  });

  it("rejects a stale expectedExportedAt and keeps the other tab's snapshot", async () => {
    const store = createStore();
    await store.set(packageAt("初始", "2026-08-01T00:00:00.000Z"));
    await store.set(packageAt("其他标签页", "2026-08-01T00:10:00.000Z"));

    const conflict = await store
      .set(packageAt("本页覆盖", "2026-08-01T00:11:00.000Z"), { expectedExportedAt: "2026-08-01T00:00:00.000Z" })
      .then(() => null, (error: unknown) => error);

    expect(conflict).toBeInstanceOf(WorkspaceStoreConflictError);
    const details = conflict as WorkspaceStoreConflictError;
    expect(details.message).toContain("工作区已被其他标签页修改");
    expect(details.scope).toBe("durable");
    expect(details.expectedExportedAt).toBe("2026-08-01T00:00:00.000Z");
    expect(details.storedExportedAt).toBe("2026-08-01T00:10:00.000Z");

    const stored = await store.get();
    expect(stored?.project.students[0]?.name).toBe("其他标签页");
    expect(stored?.exportedAt).toBe("2026-08-01T00:10:00.000Z");
  });

  it("keeps last-write-wins when expectedExportedAt is omitted", async () => {
    const store = createStore();
    await store.set(packageAt("其他标签页", "2026-08-01T00:10:00.000Z"));

    await store.set(packageAt("无条件覆盖", "2026-08-01T00:11:00.000Z"));

    expect((await store.get())?.project.students[0]?.name).toBe("无条件覆盖");
  });

  it("keeps writing after a conflict once the caller re-reads exportedAt", async () => {
    const store = createStore();
    await store.set(packageAt("其他标签页", "2026-08-01T00:10:00.000Z"));
    await expect(
      store.set(packageAt("本页覆盖", "2026-08-01T00:11:00.000Z"), { expectedExportedAt: "2026-08-01T00:00:00.000Z" }),
    ).rejects.toBeInstanceOf(WorkspaceStoreConflictError);

    const fresh = await store.get();
    await store.set(packageAt("重读后保存", "2026-08-01T00:12:00.000Z"), { expectedExportedAt: fresh!.exportedAt });

    expect((await store.get())?.project.students[0]?.name).toBe("重读后保存");
  });
});

describe("workspace snapshot compare-and-set", () => {
  it("saves both copies when expectedExportedAt matches", async () => {
    const base = packageAt("初始", "2026-08-02T00:00:00.000Z");
    const mirror = memorySyncStore(JSON.stringify(base));
    const durable = memoryAsyncStore(base);
    const next = packageAt("本页保存", "2026-08-02T00:05:00.000Z");

    const result = await saveBrowserWorkspaceSnapshot(next, { mirror, durable }, {
      expectedExportedAt: base.exportedAt,
    });

    expect(result).toEqual({ durable: "saved", mirror: "saved" });
    expect(await durable.get()).toEqual(next);
    expect(JSON.parse(mirror.get()!)).toEqual(next);
  });

  it("rejects a stale expectedExportedAt and leaves the other tab's durable snapshot", async () => {
    const base = packageAt("初始", "2026-08-02T00:00:00.000Z");
    const otherTab = packageAt("其他标签页", "2026-08-02T00:10:00.000Z");
    // 镜像仍停留在旧值(上次镜像写失败)，冲突只能由 durable 判定。
    const mirror = memorySyncStore(JSON.stringify(base));
    const durable = memoryAsyncStore(otherTab);

    const conflict = await saveBrowserWorkspaceSnapshot(
      packageAt("本页覆盖", "2026-08-02T00:11:00.000Z"),
      { mirror, durable },
      { expectedExportedAt: base.exportedAt },
    ).then(() => null, (error: unknown) => error);

    expect(conflict).toBeInstanceOf(WorkspaceStoreConflictError);
    expect((conflict as WorkspaceStoreConflictError).scope).toBe("durable");
    expect(await durable.get()).toEqual(otherTab);
    expect(JSON.parse(mirror.get()!)).toEqual(base);
  });

  it("rejects before touching the durable copy when the mirror is newer than expected", async () => {
    const base = packageAt("初始", "2026-08-02T00:00:00.000Z");
    const mirror = memorySyncStore(JSON.stringify(packageAt("其他标签页", "2026-08-02T00:10:00.000Z")));
    const durable = memoryAsyncStore(base);

    const conflict = await saveBrowserWorkspaceSnapshot(
      packageAt("本页覆盖", "2026-08-02T00:11:00.000Z"),
      { mirror, durable },
      { expectedExportedAt: base.exportedAt },
    ).then(() => null, (error: unknown) => error);

    expect(conflict).toBeInstanceOf(WorkspaceStoreConflictError);
    expect((conflict as WorkspaceStoreConflictError).scope).toBe("mirror");
    expect((conflict as WorkspaceStoreConflictError).storedExportedAt).toBe("2026-08-02T00:10:00.000Z");
    expect(durable.set).not.toHaveBeenCalled();
    expect(await durable.get()).toEqual(base);
  });

  it("keeps last-write-wins when expectedExportedAt is omitted", async () => {
    const otherTab = packageAt("其他标签页", "2026-08-02T00:10:00.000Z");
    const mirror = memorySyncStore(JSON.stringify(otherTab));
    const durable = memoryAsyncStore(otherTab);
    const next = packageAt("无条件覆盖", "2026-08-02T00:11:00.000Z");

    const result = await saveBrowserWorkspaceSnapshot(next, { mirror, durable });

    expect(result).toEqual({ durable: "saved", mirror: "saved" });
    expect(await durable.get()).toEqual(next);
    expect(JSON.parse(mirror.get()!)).toEqual(next);
  });

  it("never lets an older package overwrite a newer mirror", async () => {
    const newerMirror = packageAt("其他标签页", "2026-08-02T00:10:00.000Z");
    const mirror = memorySyncStore(JSON.stringify(newerMirror));
    const durable = memoryAsyncStore(packageAt("初始", "2026-08-02T00:00:00.000Z"));
    const stale = packageAt("过期快照", "2026-08-02T00:05:00.000Z");

    const result = await saveBrowserWorkspaceSnapshot(stale, { mirror, durable });

    expect(result).toEqual({ durable: "saved", mirror: "skipped" });
    expect(JSON.parse(mirror.get()!)).toEqual(newerMirror);
    expect(await durable.get()).toEqual(stale);
  });
});
