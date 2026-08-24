import { type ReactElement } from "react";
import { flushSync } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { TemplatePicker } from "./TemplatePicker";

const roots: Array<{ root: Root; container: HTMLDivElement }> = [];

afterEach(() => {
  roots.splice(0).forEach(({ root, container }) => {
    flushSync(() => root.unmount());
    container.remove();
  });
});

function render(element: ReactElement): HTMLDivElement {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  roots.push({ root, container });
  flushSync(() => root.render(element));
  return container;
}

const baseProps = {
  templates: [{ id: "original" as const, name: "原始地图" }, { id: "cartoon" as const, name: "卡通画风" }],
  currentTemplateId: "original",
  customTemplates: [],
  onApplyCustomTemplate: vi.fn(),
  onSaveTemplate: vi.fn(),
};

describe("TemplatePicker", () => {
  it("renders nothing extra when no exchange slot is provided", () => {
    const container = render(<TemplatePicker {...baseProps} onApplyTemplate={vi.fn()} />);

    expect(container.querySelector(".workflow-save-template")).not.toBeNull();
    expect(container.querySelector('[data-testid="exchange-slot"]')).toBeNull();
  });

  it("renders the exchange slot after the save button", () => {
    const container = render(
      <TemplatePicker
        {...baseProps}
        onApplyTemplate={vi.fn()}
        exchange={<div data-testid="exchange-slot">交换区</div>}
      />,
    );

    const save = container.querySelector(".workflow-save-template")!;
    const slot = container.querySelector('[data-testid="exchange-slot"]')!;
    expect(slot).not.toBeNull();
    expect(save.compareDocumentPosition(slot) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("keeps applying built-in templates", () => {
    const onApplyTemplate = vi.fn();
    const container = render(<TemplatePicker {...baseProps} onApplyTemplate={onApplyTemplate} />);

    flushSync(() => container.querySelectorAll<HTMLButtonElement>(".workflow-template-grid button")[1]!.click());

    expect(onApplyTemplate).toHaveBeenCalledWith("cartoon");
  });
});
