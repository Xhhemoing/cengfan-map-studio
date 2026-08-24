import { describe, expect, it } from "vitest";
import type { ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { flushSync } from "react-dom";
import { StatusBar } from "./StatusBar";

function renderStatusBar(element: ReactElement): { container: HTMLDivElement; root: Root } {
  const container = document.createElement("div");
  const root = createRoot(container);
  flushSync(() => root.render(element));
  return { container, root };
}

describe("StatusBar", () => {
  it("exposes a polite live region so later messages are announced", () => {
    const { container, root } = renderStatusBar(<StatusBar message="已刷新展示框位置" />);

    const region = container.querySelector('[role="status"]');
    expect(region).not.toBeNull();
    expect(region?.getAttribute("aria-live")).toBe("polite");
    expect(region?.textContent).toContain("已刷新展示框位置");

    // The same node must survive an update; a remounted region is never announced.
    flushSync(() => root.render(<StatusBar message="已保存模板：默认" />));
    expect(container.querySelector('[role="status"]')).toBe(region);
    expect(region?.textContent).toContain("已保存模板：默认");
    root.unmount();
  });

  it("keeps the live region mounted but visually empty without content", () => {
    const { container, root } = renderStatusBar(<StatusBar message="" />);

    const region = container.querySelector('[role="status"]');
    expect(region).not.toBeNull();
    expect(region?.getAttribute("data-empty")).toBe("true");
    expect(region?.textContent).toBe("");
    root.unmount();
  });

  it("reports the local overwrite state with its saved time", () => {
    const { container, root } = renderStatusBar(
      <StatusBar message="强制保存完成" syncStatus="saved" savedAt="2026-08-24T02:30:45.000Z" />,
    );

    const sync = container.querySelector(".studio-status-bar__sync");
    expect(sync?.getAttribute("data-sync-status")).toBe("saved");
    expect(sync?.textContent).toContain("全部数据已保存");
    expect(sync?.textContent).toContain(new Date("2026-08-24T02:30:45.000Z").toLocaleTimeString("zh-CN", { hour12: false }));
    expect(container.textContent).toContain("强制保存完成");
    root.unmount();
  });

  it("names every overwrite state and ignores an unusable saved time", () => {
    const { container, root } = renderStatusBar(<StatusBar message="" syncStatus="failed" savedAt="not-a-date" />);
    expect(container.textContent).toBe("本地保存失败");

    flushSync(() => root.render(<StatusBar message="" syncStatus="saving" />));
    expect(container.textContent).toBe("正在覆盖本地数据");

    flushSync(() => root.render(<StatusBar message="" syncStatus="pending" />));
    expect(container.textContent).toBe("有未保存修改");

    flushSync(() => root.render(<StatusBar message="" syncStatus="idle" />));
    expect(container.textContent).toBe("有未保存修改");
    expect(container.querySelector('[role="status"]')?.getAttribute("data-empty")).toBeNull();
    root.unmount();
  });
});
