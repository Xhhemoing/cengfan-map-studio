import { describe, expect, it } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import { createIndexedDbProjectStore } from "./project-store";
import { createIndexedDbWorkspaceStore } from "./browser-workspace-store";
import { createProjectPackage } from "./project-package";
import { createProjectDocument } from "./project-document";

function workspacePack() {
  return createProjectPackage({
    project: createProjectDocument({
      students: [{ id: "student-1", name: "旧工作区学生", university: "测试大学", city: "杭州市", visibility: true }],
      templateId: "original",
      dataView: "province",
    }),
    assets: [], fonts: [], customTemplates: [], renderSettings: { mode: "normal", fixedFps: 20 },
  });
}

function seedLegacyWorkspaceDatabase(factory: IDBFactory, pack = workspacePack()): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = factory.open("cengfan-map-studio", 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains("workspace")) {
        request.result.createObjectStore("workspace");
      }
    };
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction("workspace", "readwrite");
      tx.objectStore("workspace").put(pack, "current");
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onerror = () => reject(tx.error);
    };
    request.onerror = () => reject(request.error);
  });
}

describe("project store IndexedDB version upgrade", () => {
  it("migrates legacy workspace data into a project without aborting the upgrade transaction", async () => {
    const factory = new IDBFactory();
    await seedLegacyWorkspaceDatabase(factory);

    const store = createIndexedDbProjectStore(factory);
    const projects = await store.list();

    expect(projects).toHaveLength(1);
    expect(projects[0]!.name).toBe("迁移的项目");
  });

  it("upgrades a clean database (no legacy workspace) without errors", async () => {
    const factory = new IDBFactory();
    const store = createIndexedDbProjectStore(factory);
    expect(await store.list()).toEqual([]);
  });

  it("does not re-migrate after the legacy key was consumed", async () => {
    const factory = new IDBFactory();
    await seedLegacyWorkspaceDatabase(factory);

    const store = createIndexedDbProjectStore(factory);
    expect(await store.list()).toHaveLength(1);
    // 再次打开同一数据库：legacy "current" 已被删除，不应重复迁移
    const reopened = createIndexedDbProjectStore(factory);
    const projects = await reopened.list();
    expect(projects).toHaveLength(1);
    expect(projects[0]!.name).toBe("迁移的项目");
  });

  it("workspace store keeps working after the project store upgraded the shared database", async () => {
    const factory = new IDBFactory();
    const projectStore = createIndexedDbProjectStore(factory);
    await projectStore.put({
      id: "proj-existing", name: "已有项目", createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z", pack: workspacePack(),
    });

    const workspaceStore = createIndexedDbWorkspaceStore(factory);
    await workspaceStore.set(workspacePack());
    const loaded = await workspaceStore.get();
    expect(loaded?.project.students[0]?.name).toBe("旧工作区学生");
    expect((await projectStore.list()).map((p) => p.id)).toEqual(["proj-existing"]);
  });

  it("project store keeps working when the workspace store created the database first", async () => {
    const factory = new IDBFactory();
    const workspaceStore = createIndexedDbWorkspaceStore(factory);
    await workspaceStore.set(workspacePack());

    const projectStore = createIndexedDbProjectStore(factory);
    expect(await projectStore.list()).toEqual([]);
    await projectStore.put({
      id: "proj-new", name: "新项目", createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z", pack: workspacePack(),
    });
    expect(await workspaceStore.get()).not.toBeNull();
  });
});
