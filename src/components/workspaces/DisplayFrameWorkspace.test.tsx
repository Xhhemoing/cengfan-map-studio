import { createRoot, type Root } from "react-dom/client";
import { flushSync } from "react-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createProjectDocument } from "../../lib/project-document";
import { deriveFixedDisplayFrameFromCardSettings, normalizeDisplayFrame, type DisplayFrameDefinition } from "../../lib/display-frame";
import { StudioTopbar } from "../StudioTopbar";
import { DisplayFrameRail, DisplayFrameWorkspace } from "./DisplayFrameWorkspace";

const roots: Array<{ root: Root; container: HTMLDivElement }> = [];

afterEach(() => {
  roots.splice(0).forEach(({ root, container }) => {
    flushSync(() => root.unmount());
    container.remove();
  });
});

/**
 * Shell harness: renders the topbar (with the position-refresh action in the
 * stage-actions slot), the center editor workspace and the shared-style right
 * rail, mirroring how App composes the display-frame stage.
 */
function renderWorkspace(frame?: DisplayFrameDefinition, onRefreshPositions = vi.fn()) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  roots.push({ root, container });
  const onPatch = vi.fn();
  const onTransaction = vi.fn();
  const project = createProjectDocument({ students: [], templateId: "original", dataView: "province" });
  project.cards = { ...project.cards, ...(frame ? { displayFrame: frame } : {}) };
  const derivedFrame = project.cards.displayFrame === undefined
    ? deriveFixedDisplayFrameFromCardSettings(project.cards)
    : normalizeDisplayFrame(project.cards.displayFrame);
  flushSync(() => root.render(
    <>
      <StudioTopbar
        stageActions={<button type="button" aria-label="刷新展示框位置" onClick={onRefreshPositions}>刷新位置</button>}
        projectActions={<></>}
      />
      <DisplayFrameWorkspace
        cards={project.cards}
        userFonts={[]}
        onPatch={onPatch}
        onTransaction={onTransaction}
        onRefreshPositions={onRefreshPositions}
      />
      <DisplayFrameRail
        frame={derivedFrame}
        onPatchStyle={(patch) => onPatch({ displayFrame: { ...derivedFrame, style: { ...derivedFrame.style, ...patch } } })}
      />
    </>,
  ));
  return { container, onPatch, onTransaction };
}

describe("DisplayFrameWorkspace", () => {
  it("exposes an explicit position refresh in the topbar stage actions", () => {
    const onRefreshPositions = vi.fn();
    const { container } = renderWorkspace(undefined, onRefreshPositions);

    const button = container.querySelector<HTMLButtonElement>('button[aria-label="刷新展示框位置"]');
    expect(button?.closest(".topbar")).not.toBeNull();
    expect(container.querySelector(".display-frame-workspace__header")).toBeNull();
    flushSync(() => button?.click());
    expect(onRefreshPositions).toHaveBeenCalledTimes(1);
  });

  it("renders the shared style rail with all display-frame-* inputs", () => {
    const { container } = renderWorkspace();

    expect(container.querySelector('aside[aria-label="展示框公共样式"]')).not.toBeNull();
    expect(container.querySelector("#display-frame-font-size")).not.toBeNull();
    expect(container.querySelector("#display-frame-padding")).not.toBeNull();
    expect(container.querySelector("#display-frame-margin")).not.toBeNull();
    expect(container.querySelector("#display-frame-align")).not.toBeNull();
    expect(container.querySelector("#display-frame-font-color")).not.toBeNull();
    expect(container.querySelector("#display-frame-background")).not.toBeNull();
    expect(container.querySelector("#display-frame-border-color")).not.toBeNull();
    expect(container.querySelector("#display-frame-border-width")).not.toBeNull();
    expect(container.querySelector("#display-frame-border-radius")).not.toBeNull();
  });

  it("derives a missing frame for display without patching until the first edit", () => {
    const { container, onPatch } = renderWorkspace();

    expect(container.querySelector('button[aria-label="固定自由排布"]')).not.toBeNull();
    expect(container.querySelector('[aria-label="选择姓名"]')).not.toBeNull();
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
    flushSync(() => container.querySelector<HTMLButtonElement>('[aria-label="选择姓名"]')?.click());
    expect(container.querySelector("#display-frame-fixed-name-x")).not.toBeNull();
    expect(container.querySelector('.display-frame-item__pair[data-property-pair="name-position"] #display-frame-fixed-name-x')).not.toBeNull();
    expect(container.querySelector('.display-frame-item__pair[data-property-pair="name-size"] #display-frame-fixed-name-width')).not.toBeNull();

    const input = container.querySelector<HTMLInputElement>("#display-frame-fixed-name-x")!;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    flushSync(() => {
      setter?.call(input, "96");
      input.dispatchEvent(new Event("change", { bubbles: true }));
      input.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
    });

    expect(onPatch).toHaveBeenCalledWith(expect.objectContaining({ displayFrame: expect.objectContaining({ mode: "fixed" }) }));
    expect(onPatch.mock.calls.at(-1)?.[0].displayFrame.fixed.items.find((item: { id: string }) => item.id === "name")?.x).toBe(96);
  });

  it("adds a text layer, selects it, and updates its content", () => {
    const { container, onPatch } = renderWorkspace();

    flushSync(() => container.querySelector<HTMLButtonElement>('[aria-label="添加自定义文字"]')?.click());
    const layer = container.querySelector<HTMLButtonElement>('[aria-label="选择自定义文字"]')!;
    flushSync(() => layer.click());
    const input = container.querySelector<HTMLInputElement>("#display-frame-item-content")!;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    flushSync(() => {
      setter?.call(input, "毕业快乐");
      input.dispatchEvent(new Event("change", { bubbles: true }));
      input.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
    });

    const item = onPatch.mock.calls.at(-1)?.[0].displayFrame.fixed.items.find((candidate: { kind: string }) => candidate.kind === "text");
    expect(item).toMatchObject({ content: "毕业快乐" });
  });

  it("removes a selected custom layer but keeps required field layers", () => {
    const { container } = renderWorkspace();

    flushSync(() => container.querySelector<HTMLButtonElement>('[aria-label="添加自定义文字"]')?.click());
    flushSync(() => container.querySelector<HTMLButtonElement>('[aria-label="选择自定义文字"]')?.click());
    flushSync(() => container.querySelector<HTMLButtonElement>('[aria-label="删除当前图层"]')?.click());

    expect(container.querySelector('[aria-label="选择自定义文字"]')).toBeNull();
    expect(container.querySelector('[aria-label="选择标题"]')).not.toBeNull();
  });

  it("exposes the subcanvas, layer list, and selected item inspector with labelled controls", () => {
    const { container } = renderWorkspace();

    expect(container.querySelector('[aria-label="展示框局部预览"]')).not.toBeNull();
    expect(container.querySelector('[aria-label="展示框图层"]')).not.toBeNull();
    expect(container.querySelector('[aria-label="当前图层属性"]')).not.toBeNull();
    expect(container.querySelector('button[aria-label="添加自定义文字"]')).not.toBeNull();
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
