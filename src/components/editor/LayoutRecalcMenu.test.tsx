import { createRoot, type Root } from "react-dom/client";
import { flushSync } from "react-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LayoutRecalcMenu } from "./LayoutRecalcMenu";

const roots: Array<{ root: Root; container: HTMLDivElement }> = [];

afterEach(() => {
  roots.splice(0).forEach(({ root, container }) => {
    flushSync(() => root.unmount());
    container.remove();
  });
});

function mount(layoutMode: "quadrant" | "radial" | "right-stack" | "grid" = "quadrant") {
  const onRecalc = vi.fn();
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  roots.push({ root, container });
  flushSync(() => root.render(<LayoutRecalcMenu layoutMode={layoutMode} onRecalc={onRecalc} />));
  return { container, onRecalc };
}

describe("LayoutRecalcMenu", () => {
  it("keeps the refresh action and lists every algorithm", () => {
    const { container } = mount();

    expect(container.querySelector('[role="group"][aria-label="重算展示框"]')).not.toBeNull();
    expect(container.querySelector('button[aria-label="刷新展示框位置"]')).not.toBeNull();
    expect(container.querySelector('summary[aria-label="选择排布算法"]')).not.toBeNull();
    expect(Array.from(container.querySelectorAll<HTMLButtonElement>("[data-layout-mode]")).map((button) => button.dataset.layoutMode)).toEqual([
      "quadrant",
      "radial",
      "right-stack",
      "grid",
    ]);
    expect(container.querySelector('[data-layout-mode="quadrant"]')?.getAttribute("aria-checked")).toBe("true");
  });

  it("recalculates with the current algorithm from the main button", () => {
    const { container, onRecalc } = mount("radial");

    flushSync(() => container.querySelector<HTMLButtonElement>('button[aria-label="刷新展示框位置"]')!.click());

    expect(onRecalc).toHaveBeenCalledTimes(1);
    expect(onRecalc).toHaveBeenCalledWith();
  });

  it("applies a chosen algorithm and closes the menu", () => {
    const { container, onRecalc } = mount();
    const menu = container.querySelector<HTMLDetailsElement>(".layout-recalc__menu")!;
    menu.open = true;

    flushSync(() => container.querySelector<HTMLButtonElement>('[data-layout-mode="grid"]')!.click());

    expect(onRecalc).toHaveBeenCalledWith("grid");
    expect(menu.open).toBe(false);
  });
});
