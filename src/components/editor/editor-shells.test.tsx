// R10-5 拆出的两个整屏外壳组件的直接契约：DOM 结构、role 与文案。
// App 分片 pin(src/App.shell-layout.test.tsx / src/App.project-persistence.test.tsx)
// 从 App 那一侧盯同一份 DOM；这里从组件这一侧盯，拆分后两侧应当同时为真。
import { createRoot, type Root } from "react-dom/client";
import { flushSync } from "react-dom";
import { afterEach, describe, expect, it } from "vitest";
import type { MissingProjectObservation } from "../../lib/missing-project-notice";
import { MissingProjectShell } from "./MissingProjectShell";
import { ProjectLoadingShell } from "./ProjectLoadingShell";

const roots: Array<{ root: Root; container: HTMLDivElement }> = [];

afterEach(() => {
  roots.splice(0).forEach(({ root, container }) => {
    flushSync(() => root.unmount());
    container.remove();
  });
});

function mount(node: React.ReactNode): HTMLDivElement {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  roots.push({ root, container });
  flushSync(() => root.render(node));
  return container;
}

describe("ProjectLoadingShell", () => {
  it("announces the loading state through role=status with the brand header", () => {
    const container = mount(<ProjectLoadingShell />);

    const status = container.querySelector('section[role="status"]');
    expect(status?.className).toBe("workbench-loading");
    expect(status?.textContent).toContain("正在加载项目…");
    expect(container.querySelector(".workbench-shell .brand .brand-label__full")?.textContent).toBe("蹭饭地图工作室");
    expect(container.querySelector(".brand-label__compact")?.getAttribute("aria-hidden")).toBe("true");
  });
});

describe("MissingProjectShell", () => {
  const observation = (patch: Partial<MissingProjectObservation> = {}): MissingProjectObservation => ({
    reason: "not-found",
    healthAtRequest: "persistent",
    health: "persistent",
    ...patch,
  });

  it("calls a confirmed deletion deleted and keeps the store health on the alert", () => {
    const container = mount(<MissingProjectShell observation={observation()} />);

    const alert = container.querySelector<HTMLElement>('section[role="alert"]');
    expect(alert?.className).toBe("workbench-error workbench-error--recover");
    expect(alert?.dataset.missingProject).toBe("deleted");
    expect(alert?.dataset.storeHealth).toBe("persistent");
    expect(alert?.querySelector("strong")?.textContent).toBe("项目不存在或已删除");
  });

  it("stays unconfirmed while the store is degraded", () => {
    const container = mount(
      <MissingProjectShell observation={observation({ healthAtRequest: "memory", health: "memory" })} />,
    );

    const alert = container.querySelector<HTMLElement>('section[role="alert"]');
    expect(alert?.dataset.missingProject).toBe("unconfirmed");
    expect(alert?.dataset.storeHealth).toBe("memory");
    expect(alert?.textContent).toContain("请不要清理浏览器数据");
  });

  it("offers a single labelled way back to the project list", () => {
    const container = mount(<MissingProjectShell observation={observation()} />);
    const back = container.querySelector<HTMLButtonElement>('.workbench-error-actions button[aria-label="返回项目列表"]');

    expect(back?.className).toBe("primary-button");
    expect(back?.textContent?.trim()).toBe("返回项目列表");

    window.location.hash = "#/p/some-project";
    flushSync(() => back!.click());
    expect(window.location.hash).toBe("#/");
  });
});
