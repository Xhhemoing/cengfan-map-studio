import { afterEach, describe, expect, it, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { flushSync } from "react-dom";
import { ProvinceInspector } from "./ProvinceInspector";

const mounted: Array<{ root: Root; container: HTMLElement }> = [];

afterEach(() => {
  // An assertion throwing before the inline unmount would leave the root mounted for
  // the rest of the run, racing React's scheduler against jsdom teardown.
  flushSync(() => {
    for (const { root, container } of mounted.splice(0)) {
      root.unmount();
      container.remove();
    }
  });
});

describe("province texture position controls", () => {
  it("resets manual placement without exposing cross-province synchronization", () => {
    const onPatch = vi.fn();
    const appearance = {
      kind: "texture" as const,
      assetId: "a1",
      src: "zhejiang.png",
      fit: "contain" as const,
      offsetX: 18,
      offsetY: -12,
    };
    const container = document.createElement("div");
    const root = createRoot(container);
    mounted.push({ root, container });
    flushSync(() => root.render(<ProvinceInspector
      province="浙江省"
      style={{ appearance }}
      onPatch={onPatch}
    />));

    expect(container.textContent).toContain("X 18");
    expect(container.textContent).toContain("Y -12");
    const reset = Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.includes("恢复居中"))!;
    flushSync(() => reset.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(onPatch).toHaveBeenCalledWith({ appearance: expect.objectContaining({ offsetX: 0, offsetY: 0 }) });

    expect(container.textContent).not.toContain("同步所有贴图设置");
  });
});
