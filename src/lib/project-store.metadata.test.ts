import { describe, expect, it } from "vitest";
import { IDBFactory } from "fake-indexeddb";
import { createIndexedDbProjectStore, createMemoryProjectStore } from "./project-store";
import { hookedFactory, storedProject } from "./project-store-test-fixtures";

function metadata(id: string, preview?: unknown) {
  return {
    id, name: id, createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z",
    exportedAt: "2026-01-01T00:00:00.000Z", studentCount: 0, assetCount: 0, fontCount: 0, customTemplateCount: 0,
    ...(preview === undefined ? {} : { preview }),
  };
}

function writeMetadata(factory: IDBFactory, value: ReturnType<typeof metadata>) {
  return new Promise<void>((resolve, reject) => {
    const request = factory.open("cengfan-map-studio");
    request.onsuccess = () => {
      const db = request.result;
      const transaction = db.transaction("project-metadata", "readwrite");
      transaction.objectStore("project-metadata").put(value, value.id);
      transaction.oncomplete = () => { db.close(); resolve(); };
      transaction.onabort = () => { db.close(); reject(transaction.error); };
    };
    request.onerror = () => reject(request.error);
  });
}

describe("lightweight project canvas metadata", () => {
  it.each(["memory", "indexeddb"] as const)("projects saved canvas dimensions and expression in the %s list", async (kind) => {
    const store = kind === "memory" ? createMemoryProjectStore() : createIndexedDbProjectStore(new IDBFactory());
    const project = storedProject("portrait");
    project.pack.project.canvas.width = 900;
    project.pack.project.canvas.height = 1600;
    project.pack.project.dataView = "city";
    await store.put(project);
    const [listed] = await store.list();
    expect(listed?.preview).toEqual({ canvasWidth: 900, canvasHeight: 1600, dataView: "city" });
    expect(listed?.pack.project).not.toHaveProperty("canvas");
    expect(listed?.pack).not.toHaveProperty("assets");
  });

  it("does not expose a shared mutable preview from the memory store", async () => {
    const store = createMemoryProjectStore();
    await store.put(storedProject("clone"));
    const [listed] = await store.list();
    listed!.preview!.canvasWidth = 1;
    expect((await store.list())[0]!.preview!.canvasWidth).toBe(1500);
  });

  it("keeps old sidecars without scanning packs or changing the database version", async () => {
    const factory = new IDBFactory();
    const store = createIndexedDbProjectStore(factory);
    await store.put(storedProject("old-sidecar"));
    await writeMetadata(factory, metadata("old-sidecar"));
    const versionBefore = (await factory.databases())[0]!.version;
    const packReads: string[] = [];
    const reopened = createIndexedDbProjectStore(hookedFactory(factory, (tx) => {
      const objectStore = tx.objectStore.bind(tx);
      tx.objectStore = ((name: string) => {
        const object = objectStore(name);
        if (name === "projects") {
          const get = object.get.bind(object);
          const getAll = object.getAll.bind(object);
          const openCursor = object.openCursor.bind(object);
          object.get = (...args) => { packReads.push("get"); return get(...args); };
          object.getAll = (...args) => { packReads.push("getAll"); return getAll(...args); };
          object.openCursor = (...args) => { packReads.push("openCursor"); return openCursor(...args); };
        }
        return object;
      }) as IDBTransaction["objectStore"];
    }));
    const [listed] = await reopened.list();
    expect(listed?.id).toBe("old-sidecar");
    expect(listed?.preview).toBeUndefined();
    expect(packReads).toEqual([]);
    expect((await factory.databases())[0]!.version).toBe(versionBefore);
    // The next ordinary save enriches the sidecar without a separate migration.
    await reopened.put(storedProject("old-sidecar"));
    expect((await reopened.list())[0]!.preview).toEqual({ canvasWidth: 1500, canvasHeight: 1000, dataView: "province" });
  });

  it.each([
    null, { canvasWidth: -1, canvasHeight: 1000, dataView: "province" },
    { canvasWidth: 1500, canvasHeight: Infinity, dataView: "province" },
    { canvasWidth: 1e100, canvasHeight: 1000, dataView: "province" },
    { canvasWidth: 1500, canvasHeight: 1000, dataView: "unknown" },
  ])("discards invalid optional canvas facts without hiding a project: %j", async (preview) => {
    const factory = new IDBFactory();
    const store = createIndexedDbProjectStore(factory);
    await store.put(storedProject("invalid-preview"));
    await writeMetadata(factory, metadata("invalid-preview", preview));
    const [listed] = await store.list();
    expect(listed?.id).toBe("invalid-preview");
    expect(listed?.preview).toBeUndefined();
    expect(await store.get("invalid-preview")).not.toBeNull();
  });

  it("ignores additional preview fields rather than retaining resource payloads", async () => {
    const factory = new IDBFactory();
    const store = createIndexedDbProjectStore(factory);
    await store.put(storedProject("extra-fields"));
    await writeMetadata(factory, metadata("extra-fields", {
      canvasWidth: 1500, canvasHeight: 1000, dataView: "province", source: "data:image/png;base64,large-payload",
    }));
    const [listed] = await store.list();
    expect(listed?.preview).toEqual({ canvasWidth: 1500, canvasHeight: 1000, dataView: "province" });
  });
});
