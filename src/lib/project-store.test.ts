import { describe, expect, it } from "vitest";
import {
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
});
