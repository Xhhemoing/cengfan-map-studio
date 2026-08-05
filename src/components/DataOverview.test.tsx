import { flushSync } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DataOverview } from "./DataOverview";
import type { DataHealthSummary } from "../lib/data-health";

const roots: Array<{ root: Root; container: HTMLDivElement }> = [];

afterEach(() => {
  roots.splice(0).forEach(({ root, container }) => {
    flushSync(() => root.unmount());
    container.remove();
  });
});

function render(summary: DataHealthSummary): HTMLDivElement {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  roots.push({ root, container });
  flushSync(() => root.render(<DataOverview summary={summary} dataViewLabel="省份卡片" onOpenIssues={vi.fn()} />));
  return container;
}

describe("DataOverview", () => {
  it("renders all health metrics and exposes unresolved records as an action", () => {
    const onOpenIssues = vi.fn();
    const summary: DataHealthSummary = {
      total: 12,
      visible: 10,
      hidden: 2,
      international: 1,
      unresolved: 3,
      missingRequired: 1,
      duplicate: 0,
    };
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    roots.push({ root, container });
    flushSync(() => root.render(<DataOverview summary={summary} dataViewLabel="省份卡片" onOpenIssues={onOpenIssues} />));

    expect(container.textContent).toContain("12");
    expect(container.textContent).toContain("10");
    expect(container.textContent).toContain("未匹配城市");
    const unresolved = container.querySelector<HTMLButtonElement>('button[aria-label="查看未匹配城市"]')!;
    flushSync(() => unresolved.click());
    expect(onOpenIssues).toHaveBeenCalledWith("unresolved-location");
  });

  it("shows the active presentation mode", () => {
    const container = render({ total: 2, visible: 2, hidden: 0, international: 0, unresolved: 0, missingRequired: 0, duplicate: 0 });
    expect(container.textContent).toContain("当前呈现");
    expect(container.textContent).toContain("省份卡片");
  });
});
