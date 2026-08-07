import { createRoot, type Root } from "react-dom/client";
import { flushSync } from "react-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SkinSelector } from "./SkinSelector";

const roots: Array<{ root: Root; container: HTMLDivElement }> = [];

function renderSelector(skin: "atelier" | "classic", onChange = vi.fn()) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  roots.push({ root, container });
  flushSync(() => root.render(<SkinSelector skin={skin} onChange={onChange} />));
  return { container, onChange };
}

function click(element: Element): void {
  flushSync(() => element.dispatchEvent(new MouseEvent("click", { bubbles: true })));
}

afterEach(() => {
  roots.splice(0).forEach(({ root, container }) => {
    flushSync(() => root.unmount());
    container.remove();
  });
});

describe("SkinSelector", () => {
  it("announces and changes the selected interface skin", () => {
    const { container, onChange } = renderSelector("atelier");
    const atelier = container.querySelector<HTMLButtonElement>('button[aria-label="切换到 Atelier 界面"]')!;
    const classic = container.querySelector<HTMLButtonElement>('button[aria-label="切换到经典界面"]')!;

    expect(container.querySelector('[role="group"][aria-label="界面样式"]')).not.toBeNull();
    expect(atelier.getAttribute("aria-pressed")).toBe("true");
    expect(classic.getAttribute("aria-pressed")).toBe("false");

    click(classic);

    expect(onChange).toHaveBeenCalledWith("classic");
  });
});
