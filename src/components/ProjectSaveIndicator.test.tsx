import { createRoot, type Root } from "react-dom/client";
import { flushSync } from "react-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { LocalWorkspaceOverwriteState } from "../lib/incremental-workspace-sync";
import { ProjectSaveIndicator } from "./ProjectSaveIndicator";

const mounted: Array<{ root: Root; container: HTMLDivElement }> = [];

function render(state: LocalWorkspaceOverwriteState, onSave = vi.fn()) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  mounted.push({ root, container });
  flushSync(() => root.render(<ProjectSaveIndicator projectName="计算机一班毕业去向" syncState={state} onSave={onSave} />));
  return container;
}

afterEach(() => {
  mounted.splice(0).forEach(({ root, container }) => {
    flushSync(() => root.unmount());
    container.remove();
  });
});

describe("visible project save control", () => {
  it("identifies the current project and offers direct saving while changes are pending", () => {
    const onSave = vi.fn();
    const view = render({ status: "pending", savedAt: null }, onSave);
    expect(view.querySelector("strong")?.getAttribute("aria-label")).toBe("当前项目：计算机一班毕业去向");
    expect(view.querySelector('[role="status"]')?.textContent).toBe("有未保存修改");
    view.querySelector<HTMLButtonElement>('button[aria-label="保存当前项目"]')!.click();
    expect(onSave).toHaveBeenCalledOnce();
  });

  it("exposes a failed save as a retry and disables only the in-flight save", () => {
    const retry = render({ status: "failed", savedAt: "2026-10-01T09:00:00.000Z" });
    expect(retry.querySelector('[role="status"]')?.textContent).toBe("保存失败");
    expect(retry.querySelector('button[aria-label="重试保存当前项目"]')).not.toBeNull();
    const onSave = vi.fn();
    const saving = render({ status: "saving", savedAt: null }, onSave);
    saving.querySelector<HTMLButtonElement>("button")!.click();
    expect(saving.querySelector<HTMLButtonElement>("button")!.disabled).toBe(true);
    expect(onSave).not.toHaveBeenCalled();
  });

  it("shows the loaded save time, with the full timestamp available on hover", () => {
    const view = render({ status: "saved", savedAt: "2026-10-01T09:00:00.000Z" });
    const status = view.querySelector('[role="status"]')!;
    expect(status.textContent).toMatch(/^已保存 \d{2}:\d{2}$/);
    expect(status.getAttribute("title")).toContain("上次保存：");
    expect(status.getAttribute("aria-live")).toBe("polite");
    const invalid = render({ status: "saved", savedAt: "not-a-date" });
    expect(invalid.querySelector('[role="status"]')?.textContent).toBe("已保存");
  });
});
