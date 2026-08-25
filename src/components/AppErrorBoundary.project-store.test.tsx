// 从 src/components/AppErrorBoundary.test.tsx 原样搬出：镜像取不到内容时回落到本机项目库——
// 逐个工程导出、降级库的“仅在内存里”措辞、工程中途消失与库读不出来的分别报错，
// 以及镜像还有数据时不去碰项目库。共享装置见 src/components/app-error-boundary-test-harness.tsx。
import { describe, expect, it, vi } from "vitest";
import type { SyncWorkspaceStore } from "../lib/browser-workspace-store";
import {
  parseProjectPackage,
  serializeProjectPackage,
  type ProjectPackage,
} from "../lib/project-package";
import {
  Boom,
  backupNote,
  clickExport,
  fakeProjectStore,
  installAppErrorBoundaryTestHarness,
  memorySyncStore,
  mountBoundary,
  packageAt,
  projectButtons,
  storedProject,
  structuredLogs,
  waitForNote,
} from "./app-error-boundary-test-harness";

installAppErrorBoundaryTestHarness();

describe("AppErrorBoundary project-store fallback", () => {
  it("exports every stored project when the workspace mirror is empty", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    const projects = [
      storedProject("proj-1", "一班去向", "2026-08-18T08:00:00.000Z"),
      storedProject("proj-2", "二班去向", "2026-08-19T08:00:00.000Z"),
    ];
    const projectStore = fakeProjectStore(projects);
    const packs: ProjectPackage[] = [];
    const filenames: Array<string | undefined> = [];
    const downloadPack = vi.fn((pack: ProjectPackage, filename?: string) => {
      packs.push(pack);
      filenames.push(filename);
    });

    const container = mountBoundary(<Boom />, { mirror: memorySyncStore(), projectStore, downloadPack });
    clickExport(container);

    const buttons = await projectButtons(container);
    expect(buttons).toHaveLength(2);
    expect(buttons.map((button) => button.textContent)).toEqual([
      expect.stringContaining("一班去向"),
      expect.stringContaining("二班去向"),
    ]);
    expect(structuredLogs(errorSpy)[0]).toMatchObject({ outcome: "mirror-empty" });
    expect(structuredLogs(infoSpy)[0]).toMatchObject({ outcome: "store-listed", projects: 2 });

    buttons[0]?.click();
    await vi.waitFor(() => expect(downloadPack).toHaveBeenCalledTimes(1));
    buttons[1]?.click();
    await vi.waitFor(() => expect(downloadPack).toHaveBeenCalledTimes(2));

    const restored = packs.map((pack) => parseProjectPackage(serializeProjectPackage(pack)));
    expect(restored.map((pack) => pack.project.students[0]?.name)).toEqual(["一班去向", "二班去向"]);
    expect(filenames).toEqual([
      "cengfan-recovery-一班去向-2026-08-18.json",
      "cengfan-recovery-二班去向-2026-08-19.json",
    ]);
    expect(await waitForNote(container, "已导出")).toContain("二班去向");
    expect(projectStore.put).not.toHaveBeenCalled();
    expect(projectStore.remove).not.toHaveBeenCalled();
  });

  it("still offers stored projects when the mirror is corrupt", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "info").mockImplementation(() => {});
    const projectStore = fakeProjectStore([storedProject("proj-1", "工作台工程", "2026-08-20T08:00:00.000Z")]);
    const downloadPack = vi.fn();

    const container = mountBoundary(<Boom />, {
      mirror: memorySyncStore("{损坏的镜像"),
      projectStore,
      downloadPack,
    });
    clickExport(container);

    const note = await waitForNote(container, "1 个工程");
    expect(note).toContain("损坏");
    expect(structuredLogs(errorSpy)[0]).toMatchObject({ outcome: "mirror-corrupt" });
    expect(await projectButtons(container)).toHaveLength(1);
  });

  it("blames the unopenable database instead of claiming the disk is empty when degraded", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const projectStore = fakeProjectStore([], "memory");

    const container = mountBoundary(<Boom />, { mirror: memorySyncStore(), projectStore });
    clickExport(container);

    const note = await waitForNote(container, "无法打开本机项目数据库");
    expect(note).toContain("没有找到");
    expect(note).toContain("降级");
    // 降级后读到的空列表来自内存，磁盘上有没有工程根本无从得知。
    expect(note).not.toMatch(/磁盘上没有|磁盘上不存在|没有可导出的工程内容/);
    expect(note).not.toContain("也没有已保存的工程");
    expect(structuredLogs(errorSpy)[1]).toMatchObject({
      outcome: "store-degraded",
      storeHealth: "memory",
      diskContentsKnown: false,
    });
    expect(container.querySelector("button[data-project-id]")).toBeNull();
  });

  it("lists memory-held projects with in-memory-only urgency instead of disk-implying copy", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    const projectStore = fakeProjectStore([
      storedProject("proj-1", "降级期一班", "2026-08-18T08:00:00.000Z"),
      storedProject("proj-2", "降级期二班", "2026-08-19T08:00:00.000Z"),
    ], "memory");
    const downloadPack = vi.fn();

    const container = mountBoundary(<Boom />, { mirror: memorySyncStore(), projectStore, downloadPack });
    clickExport(container);

    const buttons = await projectButtons(container);
    expect(buttons).toHaveLength(2);
    const note = await waitForNote(container, "仅存在于本次会话内存中，请立刻导出");
    expect(note).not.toMatch(/磁盘上没有|磁盘上不存在|没有持久副本/);
    expect(structuredLogs(errorSpy)[0]).toMatchObject({ outcome: "mirror-empty" });
    expect(structuredLogs(infoSpy).at(-1)).toMatchObject({
      outcome: "store-listed",
      storeHealth: "memory",
      projects: 2,
    });

    buttons[0]?.click();
    await vi.waitFor(() => expect(downloadPack).toHaveBeenCalledTimes(1));
    expect(await waitForNote(container, "已导出")).toContain("降级期一班");
    expect(projectStore.put).not.toHaveBeenCalled();
    expect(projectStore.remove).not.toHaveBeenCalled();
  });

  it("does not call a project deleted when the store degraded between listing and export", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "info").mockImplementation(() => {});
    const projectStore = fakeProjectStore([storedProject("proj-1", "半途降级", "2026-08-20T08:00:00.000Z")]);
    const downloadPack = vi.fn();

    const container = mountBoundary(<Boom />, { mirror: memorySyncStore(), projectStore, downloadPack });
    clickExport(container);

    const buttons = await projectButtons(container);
    // 列举之后数据库掉线：降级后的空内存副本让 get() 返回 null，这不是“已被删除”。
    projectStore.health = "memory";
    projectStore.get.mockResolvedValueOnce(null);
    buttons[0]?.click();

    const note = await waitForNote(container, "半途降级");
    expect(note).toContain("降级");
    expect(note).not.toContain("已经不在本机项目库里");
    expect(downloadPack).not.toHaveBeenCalled();
    expect(structuredLogs(errorSpy).at(-1)).toMatchObject({
      outcome: "project-missing",
      projectId: "proj-1",
      storeHealth: "memory",
      listedHealth: "persistent",
      degradedDuringRead: true,
    });
  });

  it("reports an empty project store separately from an empty mirror", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const projectStore = fakeProjectStore([]);

    const container = mountBoundary(<Boom />, { mirror: memorySyncStore(), projectStore });
    clickExport(container);

    expect(await waitForNote(container, "也没有已保存的工程")).toContain("没有找到");
    expect(structuredLogs(errorSpy)[1]).toMatchObject({ outcome: "store-empty", storeHealth: "persistent" });
  });

  it("reports a project store that cannot be listed", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const projectStore = fakeProjectStore([]);
    projectStore.list.mockRejectedValueOnce(new Error("无法打开本机项目数据库"));
    const mirror: SyncWorkspaceStore = {
      get: () => { throw new DOMException("SecurityError", "SecurityError"); },
      set: () => undefined,
    };

    const container = mountBoundary(<Boom />, { mirror, projectStore });
    clickExport(container);

    expect(await waitForNote(container, "无法打开本机项目数据库")).toContain("读取");
    expect(structuredLogs(errorSpy)[0]).toMatchObject({ outcome: "mirror-unreadable" });
    expect(structuredLogs(errorSpy)[1]).toMatchObject({ outcome: "store-unreadable" });
  });

  it("reports a project that vanished between listing and export", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "info").mockImplementation(() => {});
    const projectStore = fakeProjectStore([storedProject("proj-1", "已删除工程", "2026-08-20T08:00:00.000Z")]);
    const downloadPack = vi.fn();

    const container = mountBoundary(<Boom />, { mirror: memorySyncStore(), projectStore, downloadPack });
    clickExport(container);

    const buttons = await projectButtons(container);
    projectStore.get.mockResolvedValueOnce(null);
    buttons[0]?.click();

    expect(await waitForNote(container, "已经不在本机项目库里")).toContain("已删除工程");
    expect(downloadPack).not.toHaveBeenCalled();
    expect(structuredLogs(errorSpy).at(-1)).toMatchObject({
      outcome: "project-missing",
      projectId: "proj-1",
      storeHealth: "persistent",
      degradedDuringRead: false,
    });
  });

  it("reports a missing project-store channel instead of building a second store", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

    const container = mountBoundary(<Boom />, { mirror: memorySyncStore() });
    clickExport(container);

    expect(await waitForNote(container, "没有拿到本机项目库通道")).toContain("没有找到");
    expect(structuredLogs(errorSpy)[1]).toMatchObject({ outcome: "store-unavailable" });
    expect(container.querySelector("button[data-project-id]")).toBeNull();
  });

  it("leaves the project store untouched when the mirror still has data", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "info").mockImplementation(() => {});
    const projectStore = fakeProjectStore([storedProject("proj-1", "不该被读到", "2026-08-20T08:00:00.000Z")]);
    const downloadPack = vi.fn();
    const mirror = memorySyncStore(JSON.stringify(packageAt("镜像优先", "2026-08-22T08:00:00.000Z")));

    const container = mountBoundary(<Boom />, { mirror, projectStore, downloadPack });
    clickExport(container);

    expect(await backupNote(container)).toContain("已导出");
    expect(downloadPack).toHaveBeenCalledTimes(1);
    expect(downloadPack.mock.calls[0]?.[0]).toMatchObject({ kind: "cengfan-project-package" });
    expect(projectStore.list).not.toHaveBeenCalled();
    expect(container.querySelector("button[data-project-id]")).toBeNull();
  });
});
