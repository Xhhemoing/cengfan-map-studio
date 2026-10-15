import { describe, expect, it, vi } from "vitest";
import { createProjectDocument } from "./project-document";
import { createProjectPackage, type ProjectPackage } from "./project-package";
import { LocalWorkspaceOverwrite } from "./incremental-workspace-sync";

function workspace(name: string, exportedAt: string): ProjectPackage {
  return createProjectPackage({
    project: createProjectDocument({
      students: [{ id: "student-1", name, university: "测试大学", city: "杭州市", visibility: true }],
      templateId: "original",
      dataView: "province",
    }),
    assets: [],
    fonts: [],
    renderSettings: { mode: "normal", fixedFps: 20 },
    now: new Date(exportedAt),
  });
}

describe("local workspace overwrite", () => {
  it("restores a hydrated save time without writing and preserves it after subsequent edits", () => {
    const saveLocal = vi.fn(async () => undefined);
    const onStateChange = vi.fn();
    const sync = new LocalWorkspaceOverwrite({ saveLocal, onStateChange });

    sync.restoreSaved("2026-10-01T09:00:00.000Z");
    expect(sync.getState()).toEqual({ status: "saved", savedAt: "2026-10-01T09:00:00.000Z" });
    expect(onStateChange).toHaveBeenLastCalledWith(sync.getState());
    expect(saveLocal).not.toHaveBeenCalled();
    sync.markPending();
    expect(sync.getState()).toEqual({ status: "pending", savedAt: "2026-10-01T09:00:00.000Z" });
  });

  it("overwrites the complete local workspace without sending it to a server", async () => {
    const saveLocal = vi.fn(async () => undefined);
    const sync = new LocalWorkspaceOverwrite({ saveLocal });
    const first = workspace("第一版", "2026-07-27T10:00:00.000Z");

    await sync.overwrite(first);

    expect(saveLocal).toHaveBeenCalledOnce();
    expect(saveLocal).toHaveBeenCalledWith(first);
    expect(sync.getState()).toEqual({ status: "saved", savedAt: first.exportedAt });
  });

  it("coalesces overlapping requests and finishes by saving the newest complete workspace", async () => {
    let release!: () => void;
    const firstRequest = new Promise<void>((resolve) => { release = resolve; });
    const saveLocal = vi.fn()
      .mockImplementationOnce(async () => firstRequest)
      .mockResolvedValue(undefined);
    const sync = new LocalWorkspaceOverwrite({ saveLocal });
    const first = workspace("发送中", "2026-07-27T12:00:00.000Z");
    const second = workspace("后续修改", "2026-07-27T12:00:01.000Z");

    const firstSave = sync.overwrite(first);
    sync.markPending();
    const secondSave = sync.overwrite(second);
    release();
    await Promise.all([firstSave, secondSave]);

    expect(saveLocal).toHaveBeenCalledTimes(2);
    expect(saveLocal).toHaveBeenLastCalledWith(second);
    expect(sync.getState()).toEqual({ status: "saved", savedAt: second.exportedAt });
  });

  it("keeps edits made during an in-flight save pending until their own snapshot is saved", async () => {
    let release!: () => void;
    const saveLocal = vi.fn().mockImplementationOnce(() => new Promise<void>((resolve) => { release = resolve; })).mockResolvedValue(undefined);
    const sync = new LocalWorkspaceOverwrite({ saveLocal });
    const first = workspace("点击时版本", "2026-10-01T09:00:00.000Z");
    const pending = sync.overwrite(first);
    sync.markPending();
    release();
    await pending;

    expect(sync.getState()).toEqual({ status: "pending", savedAt: first.exportedAt });
    const latest = workspace("保存期间修改", "2026-10-01T09:00:01.000Z");
    await sync.overwrite(latest);
    expect(sync.getState()).toEqual({ status: "saved", savedAt: latest.exportedAt });
  });

  it("does not let hydration announce a newer workspace as saved while an older write is pending", async () => {
    let release!: () => void;
    const saveLocal = vi.fn().mockImplementationOnce(() => new Promise<void>((resolve) => { release = resolve; })).mockResolvedValue(undefined);
    const sync = new LocalWorkspaceOverwrite({ saveLocal });
    const older = workspace("正在写的快照", "2026-10-01T09:00:00.000Z");
    const pending = sync.overwrite(older);
    sync.restoreSaved("2026-10-01T08:00:00.000Z");
    expect(sync.getState()).toEqual({ status: "saving", savedAt: null });
    release();
    await pending;
    expect(sync.getState()).toEqual({ status: "pending", savedAt: older.exportedAt });

    const adopted = workspace("水合读回的版本", "2026-10-01T09:00:01.000Z");
    await sync.overwrite(adopted);
    expect(sync.getState()).toEqual({ status: "saved", savedAt: adopted.exportedAt });
  });

  it("reports a local overwrite failure", async () => {
    const sync = new LocalWorkspaceOverwrite({ saveLocal: async () => { throw new Error("quota"); } });

    await sync.overwrite(workspace("失败", "2026-07-27T13:00:00.000Z"));

    expect(sync.getState()).toEqual({ status: "failed", savedAt: null });
  });
});
