import { describe, expect, it, vi } from "vitest";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { createProjectDocument } from "../../lib/project-document";
import type { CanvasSettings } from "../../lib/scene-document";
import { CanvasInspector } from "./CanvasInspector";

function renderInspector(overrides: Partial<CanvasSettings> = {}) {
  const project = createProjectDocument({ students: [], templateId: "original", dataView: "province" });
  const onPatch = vi.fn();
  const onReset = vi.fn();
  const container = document.createElement("div");
  const root = createRoot(container);
  flushSync(() => root.render(
    <CanvasInspector canvas={{ ...project.canvas, ...overrides }} onPatch={onPatch} onReset={onReset} />,
  ));
  return { container, root, onPatch, onReset };
}

const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;

function typeDraft(input: HTMLInputElement, draft: string) {
  flushSync(() => {
    valueSetter?.call(input, draft);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

function blur(input: HTMLInputElement) {
  flushSync(() => input.dispatchEvent(new FocusEvent("focusout", { bubbles: true })));
}

describe("CanvasInspector print bleed", () => {
  it("renders a labelled 印刷出血(mm) number field with a 0–20 range", () => {
    const { container, root } = renderInspector();
    const label = container.querySelector('label[for="canvas-printBleedMm"]');
    expect(label?.textContent).toContain("印刷出血(mm)");
    const input = container.querySelector("#canvas-printBleedMm") as HTMLInputElement;
    expect(input).not.toBeNull();
    expect(input.type).toBe("number");
    expect(input.min).toBe("0");
    expect(input.max).toBe("20");
    expect(input.value).toBe("0");
    // The bleed field joins the existing canvas controls without replacing any.
    for (const id of ["canvas-width", "canvas-height", "canvas-safeMargin", "canvas-background"]) {
      expect(container.querySelector(`#${id}`)).not.toBeNull();
    }
    flushSync(() => root.unmount());
  });

  it("falls back to 0 when the scene has no printBleedMm yet", () => {
    const { container, root } = renderInspector({ printBleedMm: undefined });
    const input = container.querySelector("#canvas-printBleedMm") as HTMLInputElement;
    expect(input.value).toBe("0");
    flushSync(() => root.unmount());
  });

  it("defers the commit until blur and patches printBleedMm", () => {
    const { container, root, onPatch } = renderInspector();
    const input = container.querySelector("#canvas-printBleedMm") as HTMLInputElement;
    typeDraft(input, "3");
    expect(onPatch).not.toHaveBeenCalled();
    blur(input);
    expect(onPatch).toHaveBeenCalledWith({ printBleedMm: 3 });
    flushSync(() => root.unmount());
  });

  it("rejects drafts outside 0–20", () => {
    const { container, root, onPatch } = renderInspector();
    const input = container.querySelector("#canvas-printBleedMm") as HTMLInputElement;
    typeDraft(input, "25");
    blur(input);
    typeDraft(input, "-2");
    blur(input);
    expect(onPatch).not.toHaveBeenCalled();
    flushSync(() => root.unmount());
  });

  it("commits with the Enter key", () => {
    const { container, root, onPatch } = renderInspector();
    const input = container.querySelector("#canvas-printBleedMm") as HTMLInputElement;
    typeDraft(input, "5");
    expect(onPatch).not.toHaveBeenCalled();
    flushSync(() => input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })));
    expect(onPatch).toHaveBeenCalledWith({ printBleedMm: 5 });
    flushSync(() => root.unmount());
  });

  it("cancels the draft with the Escape key", () => {
    const { container, root, onPatch } = renderInspector();
    const input = container.querySelector("#canvas-printBleedMm") as HTMLInputElement;
    typeDraft(input, "7");
    flushSync(() => input.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
    expect(input.value).toBe("0");
    blur(input);
    expect(onPatch).not.toHaveBeenCalled();
    flushSync(() => root.unmount());
  });
});

describe("CanvasInspector reset button accessibility", () => {
  it("labels the 重置画布 button and hides its icon from assistive tech", () => {
    const { container, root } = renderInspector();
    const button = container.querySelector('button[aria-label="重置画布"]');
    expect(button).not.toBeNull();
    const icon = button?.querySelector("svg");
    expect(icon).not.toBeNull();
    expect(icon?.getAttribute("aria-hidden")).toBe("true");
    flushSync(() => root.unmount());
  });
});
