import { describe, expect, it, vi } from "vitest";
import { createProjectDocument } from "./project-document";
import { createProjectPackage, type ProjectPackage } from "./project-package";
import {
  loadBrowserWorkspaceMirror,
  loadLatestBrowserWorkspace,
  saveBrowserWorkspaceSnapshot,
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

function memoryAsyncStore(initial: ProjectPackage | null = null): AsyncWorkspaceStore {
  let value = initial;
  return {
    get: vi.fn(async () => value),
    set: vi.fn(async (next) => { value = structuredClone(next); }),
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
