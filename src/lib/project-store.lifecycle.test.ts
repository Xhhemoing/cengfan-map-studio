import { describe, expect, it } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import { createIndexedDbProjectStore } from "./project-store";
import { abortAfterPut, hookedFactory, storedProject, writeRaw } from "./project-store-test-fixtures";

describe("IndexedDB project store lifecycle", () => {
  it("lists only projected metadata while get returns the complete package", async () => {
    const real = new IDBFactory();
    let armed = false;
    const transactionStores: string[][] = [];
    const store = createIndexedDbProjectStore(hookedFactory(real, (tx) => {
      if (armed) transactionStores.push(Array.from(tx.objectStoreNames));
    }));
    const project = storedProject("proj-metadata", "元数据项目");
    project.pack.project.students.push({
      id: "student-1",
      name: "测试学生",
      university: "测试大学",
      city: "杭州市",
      visibility: true,
    });
    project.pack.assets.push({
      id: "asset-1",
      label: "测试素材",
      kind: "background",
      src: "data:image/png;base64,AAAA",
      provinceIds: [],
      source: "user",
    });
    await store.put(project);

    armed = true;
    const [listed] = await store.list();
    armed = false;

    expect(transactionStores).toEqual([["project-metadata"]]);
    expect(listed).toMatchObject({
      id: "proj-metadata",
      name: "元数据项目",
      studentCount: 1,
      assetCount: 1,
      fontCount: 0,
      customTemplateCount: 0,
    });
    expect(listed?.pack).not.toHaveProperty("assets");
    expect((await store.get("proj-metadata"))?.pack.assets[0]?.id).toBe("asset-1");
  });

  it("persists the package and its metadata in one write transaction", async () => {
    const real = new IDBFactory();
    let armed = false;
    let writeStores: string[] = [];
    const store = createIndexedDbProjectStore(hookedFactory(real, (tx) => {
      if (armed && tx.mode === "readwrite") writeStores = Array.from(tx.objectStoreNames);
    }));
    await store.list();

    armed = true;
    await store.put(storedProject("proj-atomic"));

    expect(writeStores.sort()).toEqual(["project-metadata", "projects"]);
    expect((await store.list()).map((project) => project.id)).toEqual(["proj-atomic"]);
    expect(await store.get("proj-atomic")).not.toBeNull();
  });

  it("rejects put when the write transaction aborts after the request succeeded", async () => {
    const real = new IDBFactory();
    let armed = false;
    const store = createIndexedDbProjectStore(hookedFactory(real, (tx) => {
      if (!armed || tx.mode !== "readwrite") return;
      armed = false;
      abortAfterPut(tx);
    }));
    // 先建立连接，避免 hook 命中打开阶段的事务。
    await store.list();

    armed = true;
    await expect(store.put(storedProject("proj-aborted"))).rejects.toThrow("IndexedDB 写入中止");
    expect(await store.list()).toEqual([]);
  });

  it("rejects remove when the delete transaction aborts", async () => {
    const real = new IDBFactory();
    let armed = false;
    const store = createIndexedDbProjectStore(hookedFactory(real, (tx) => {
      if (!armed || tx.mode !== "readwrite") return;
      armed = false;
      queueMicrotask(() => tx.abort());
    }));
    await store.put(storedProject("proj-keep"));

    armed = true;
    await expect(store.remove("proj-keep")).rejects.toThrow(/IndexedDB 删除(失败|中止)/);
    expect((await store.list()).map((project) => project.id)).toEqual(["proj-keep"]);
  });

  it("rejects a put whose connection drops mid-transaction and recovers on the next put", async () => {
    const real = new IDBFactory();
    let armed = false;
    const store = createIndexedDbProjectStore(hookedFactory(real, (tx, db) => {
      if (!armed || tx.mode !== "readwrite") return;
      armed = false;
      queueMicrotask(() => {
        tx.abort();
        db.close();
      });
    }));
    await store.list();

    armed = true;
    await expect(store.put(storedProject("proj-dropped"))).rejects.toThrow(/IndexedDB 写入(失败|中止)/);

    // 缓存的连接已关闭，但不能永久毒化：下一次写入必须自动重连成功。
    await store.put(storedProject("proj-recovered", "恢复后的项目"));
    expect((await store.list()).map((project) => project.id)).toEqual(["proj-recovered"]);
    expect((await store.get("proj-recovered"))?.name).toBe("恢复后的项目");
  });

  it("keeps listing healthy projects when one stored record is corrupted", async () => {
    const factory = new IDBFactory();
    const store = createIndexedDbProjectStore(factory);
    await store.put(storedProject("proj-good", "完好项目"));
    await writeRaw(factory, { id: "proj-corrupt", name: "损坏项目", pack: { kind: "not-a-package" } }, "proj-corrupt");
    await writeRaw(factory, "彻底不是记录", "proj-garbage");

    const listed = await store.list();

    expect(listed.map((project) => project.id)).toEqual(["proj-good"]);
    expect(await store.get("proj-corrupt")).toBeNull();
  });

  it("resolves when removing an id that does not exist", async () => {
    const store = createIndexedDbProjectStore(new IDBFactory());
    await expect(store.remove("missing-project")).resolves.toBeUndefined();
  });
});
