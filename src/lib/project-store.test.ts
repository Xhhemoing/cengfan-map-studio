import { describe, expect, it } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import {
  createIndexedDbProjectStore,
  createMemoryProjectStore,
  createSampleProject,
  createEmptyProject,
  duplicateStoredProject,
  isCorruptedProject,
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

  it("count() 数的是库里的记录条数", async () => {
    const store = createMemoryProjectStore();
    expect(await store.count()).toBe(0);
    const sample = createSampleProject();
    await store.put(sample);
    expect(await store.count()).toBe(1);
    await store.remove(sample.id);
    expect(await store.count()).toBe(0);
  });

  it("throws when the IndexedDB factory is unavailable", async () => {
    const store = createIndexedDbProjectStore(null as unknown as IDBFactory);
    await expect(store.put(createSampleProject())).rejects.toThrow("当前浏览器不支持 IndexedDB");
    await expect(store.remove("any-id")).rejects.toThrow("当前浏览器不支持 IndexedDB");
    expect(await store.list()).toEqual([]);
    expect(await store.count()).toBe(0);
    expect(await store.get("any-id")).toBeNull();
  });
});

/** 直接往库里塞一条原始值，模拟旧版本写坏、或人为改过的记录。 */
async function putRawProjectRecord(factory: IDBFactory, key: string, value: unknown): Promise<void> {
  const db = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = factory.open("cengfan-map-studio");
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains("projects")) request.result.createObjectStore("projects");
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction("projects", "readwrite");
    tx.objectStore("projects").put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  db.close();
}

describe("解析失败的记录", () => {
  const brokenRecord = {
    id: "proj-broken",
    name: "去年名单",
    createdAt: "2026-03-01T00:00:00.000Z",
    updatedAt: "2026-03-02T00:00:00.000Z",
    pack: { kind: "不认识的格式", project: { students: [] } },
  };

  it("list() 把解析失败的记录降级保留，而不是悄悄滤掉", async () => {
    const factory = new IDBFactory();
    await putRawProjectRecord(factory, "proj-ok", projectAt("proj-ok", "正常项目", "2026-01-01T00:00:00.000Z"));
    await putRawProjectRecord(factory, "proj-broken", brokenRecord);
    const store = createIndexedDbProjectStore(factory);

    const listed = await store.list();

    expect(listed.map((project) => project.id)).toEqual(["proj-broken", "proj-ok"]);
    const broken = listed[0]!;
    expect(isCorruptedProject(broken)).toBe(true);
    // 名字与时间沿用原记录，用户才认得出坏掉的是哪一份。
    expect(broken.name).toBe("去年名单（无法读取）");
    expect(broken.updatedAt).toBe("2026-03-02T00:00:00.000Z");
    expect(broken.corrupted?.raw).toEqual(brokenRecord);
    expect(broken.corrupted?.reason).toBe("不是蹭饭图工程包");
    expect(isCorruptedProject(listed[1]!)).toBe(false);
  });

  it("完全不是对象的记录也保留成降级条目，身份用库里的键", async () => {
    const factory = new IDBFactory();
    await putRawProjectRecord(factory, "proj-garbage", "这不是一条项目记录");
    const store = createIndexedDbProjectStore(factory);

    const [entry] = await store.list();

    expect(entry!.id).toBe("proj-garbage");
    expect(entry!.name).toBe("未命名项目（无法读取）");
    expect(entry!.corrupted?.raw).toBe("这不是一条项目记录");
    expect(entry!.corrupted?.reason).toBe("记录不是对象");
    // 占位工程只为让卡片能渲染，本身不带任何内容。
    expect(entry!.pack.project.students).toEqual([]);
  });

  it("count() 把解析失败的记录算进去，空库判断不会被损坏数据骗过", async () => {
    const factory = new IDBFactory();
    await putRawProjectRecord(factory, "proj-broken", brokenRecord);
    await putRawProjectRecord(factory, "proj-garbage", 42);
    const store = createIndexedDbProjectStore(factory);

    expect(await store.count()).toBe(2);
    expect(await store.list()).toHaveLength(2);
  });

  it("拒绝把降级条目写回，原始值不被占位工程覆盖", async () => {
    const factory = new IDBFactory();
    await putRawProjectRecord(factory, "proj-broken", brokenRecord);
    const store = createIndexedDbProjectStore(factory);
    const [broken] = await store.list();

    await expect(store.put({ ...broken!, name: "顺手改个名字" })).rejects.toThrow("不能覆盖写回");

    expect((await store.list())[0]!.corrupted?.raw).toEqual(brokenRecord);
  });

  it("降级条目可以按库里的键删掉", async () => {
    const factory = new IDBFactory();
    await putRawProjectRecord(factory, "proj-broken", brokenRecord);
    const store = createIndexedDbProjectStore(factory);
    const [broken] = await store.list();

    await store.remove(broken!.id);

    expect(await store.count()).toBe(0);
    expect(await store.list()).toEqual([]);
  });

  it("get() 对损坏记录仍返回 null，编辑器不会拿占位工程覆盖它", async () => {
    const factory = new IDBFactory();
    await putRawProjectRecord(factory, "proj-broken", brokenRecord);
    const store = createIndexedDbProjectStore(factory);

    expect(await store.get("proj-broken")).toBeNull();
  });

  it("内存 store 同样拒绝写入降级条目", async () => {
    const store = createMemoryProjectStore();
    const entry: StoredProject = { ...createEmptyProject(), corrupted: { raw: { 坏: true }, reason: "不是蹭饭图工程包" } };

    await expect(store.put(entry)).rejects.toThrow("不能覆盖写回");
    expect(await store.count()).toBe(0);
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
