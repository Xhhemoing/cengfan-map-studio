import { createRoot, type Root } from "react-dom/client";
import { flushSync } from "react-dom";
import { afterEach, describe, expect, it } from "vitest";
import { StudioTopbar } from "./StudioTopbar";

let root: Root | undefined;
let container: HTMLDivElement | undefined;

function mount() {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  flushSync(() => root!.render(
    <StudioTopbar
      historyActions={<button type="button">撤销</button>}
      projectActions={<button type="button">项目</button>}
      stageActions={<button type="button">页面工具</button>}
      workflowNav={<nav><button type="button">下一步</button></nav>}
    />,
  ));
  return container;
}

afterEach(() => {
  if (root) flushSync(() => root!.unmount());
  container?.remove();
  root = undefined;
});

function click(element: Element) {
  flushSync(() => element.dispatchEvent(new MouseEvent("click", { bubbles: true })));
}

describe("shared topbar disclosure", () => {
  it("keeps navigation independent of tools and does not duplicate slot contents", () => {
    const view = mount();
    expect(view.querySelectorAll("header")).toHaveLength(1);
    expect(view.querySelector("header")?.dataset.hasWorkflow).toBe("true");
    expect(view.querySelector(".topbar-workflow")?.parentElement).toBe(view.querySelector("header"));
    expect(view.querySelector(".studio-topbar__leading")?.textContent).toBe("撤销");
    expect(view.querySelector(".studio-topbar__tools")?.textContent).toBe("页面工具项目");
    expect(view.querySelectorAll("button")).toHaveLength(5);
  });

  it("puts workflow before tools in reading and desktop visual order", () => {
    const view = mount();
    const header = view.querySelector("header")!;
    expect([...header.children].map((child) => child.className)).toEqual([
      "brand", "topbar-workflow", "topbar-actions",
    ]);
    expect(header.querySelectorAll(".topbar-workflow")).toHaveLength(1);
    expect(header.querySelector(".studio-topbar__tools .topbar-workflow")).toBeNull();
  });

  it("opens the labelled disclosure and returns focus on Escape", () => {
    const view = mount();
    const toggle = view.querySelector<HTMLButtonElement>('[aria-label="更多操作"]')!;
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    click(toggle);
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    expect(view.querySelector(".studio-topbar__tools")?.id).toBe(toggle.getAttribute("aria-controls"));
    flushSync(() => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(toggle);
  });

  it("closes on outside pointer interaction and navigation", () => {
    const view = mount();
    const toggle = view.querySelector<HTMLButtonElement>('[aria-label="更多操作"]')!;
    click(toggle);
    flushSync(() => document.body.dispatchEvent(new Event("pointerdown", { bubbles: true })));
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
    click(toggle);
    click(view.querySelector(".topbar-workflow button")!);
    expect(toggle.getAttribute("aria-expanded")).toBe("false");
  });
});
