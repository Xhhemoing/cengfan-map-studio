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

function seedProjectDatabaseWithoutMetadata(factory: IDBFactory): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = factory.open("cengfan-map-studio", 2);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains("projects")) request.result.createObjectStore("projects");
      if (!request.result.objectStoreNames.contains("workspace")) request.result.createObjectStore("workspace");
    };
    request.onsuccess = () => {
      const db = request.result;
      const tx = db.transaction("projects", "readwrite");
      tx.objectStore("projects").put(storedProject("proj-pre-metadata"), "proj-pre-metadata");
      tx.oncomplete = () => { db.close(); resolve(); };
      tx.onabort = () => { db.close(); reject(tx.error); };
    };
    request.onerror = () => reject(request.error);
  });
}

function readWorkspaceKey(factory: IDBFactory, key: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const request = factory.open("cengfan-map-studio");
    request.onsuccess = () => {
      const db = request.result;
      const read = db.transaction("workspace", "readonly").objectStore("workspace").get(key);
      read.onsuccess = () => { db.close(); resolve(read.result); };
      read.onerror = () => { db.close(); reject(read.error); };
    };
    request.onerror = () => reject(request.error);
  });
}

/** 以指定版本打开共享数据库，并记录是否触发过 blocked。 */
function openAtVersion(factory: IDBFactory, version: number): Promise<{ db: IDBDatabase; blocked: number }> {
  return new Promise((resolve, reject) => {
    let blocked = 0;
    const request = factory.open("cengfan-map-studio", version);
    request.onupgradeneeded = () => {};
    request.onblocked = () => { blocked += 1; };
    request.onsuccess = () => resolve({ db: request.result, blocked });
    request.onerror = () => reject(request.error ?? new Error("open failed"));
  });
}

function storedProject(id: string) {
  return {
    id,
    name: id,
    createdAt: "2026-01-01T00:00:00.000Z",
    updatedAt: "2026-01-01T00:00:00.000Z",
    pack: workspacePack(),
  };
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

  it("projects existing records into the metadata store during schema upgrade", async () => {
    const factory = new IDBFactory();
    await seedProjectDatabaseWithoutMetadata(factory);

    const store = createIndexedDbProjectStore(factory);
    const projects = await store.list();

    expect(projects).toHaveLength(1);
    expect(projects[0]).toMatchObject({
      id: "proj-pre-metadata",
      studentCount: 1,
      assetCount: 0,
    });
    expect((await store.get("proj-pre-metadata"))?.pack.project.students[0]?.name).toBe("旧工作区学生");
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

  it("migrates exactly once when two store instances race the legacy migration", async () => {
    const factory = new IDBFactory();
    await seedLegacyWorkspaceDatabase(factory);

    const first = createIndexedDbProjectStore(factory);
    const second = createIndexedDbProjectStore(factory);
    const [listedByFirst, listedBySecond] = await Promise.all([first.list(), second.list()]);

    expect(listedByFirst).toHaveLength(1);
    expect(listedBySecond).toHaveLength(1);
    expect(listedByFirst[0]!.id).toBe(listedBySecond[0]!.id);
    expect(await readWorkspaceKey(factory, "current")).toBeUndefined();
    expect(await readWorkspaceKey(factory, "legacy-migrated")).toBe(true);
  });

  it("drops a corrupted legacy workspace and never retries it", async () => {
    const factory = new IDBFactory();
    await seedLegacyWorkspaceDatabase(factory, { kind: "not-a-package" } as never);

    const store = createIndexedDbProjectStore(factory);
    expect(await store.list()).toEqual([]);
    expect(await readWorkspaceKey(factory, "current")).toBeUndefined();
    expect(await readWorkspaceKey(factory, "legacy-migrated")).toBe(true);

    const reopened = createIndexedDbProjectStore(factory);
    expect(await reopened.list()).toEqual([]);
  });
});

describe("project store shared-database version changes", () => {
  it("yields its connection so a higher-version open is never blocked", async () => {
    const factory = new IDBFactory();
    const store = createIndexedDbProjectStore(factory);
    await store.put(storedProject("proj-held"));

    // 连接 A 由 store 持有；B 请求 version+1，A 必须在 versionchange 中让路。
    const { db, blocked } = await openAtVersion(factory, 3);

    expect(blocked).toBe(0);
    expect(db.version).toBe(3);
    db.close();
  });

  it("reopens transparently after its connection was closed by a versionchange", async () => {
    const factory = new IDBFactory();
    const store = createIndexedDbProjectStore(factory);
    await store.put(storedProject("proj-before"));

    const { db } = await openAtVersion(factory, 3);
    db.close();

    // 缓存的连接已被 versionchange 关闭，读写必须自动重连而不是永久失败。
    expect((await store.list()).map((project) => project.id)).toEqual(["proj-before"]);
    await store.put(storedProject("proj-after"));
    expect((await store.list()).map((project) => project.id).sort()).toEqual(["proj-after", "proj-before"]);
  });

  it("keeps the workspace store usable after the shared database was upgraded underneath it", async () => {
    const factory = new IDBFactory();
    const workspaceStore = createIndexedDbWorkspaceStore(factory);
    await workspaceStore.set(workspacePack());

    const { db, blocked } = await openAtVersion(factory, 4);
    expect(blocked).toBe(0);
    db.close();

    const loaded = await workspaceStore.get();
    expect(loaded?.project.students[0]?.name).toBe("旧工作区学生");
  });
});
