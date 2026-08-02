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
    const secondSave = sync.overwrite(second);
    release();
    await Promise.all([firstSave, secondSave]);

    expect(saveLocal).toHaveBeenCalledTimes(2);
    expect(saveLocal).toHaveBeenLastCalledWith(second);
    expect(sync.getState()).toEqual({ status: "saved", savedAt: second.exportedAt });
  });

  it("reports a local overwrite failure", async () => {
    const sync = new LocalWorkspaceOverwrite({ saveLocal: async () => { throw new Error("quota"); } });

    await sync.overwrite(workspace("失败", "2026-07-27T13:00:00.000Z"));

    expect(sync.getState()).toEqual({ status: "failed", savedAt: null });
  });
});
