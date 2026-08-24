import { describe, expect, it } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import {
  createIndexedDbProjectStore,
  createMemoryProjectStore,
  createSampleProject,
  createEmptyProject,
  duplicateStoredProject,
  ProjectStoreConflictError,
  type ProjectStore,
  type StoredProject,
} from "./project-store";
import { createProjectDocument } from "./project-document";
import { createProjectPackage } from "./project-package";

describe("project store", () => {
  it("lists, gets, puts, and removes projects", async () => {
    const store = createMemoryProjectStore();
    const sample = createSampleProject();
    await store.put(sample);
    expect((await store.list()).map((p) => p.id)).toEqual([sample.id]);
    expect((await store.get(sample.id))?.name).toBe("示例：2026届毕业去向");
    await store.remove(sample.id);
    expect(await store.list()).toEqual([]);
  });

  it("returns null for a missing project", async () => {
    const store = createMemoryProjectStore();
    expect(await store.get("missing")).toBeNull();
  });

  it("sample project contains the 12 built-in students", () => {
    const sample = createSampleProject();
    expect(sample.pack.project.students).toHaveLength(12);
    expect(sample.pack.project.students[0]?.name).toBe("林舟");
  });

  it("empty project has no students", () => {
    expect(createEmptyProject().pack.project.students).toEqual([]);
  });

  it("duplicates a project with a fresh id", () => {
    const sample = createSampleProject();
    const copy = duplicateStoredProject(sample, "复制项目");
    expect(copy.id).not.toBe(sample.id);
    expect(copy.name).toBe("复制项目");
    expect(copy.pack.project.students).toHaveLength(12);
    expect(copy.pack).not.toBe(sample.pack);
  });

  it("keeps server-side package valid through the round trip", async () => {
    const store = createMemoryProjectStore();
    const pack = createProjectPackage({
      project: createProjectDocument({ students: [], templateId: "original", dataView: "province" }),
      assets: [], fonts: [], customTemplates: [], renderSettings: { mode: "normal", fixedFps: 20 },
    });
    await store.put({ id: "p1", name: "x", createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z", pack });
    expect((await store.get("p1"))?.pack.project).toBeDefined();
  });

  it("list() returns clones so caller mutations do not pollute the store", async () => {
    const store = createMemoryProjectStore();
    const sample = createSampleProject();
    await store.put(sample);
    const listed = await store.list();
    listed[0]!.name = "被修改的名字";
    listed[0]!.pack.project.students[0]!.name = "被修改的学生";
    const relisted = await store.list();
    expect(relisted[0]!.name).toBe("示例：2026届毕业去向");
    expect(relisted[0]!.pack.project.students[0]!.name).toBe("林舟");
    expect((await store.get(sample.id))?.name).toBe("示例：2026届毕业去向");
  });

  it("compare-and-set rejects a stale expectedUpdatedAt and keeps the stored record", async () => {
    const store = createMemoryProjectStore();
    const sample = createSampleProject();
    await store.put(sample);
    const otherTab = { ...sample, name: "其他标签页保存的名字", updatedAt: "2026-02-02T00:00:00.000Z" };
    await store.put(otherTab);

    const conflict = await store.put({ ...sample, name: "本页覆盖" }, { expectedUpdatedAt: sample.updatedAt })
      .then(() => null, (error: unknown) => error);

    expect(conflict).toBeInstanceOf(ProjectStoreConflictError);
    expect((conflict as ProjectStoreConflictError).storedUpdatedAt).toBe("2026-02-02T00:00:00.000Z");
    expect((conflict as ProjectStoreConflictError).expectedUpdatedAt).toBe(sample.updatedAt);
    expect((await store.get(sample.id))?.name).toBe("其他标签页保存的名字");
  });

  it("throws when the IndexedDB factory is unavailable", async () => {
    const store = createIndexedDbProjectStore(null as unknown as IDBFactory);
    await expect(store.put(createSampleProject())).rejects.toThrow("当前浏览器不支持 IndexedDB");
    await expect(store.remove("any-id")).rejects.toThrow("当前浏览器不支持 IndexedDB");
    expect(await store.list()).toEqual([]);
    expect(await store.get("any-id")).toBeNull();
  });
});

function projectAt(id: string, name: string, updatedAt: string): StoredProject {
  return { ...createSampleProject(), id, name, createdAt: "2026-01-01T00:00:00.000Z", updatedAt };
}

const storeFactories: Array<[string, () => ProjectStore]> = [
  ["memory", () => createMemoryProjectStore()],
  ["IndexedDB", () => createIndexedDbProjectStore(new IDBFactory())],
];

describe.each(storeFactories)("project store compare-and-set (%s)", (_label, createStore) => {
  it("writes when expectedUpdatedAt matches the stored record", async () => {
    const store = createStore();
    await store.put(projectAt("p1", "初始", "2026-01-01T00:00:00.000Z"));

    await store.put(projectAt("p1", "本页保存", "2026-01-01T00:05:00.000Z"), {
      expectedUpdatedAt: "2026-01-01T00:00:00.000Z",
    });

    const record = await store.get("p1");
    expect(record?.name).toBe("本页保存");
    expect(record?.updatedAt).toBe("2026-01-01T00:05:00.000Z");
  });

  it("writes the first record even when expectedUpdatedAt is provided", async () => {
    const store = createStore();

    await store.put(projectAt("p1", "首存", "2026-01-01T00:00:00.000Z"), {
      expectedUpdatedAt: "2026-01-01T00:00:00.000Z",
    });

    expect((await store.get("p1"))?.name).toBe("首存");
  });

  it("rejects and preserves the other tab's record when expectedUpdatedAt is stale", async () => {
    const store = createStore();
    await store.put(projectAt("p1", "初始", "2026-01-01T00:00:00.000Z"));
    await store.put(projectAt("p1", "其他标签页", "2026-01-01T00:10:00.000Z"));

    const conflict = await store
      .put(projectAt("p1", "本页覆盖", "2026-01-01T00:11:00.000Z"), { expectedUpdatedAt: "2026-01-01T00:00:00.000Z" })
      .then(() => null, (error: unknown) => error);

    expect(conflict).toBeInstanceOf(ProjectStoreConflictError);
    const details = conflict as ProjectStoreConflictError;
    expect(details.message).toContain("项目已被其他标签页修改");
    expect(details.projectId).toBe("p1");
    expect(details.expectedUpdatedAt).toBe("2026-01-01T00:00:00.000Z");
    expect(details.storedUpdatedAt).toBe("2026-01-01T00:10:00.000Z");

    const record = await store.get("p1");
    expect(record?.name).toBe("其他标签页");
    expect(record?.updatedAt).toBe("2026-01-01T00:10:00.000Z");
  });

  it("keeps last-write-wins when expectedUpdatedAt is omitted", async () => {
    const store = createStore();
    await store.put(projectAt("p1", "初始", "2026-01-01T00:00:00.000Z"));
    await store.put(projectAt("p1", "其他标签页", "2026-01-01T00:10:00.000Z"));

    await store.put(projectAt("p1", "无条件覆盖", "2026-01-01T00:11:00.000Z"));

    expect((await store.get("p1"))?.name).toBe("无条件覆盖");
  });

  it("keeps writing after a conflict once the caller re-reads updatedAt", async () => {
    const store = createStore();
    await store.put(projectAt("p1", "其他标签页", "2026-01-01T00:10:00.000Z"));
    await expect(
      store.put(projectAt("p1", "本页覆盖", "2026-01-01T00:11:00.000Z"), { expectedUpdatedAt: "2026-01-01T00:00:00.000Z" }),
    ).rejects.toBeInstanceOf(ProjectStoreConflictError);

    const fresh = await store.get("p1");
    await store.put(projectAt("p1", "重读后保存", "2026-01-01T00:12:00.000Z"), { expectedUpdatedAt: fresh!.updatedAt });

    expect((await store.get("p1"))?.name).toBe("重读后保存");
  });
});
