// 从 src/components/AppErrorBoundary.test.tsx 原样搬出：崩溃屏的工作区镜像导出——
// 成功下载后的往返解析、镜像为空/损坏/读不出来的分别报错，以及下载被拦截时崩溃屏不塌。
// 共享挂载/桩装置见 src/components/app-error-boundary-test-harness.tsx。
import { describe, expect, it, vi } from "vitest";
import type { SyncWorkspaceStore } from "../lib/browser-workspace-store";
import { parseProjectPackage } from "../lib/project-package";
import {
  Boom,
  backupNote,
  clickExport,
  installAppErrorBoundaryTestHarness,
  memorySyncStore,
  mountBoundary,
  packageAt,
  structuredLogs,
  stubAnchor,
  stubObjectUrls,
} from "./app-error-boundary-test-harness";

installAppErrorBoundaryTestHarness();

describe("AppErrorBoundary disaster-recovery export", () => {
  it("downloads a package that round-trips through parseProjectPackage", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
    const pack = packageAt("灾难恢复", "2026-08-20T08:00:00.000Z");
    const mirror = memorySyncStore(JSON.stringify(pack));
    const urls = stubObjectUrls();
    const anchor = stubAnchor();

    const container = mountBoundary(<Boom />, { mirror });
    clickExport(container);

    expect(anchor.click).toHaveBeenCalledTimes(1);
    expect(anchor.link.download).toContain("2026-08-20");
    expect(urls.created).toHaveLength(1);
    const restored = parseProjectPackage(await urls.created[0]!.text());
    expect(restored.project.students[0]?.name).toBe("灾难恢复");
    expect(restored.exportedAt).toBe(pack.exportedAt);
    expect(await backupNote(container)).toContain("已导出");
    expect(structuredLogs(infoSpy)[0]).toMatchObject({ outcome: "exported" });
  });

  it("keeps the existing recovery actions next to the export action", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const container = mountBoundary(<Boom />, { mirror: memorySyncStore() });

    expect(container.querySelector('button[aria-label="重新加载界面"]')).not.toBeNull();
    expect(container.querySelector('button[aria-label="返回项目列表"]')).not.toBeNull();
    expect(container.querySelector('button[aria-label="导出工程备份"]')).not.toBeNull();
  });

  it("reports an empty mirror instead of downloading an empty file", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const urls = stubObjectUrls();
    const container = mountBoundary(<Boom />, { mirror: memorySyncStore() });

    clickExport(container);

    expect(urls.created).toHaveLength(0);
    expect(await backupNote(container)).toContain("没有找到");
    expect(structuredLogs(errorSpy)[0]).toMatchObject({ outcome: "mirror-empty" });
  });

  it("reports a corrupt mirror with bug-report detail", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const urls = stubObjectUrls();
    const container = mountBoundary(<Boom />, { mirror: memorySyncStore("{损坏的镜像") });

    clickExport(container);

    expect(urls.created).toHaveLength(0);
    expect(await backupNote(container)).toContain("损坏");
    const detail = structuredLogs(errorSpy)[0];
    expect(detail).toMatchObject({ outcome: "mirror-corrupt", mirrorBytes: "{损坏的镜像".length });
    expect(detail?.crash).toMatchObject({ message: "boom" });
  });

  it("reports a mirror that cannot be read at all", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const mirror: SyncWorkspaceStore = {
      get: () => { throw new DOMException("SecurityError", "SecurityError"); },
      set: () => undefined,
    };
    const container = mountBoundary(<Boom />, { mirror });

    clickExport(container);

    expect(await backupNote(container)).toContain("读取");
    expect(structuredLogs(errorSpy)[0]).toMatchObject({ outcome: "mirror-unreadable" });
  });

  it("reports a blocked download without losing the recovery screen", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const mirror = memorySyncStore(JSON.stringify(packageAt("下载受阻", "2026-08-21T08:00:00.000Z")));
    const downloadPack = vi.fn(() => { throw new Error("下载被拦截"); });

    const container = mountBoundary(<Boom />, { mirror, downloadPack });
    clickExport(container);

    expect(downloadPack).toHaveBeenCalledTimes(1);
    expect(await backupNote(container)).toContain("下载被拦截");
    expect(container.textContent).toContain("界面加载出错");
    expect(structuredLogs(errorSpy)[0]).toMatchObject({ outcome: "download-failed" });
  });
});
