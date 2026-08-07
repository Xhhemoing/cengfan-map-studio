import { describe, expect, it } from "vitest";
import {
  createIndexedDbProjectStore,
  createMemoryProjectStore,
  createSampleProject,
  createEmptyProject,
  duplicateStoredProject,
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

  it("throws when the IndexedDB factory is unavailable", async () => {
    const store = createIndexedDbProjectStore(null as unknown as IDBFactory);
    await expect(store.put(createSampleProject())).rejects.toThrow("当前浏览器不支持 IndexedDB");
    await expect(store.remove("any-id")).rejects.toThrow("当前浏览器不支持 IndexedDB");
    expect(await store.list()).toEqual([]);
    expect(await store.get("any-id")).toBeNull();
  });
});
