// 从 src/App.test.tsx 原样搬出：降级存储下的缺失工程叙事，以及抽到 src/lib 的编排/动作/生命周期接缝。
// 共享挂载/交互装置见 src/app-test-harness.tsx。
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { describe, expect, it, vi } from "vitest";
import { App } from "./App";
import { editorProjectStore } from "./lib/editor-project-store";
import { WORKSPACE_SESSION_STORAGE_KEY } from "./lib/workspace-session";
import { installAppTestHarness, roots, renderLegacyApp, click, workflowStage } from "./app-test-harness";

installAppTestHarness();

describe("Missing project honesty under a degraded store (R6-5)", () => {
  function mountProject(projectId: string): HTMLDivElement {
    window.localStorage.clear();
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    roots.push({ root, container });
    flushSync(() => root.render(<App projectId={projectId} />));
    return container;
  }

  it("does not claim an unknown project was deleted while the store is degraded", async () => {
    // jsdom 没有 IndexedDB，共享 store 恒处于内存降级模式：get() 只能返回空的内存副本。
    expect(editorProjectStore.health).toBe("memory");
    const originalHash = window.location.hash;
    const container = mountProject("no-such-project");

    const alert = await vi.waitFor(() => {
      const node = container.querySelector('[role="alert"]');
      expect(node).not.toBeNull();
      return node!;
    });

    expect(alert.getAttribute("data-missing-project")).toBe("unconfirmed");
    expect(alert.getAttribute("data-store-health")).toBe("memory");
    expect(alert.textContent).not.toContain("项目不存在或已删除");
    expect(alert.textContent).toContain("本机数据库已降级");
    expect(alert.textContent).toContain("无法确认这个工程是否还在磁盘上");

    click(container.querySelector('button[aria-label="返回项目列表"]')!);
    expect(window.location.hash).toBe("#/");
    window.location.hash = originalHash;
  });
});

describe("Editor orchestration seams extracted into src/lib (R7-9)", () => {
  function renderLegacyStage(stage: string): HTMLDivElement {
    window.localStorage.clear();
    window.localStorage.setItem(WORKSPACE_SESSION_STORAGE_KEY, JSON.stringify({
      stage,
      savedAt: "2026-08-24T00:00:00.000Z",
    }));
    return renderLegacyApp({ clearStorage: false });
  }

  function pressKey(target: EventTarget, init: KeyboardEventInit): KeyboardEvent {
    const event = new KeyboardEvent("keydown", { bubbles: true, cancelable: true, ...init });
    flushSync(() => target.dispatchEvent(event));
    return event;
  }

  it("names the pending step on the topbar history buttons", () => {
    const container = renderLegacyStage("content");
    expect(container.querySelector('button[aria-label="暂无可撤销操作"]')).not.toBeNull();

    click([...container.querySelectorAll<HTMLButtonElement>(".content-add-actions button")]
      .find((button) => button.textContent?.includes("添加文本框"))!);

    expect(container.querySelector('button[aria-label="撤销：添加文本框"]')).not.toBeNull();
    expect(container.querySelector('button[aria-label="暂无可重做操作"]')).not.toBeNull();
  });

  it("drives undo and redo from the keyboard on the live canvas", () => {
    const container = renderLegacyStage("content");
    const countTexts = () => container.querySelectorAll("svg.poster [data-text-id]").length;
    const before = countTexts();

    click([...container.querySelectorAll<HTMLButtonElement>(".content-add-actions button")]
      .find((button) => button.textContent?.includes("添加文本框"))!);
    expect(countTexts()).toBe(before + 1);

    const undo = pressKey(window, { key: "z", ctrlKey: true });
    expect(undo.defaultPrevented).toBe(true);
    expect(countTexts()).toBe(before);

    pressKey(window, { key: "y", metaKey: true });
    expect(countTexts()).toBe(before + 1);
  });

  it("leaves the browser's own undo to a focused text field", () => {
    const container = renderLegacyStage("content");
    click([...container.querySelectorAll<HTMLButtonElement>(".content-add-actions button")]
      .find((button) => button.textContent?.includes("添加文本框"))!);
    const after = container.querySelectorAll("svg.poster [data-text-id]").length;

    const field = document.createElement("input");
    container.append(field);
    const event = pressKey(field, { key: "z", ctrlKey: true });

    expect(event.defaultPrevented).toBe(false);
    expect(container.querySelectorAll("svg.poster [data-text-id]").length).toBe(after);
    field.remove();
  });

  it("applies a built-in template as one undoable step", () => {
    const container = renderLegacyStage("frame");
    const cards = [...container.querySelectorAll<HTMLButtonElement>(".template-grid .template-card")];
    const target = cards.find((card) => !card.classList.contains("selected"))!;
    const name = target.querySelector("strong")?.textContent ?? "";

    click(target);

    expect(container.querySelector(`button[aria-label="撤销：应用内置模板：${name}"]`)).not.toBeNull();
    expect([...container.querySelectorAll(".template-grid .template-card.selected")]
      .map((card) => card.querySelector("strong")?.textContent)).toEqual([name]);

    pressKey(window, { key: "z", ctrlKey: true });

    expect([...container.querySelectorAll(".template-grid .template-card.selected")]
      .map((card) => card.querySelector("strong")?.textContent)).not.toEqual([name]);
  });
});

