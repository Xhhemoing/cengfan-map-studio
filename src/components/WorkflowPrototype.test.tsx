import { createRoot, type Root } from "react-dom/client";
import { flushSync } from "react-dom";
import { afterEach, describe, expect, it } from "vitest";
import { WorkflowPrototype } from "./WorkflowPrototype";

const roots: Array<{ root: Root; container: HTMLDivElement }> = [];

function renderPrototype() {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  flushSync(() => root.render(<WorkflowPrototype />));
  roots.push({ root, container });
  return container;
}

function click(container: HTMLElement, selector: string): void {
  const target = container.querySelector<HTMLElement>(selector);
  if (!target) throw new Error(`Missing target: ${selector}`);
  flushSync(() => target.dispatchEvent(new MouseEvent("click", { bubbles: true })));
}

afterEach(() => {
  roots.splice(0).forEach(({ root, container }) => {
    flushSync(() => root.unmount());
    container.remove();
  });
});

describe("WorkflowPrototype", () => {
  it("moves through workflow areas and keeps the selected canvas object contextual", () => {
    const container = renderPrototype();

    expect(container.querySelector("h1")?.textContent).toBe("班级毕业去向图");
    expect(container.querySelector('[aria-current="step"]')?.textContent).toContain("地图");

    click(container, '[aria-label="名单"]');
    expect(container.querySelector("h2")?.textContent).toBe("名单检查");

    click(container, '[aria-label="版式"]');
    click(container, '[aria-label="选择标题"]');
    expect(container.querySelector(".prototype-inspector h2")?.textContent).toBe("标题属性");
  });

  it("opens contextual quick actions without calling real application APIs", () => {
    const container = renderPrototype();

    click(container, '[aria-label="选择浙江省"]');
    expect(container.querySelector(".prototype-inspector h2")?.textContent).toBe("浙江省");
    expect(container.textContent).toContain("使用浙江贴图");
  });
});
