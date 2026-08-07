import { createRoot, type Root } from "react-dom/client";
import { flushSync } from "react-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createProjectDocument } from "../../lib/project-document";
import type { DisplayFrameDefinition } from "../../lib/display-frame";
import { DisplayFrameWorkspace } from "./DisplayFrameWorkspace";

const roots: Array<{ root: Root; container: HTMLDivElement }> = [];

afterEach(() => {
  roots.splice(0).forEach(({ root, container }) => {
    flushSync(() => root.unmount());
    container.remove();
  });
});

function renderWorkspace(frame?: DisplayFrameDefinition) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  roots.push({ root, container });
  const onPatch = vi.fn();
  const onTransaction = vi.fn();
  const project = createProjectDocument({ students: [], templateId: "original", dataView: "province" });
  project.cards = { ...project.cards, ...(frame ? { displayFrame: frame } : {}) };
  flushSync(() => root.render(
    <DisplayFrameWorkspace
      cards={project.cards}
      userFonts={[]}
      onPatch={onPatch}
      onTransaction={onTransaction}
    />,
  ));
  return { container, onPatch, onTransaction };
}

describe("DisplayFrameWorkspace", () => {
  it("derives a missing frame for display without patching until the first edit", () => {
    const { container, onPatch } = renderWorkspace();

    expect(container.querySelector('button[aria-label="固定自由排布"]')).not.toBeNull();
    expect(container.querySelector("#display-frame-fixed-name-x")).not.toBeNull();
    expect(onPatch).not.toHaveBeenCalled();

    flushSync(() => container.querySelector<HTMLButtonElement>('button[aria-label="固定排版连续文字"]')?.click());

    expect(onPatch).toHaveBeenCalledWith(expect.objectContaining({ displayFrame: expect.objectContaining({ mode: "flow" }) }));
  });

  it("renders the full-screen frame editor with fixed mode controls and local coordinates", () => {
    const { container, onPatch } = renderWorkspace();

    expect(container.querySelector('main[aria-label="展示框样式"]')).not.toBeNull();
    expect(container.querySelector('button[aria-label="固定自由排布"]')).not.toBeNull();
    expect(container.querySelector('button[aria-label="固定排版连续文字"]')).not.toBeNull();
    expect(container.querySelector("#display-frame-field-order")).not.toBeNull();
    expect(container.querySelector("#display-frame-fixed-name-x")).not.toBeNull();
    expect(container.querySelector('.display-frame-item__pair[data-property-pair="name-position"] #display-frame-fixed-name-x')).not.toBeNull();
    expect(container.querySelector('.display-frame-item__pair[data-property-pair="name-size"] #display-frame-fixed-name-width')).not.toBeNull();

    const input = container.querySelector<HTMLInputElement>("#display-frame-fixed-name-x")!;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    flushSync(() => {
      setter?.call(input, "96");
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });

    expect(onPatch).toHaveBeenCalledWith(expect.objectContaining({ displayFrame: expect.objectContaining({ mode: "fixed" }) }));
    expect(onPatch.mock.calls.at(-1)?.[0].displayFrame.fixed.items.find((item: { id: string }) => item.id === "name")?.x).toBe(96);
  });

  it("switches exclusively to flow mode and reports the variant impact", () => {
    const { container, onPatch } = renderWorkspace();

    flushSync(() => container.querySelector<HTMLButtonElement>('button[aria-label="固定排版连续文字"]')?.click());

    expect(container.querySelector(".display-frame-workspace__impact")?.textContent).toContain("固定自由排布中的局部坐标将暂时保留");
    expect(container.querySelector("#display-frame-flow-name-spacing")).not.toBeNull();
    expect(container.querySelector("#display-frame-fixed-name-x")).toBeNull();
    expect(onPatch).toHaveBeenCalledWith(expect.objectContaining({ displayFrame: expect.objectContaining({ mode: "flow" }) }));
  });
});