describe("Editor action seams extracted into src/lib (R8-7)", () => {
  function renderLegacyStage(stage: string): HTMLDivElement {
    window.localStorage.clear();
    window.localStorage.setItem(WORKSPACE_SESSION_STORAGE_KEY, JSON.stringify({
      stage,
      savedAt: "2026-08-24T00:00:00.000Z",
    }));
    return renderLegacyApp({ clearStorage: false });
  }

  it("adds a note from the content panel under its own history label", () => {
    const container = renderLegacyStage("content");

    click([...container.querySelectorAll<HTMLButtonElement>(".content-add-actions button")]
      .find((button) => button.textContent?.includes("添加特别备注"))!);

    expect(container.querySelector('button[aria-label="撤销：添加特别备注"]')).not.toBeNull();
  });

  it("keeps the layer list driving the canvas selection", () => {
    const container = renderLegacyStage("content");
    const layers = [...container.querySelectorAll<HTMLButtonElement>('.element-list button[role="listitem"]')];
    const mapLayer = layers.find((button) => button.textContent?.includes("地图"))!;

    expect(mapLayer.getAttribute("aria-pressed")).toBe("false");
    click(mapLayer);

    expect(mapLayer.getAttribute("aria-pressed")).toBe("true");
  });

  it("keeps the topbar stage stepper opening the data workspace", () => {
    const container = renderLegacyStage("content");

    click(workflowStage(container, "数据与素材"));

    expect(container.querySelector(".data-upload-workspace")).not.toBeNull();
  });
});

describe("Lifecycle seams extracted into src/lib (R9-5)", () => {
  function renderLegacyStage(stage: string): HTMLDivElement {
    window.localStorage.clear();
    window.localStorage.setItem(WORKSPACE_SESSION_STORAGE_KEY, JSON.stringify({
      stage,
      savedAt: "2026-08-24T00:00:00.000Z",
    }));
    return renderLegacyApp({ clearStorage: false });
  }

  function findButton(container: HTMLElement, text: string): HTMLButtonElement {
    return [...container.querySelectorAll<HTMLButtonElement>("button")]
      .find((button) => button.textContent?.includes(text))!;
  }

  it("captures a custom template and names it back to the user", () => {
    vi.spyOn(window, "prompt").mockReturnValue("我的春日版式");
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const container = renderLegacyStage("frame");

    click(findButton(container, "保存当前整体模板"));

    expect(container.textContent).toContain("已保存模板：我的春日版式");
    expect(container.querySelector(".view-list")?.textContent).toContain("我的春日版式");
  });

  it("keeps the new-project reset behind its confirmation", () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    const container = renderLegacyStage("roster");
    const before = container.querySelectorAll("[data-student-row]").length;

    click(container.querySelector<HTMLButtonElement>('button[aria-label="新建项目"]')!);

    expect(confirmSpy).toHaveBeenCalled();
    expect(container.querySelectorAll("[data-student-row]").length).toBe(before);
    expect(container.textContent).not.toContain("已新建空项目");
  });

  it("reports the force-save outcome after the local overwrite lands", async () => {
    const container = renderLegacyStage("deliver");

    click(findButton(container, "保存到本机"));

    await vi.waitFor(() => {
      expect(container.textContent).toContain("强制保存完成：全部数据已覆盖到浏览器本地");
    });
    expect(window.localStorage.getItem("cengfan-map-studio:workspace-mirror")).toContain("renderSettings");
  });
});
