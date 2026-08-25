// 崩溃屏的基础渲染契约：子树抛错时换上恢复界面，不抛错时原样透传。
// 共享挂载装置见 src/components/app-error-boundary-test-harness.tsx，
// 导出备份、项目库回落与返回列表分别在 AppErrorBoundary.export/project-store/
// return-navigation.test.tsx。
import { describe, expect, it, vi } from "vitest";
import {
  Boom,
  installAppErrorBoundaryTestHarness,
  mountBoundary,
} from "./app-error-boundary-test-harness";

installAppErrorBoundaryTestHarness();

describe("AppErrorBoundary", () => {
  it("renders a recovery screen instead of a blank page when a child throws", () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const container = mountBoundary(<Boom />);

    expect(container.textContent).toContain("界面加载出错");
    expect(container.querySelector('button[aria-label="重新加载界面"]')).not.toBeNull();
    expect(container.querySelector('button[aria-label="返回项目列表"]')).not.toBeNull();
    consoleSpy.mockRestore();
  });

  it("renders children normally when nothing throws", () => {
    const container = mountBoundary(<p>正常内容</p>);
    expect(container.textContent).toContain("正常内容");
    expect(container.querySelector(".workbench-error")).toBeNull();
  });
});
