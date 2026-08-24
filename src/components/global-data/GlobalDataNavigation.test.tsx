import { afterEach, describe, expect, it } from "vitest";
import { useState } from "react";
import { createRoot, type Root } from "react-dom/client";
import { flushSync } from "react-dom";
import { GlobalDataNavigation } from "./GlobalDataNavigation";
import type { GlobalDataView } from "../GlobalDataScreen";

const mounted: Array<{ root: Root; container: HTMLDivElement }> = [];

function press(element: Element | null, key: string): void {
  if (!element) throw new Error("tab missing");
  flushSync(() => element.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true })));
}

function click(element: Element | null): void {
  if (!element) throw new Error("tab missing");
  flushSync(() => element.dispatchEvent(new MouseEvent("click", { bubbles: true })));
}

function Harness({ initialView }: { initialView: GlobalDataView }) {
  const [view, setView] = useState<GlobalDataView>(initialView);
  return (
    <>
      <GlobalDataNavigation activeView={view} onChange={setView} />
      <section id={`global-data-${view}`} role="tabpanel" aria-label={view} />
    </>
  );
}

function renderNavigation(initialView: GlobalDataView = "overview") {
  const container = document.createElement("div");
  // 焦点断言依赖 document.activeElement，游离节点拿不到焦点。
  document.body.append(container);
  const root = createRoot(container);
  mounted.push({ root, container });
  flushSync(() => root.render(<Harness initialView={initialView} />));
  const tabs = Array.from(container.querySelectorAll<HTMLButtonElement>('[role="tab"]'));
  return { container, tabs };
}

function selectedLabel(container: HTMLElement): string | undefined {
  return container.querySelector('[role="tab"][aria-selected="true"]')?.getAttribute("aria-label") ?? undefined;
}

afterEach(() => {
  mounted.splice(0).forEach(({ root, container }) => {
    flushSync(() => root.unmount());
    container.remove();
  });
});

describe("GlobalDataNavigation", () => {
  it("moves selection and focus with the horizontal arrow keys, wrapping at both ends", () => {
    const { container, tabs } = renderNavigation();
    expect(tabs).toHaveLength(5);
    expect(selectedLabel(container)).toBe("数据总览");

    press(tabs[0]!, "ArrowRight");
    expect(selectedLabel(container)).toBe("名单管理");
    expect(document.activeElement).toBe(tabs[1]);

    press(tabs[1]!, "ArrowLeft");
    expect(selectedLabel(container)).toBe("数据总览");
    expect(document.activeElement).toBe(tabs[0]);

    press(tabs[0]!, "ArrowLeft");
    expect(selectedLabel(container)).toBe("数据呈现");
    expect(document.activeElement).toBe(tabs[4]);

    press(tabs[4]!, "ArrowRight");
    expect(selectedLabel(container)).toBe("数据总览");
    expect(document.activeElement).toBe(tabs[0]);
  });

  it("also walks the list with the vertical arrow keys for the stacked layout", () => {
    const { container, tabs } = renderNavigation();

    press(tabs[0]!, "ArrowDown");
    expect(selectedLabel(container)).toBe("名单管理");
    expect(document.activeElement).toBe(tabs[1]);

    press(tabs[1]!, "ArrowUp");
    expect(selectedLabel(container)).toBe("数据总览");
    expect(document.activeElement).toBe(tabs[0]);
  });

  it("jumps to the first and last tab with Home and End", () => {
    const { container, tabs } = renderNavigation("quality");

    press(tabs[2]!, "End");
    expect(selectedLabel(container)).toBe("数据呈现");
    expect(document.activeElement).toBe(tabs[4]);

    press(tabs[4]!, "Home");
    expect(selectedLabel(container)).toBe("数据总览");
    expect(document.activeElement).toBe(tabs[0]);
  });

  it("keeps a single tab stop that follows the selected tab", () => {
    const { tabs } = renderNavigation();
    expect(tabs.map((tab) => tab.tabIndex)).toEqual([0, -1, -1, -1, -1]);

    press(tabs[0]!, "End");
    expect(tabs.map((tab) => tab.tabIndex)).toEqual([-1, -1, -1, -1, 0]);

    click(tabs[1]!);
    expect(tabs.map((tab) => tab.tabIndex)).toEqual([-1, 0, -1, -1, -1]);
  });

  it("ignores unrelated keys so typing never hijacks the tablist", () => {
    const { container, tabs } = renderNavigation();

    press(tabs[0]!, "a");
    press(tabs[0]!, "PageDown");
    expect(selectedLabel(container)).toBe("数据总览");
  });

  it("keeps the active tab pointing at a panel that exists", () => {
    const { container, tabs } = renderNavigation();

    press(tabs[0]!, "ArrowRight");
    const active = container.querySelector('[role="tab"][aria-selected="true"]')!;
    const panel = document.getElementById(active.getAttribute("aria-controls")!);
    expect(panel?.getAttribute("role")).toBe("tabpanel");
  });
});
