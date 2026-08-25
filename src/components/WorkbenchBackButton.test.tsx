import { afterEach, describe, expect, it } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { flushSync } from "react-dom";
import { WorkbenchBackButton } from "./WorkbenchBackButton";

let roots: Array<{ root: Root; container: HTMLElement }> = [];
function render(view: React.ReactElement): HTMLElement {
  const container = document.createElement("div");
  const root = createRoot(container);
  roots.push({ root, container });
  flushSync(() => root.render(view));
  return container;
}

afterEach(() => {
  roots.forEach(({ root }) => flushSync(() => root.unmount()));
  roots = [];
  window.location.hash = "";
});

describe("WorkbenchBackButton", () => {
  it("keeps the labelled secondary-button contract the topbar styles rely on", () => {
    const button = render(<WorkbenchBackButton />).querySelector<HTMLButtonElement>("button")!;

    expect(button.type).toBe("button");
    expect(button.className).toBe("secondary-button");
    expect(button.getAttribute("aria-label")).toBe("返回项目列表");
    expect(button.textContent).toContain("返回列表");
  });

  it("falls back to the workbench route when no handler is supplied", () => {
    const button = render(<WorkbenchBackButton />).querySelector<HTMLButtonElement>("button")!;

    flushSync(() => button.click());

    expect(window.location.hash).toBe("#/");
  });

  it("lets the project mode save before leaving instead of navigating itself", () => {
    let clicks = 0;
    const button = render(<WorkbenchBackButton onClick={() => { clicks += 1; }} />)
      .querySelector<HTMLButtonElement>("button")!;

    flushSync(() => button.click());

    expect(clicks).toBe(1);
    expect(window.location.hash).toBe("");
  });
});
