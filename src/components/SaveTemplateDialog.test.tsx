import { afterEach, describe, expect, it, vi } from "vitest";
import { useState, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { flushSync } from "react-dom";
import { SaveTemplateDialog } from "./SaveTemplateDialog";

let roots: Array<{ root: Root; container: HTMLElement }> = [];

function mount(element: ReactElement): HTMLElement {
  const container = document.createElement("div");
  // 焦点行为依赖真实文档树，容器必须挂到 body 上。
  document.body.appendChild(container);
  const root = createRoot(container);
  roots.push({ root, container });
  flushSync(() => root.render(element));
  return container;
}

afterEach(() => {
  roots.forEach(({ root, container }) => {
    root.unmount();
    container.remove();
  });
  roots = [];
  vi.restoreAllMocks();
});

function click(element: Element): void {
  flushSync(() => element.dispatchEvent(new MouseEvent("click", { bubbles: true })));
}

function press(target: Element, key: string, init: KeyboardEventInit = {}): void {
  flushSync(() => target.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, ...init })));
}

function buttonByLabel(scope: ParentNode, label: string): HTMLButtonElement {
  return Array.from(scope.querySelectorAll("button")).find((button) => button.textContent?.trim() === label)!;
}

function SaveTemplateHarness({ onSave = vi.fn() }: { onSave?: (payload: { name: string; scope: string }) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button type="button" onClick={() => setOpen(true)}>保存模板</button>
      <button type="button">背后按钮</button>
      {open && (
        <SaveTemplateDialog
          onCancel={() => setOpen(false)}
          onSave={(payload) => {
            onSave(payload);
            setOpen(false);
          }}
        />
      )}
    </div>
  );
}

function openDialog(container: HTMLElement) {
  const trigger = buttonByLabel(container, "保存模板");
  trigger.focus();
  click(trigger);
  const dialog = container.querySelector<HTMLElement>(".save-template-dialog")!;
  const panel = dialog.querySelector<HTMLElement>(".workbench-dialog__panel")!;
  return { trigger, dialog, panel };
}

describe("SaveTemplateDialog", () => {
  it("复用工作台对话框外壳，遮罩与面板都不再是第二份拷贝", () => {
    const container = mount(<SaveTemplateHarness />);
    const { dialog, panel } = openDialog(container);

    expect(dialog.classList.contains("workbench-dialog")).toBe(true);
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(panel).not.toBeNull();
    expect(dialog.querySelector(".workbench-dialog__backdrop")).not.toBeNull();
    expect(dialog.querySelector(".save-template-dialog__panel")).toBeNull();
  });

  it("打开后焦点落在模板名称输入框且预选全部文字", () => {
    const container = mount(<SaveTemplateHarness />);
    const { panel } = openDialog(container);
    const input = panel.querySelector<HTMLInputElement>('input[aria-label="模板名称"]')!;

    expect(document.activeElement).toBe(input);
    expect(input.selectionStart).toBe(0);
    expect(input.selectionEnd).toBe(input.value.length);
  });

  it("Tab 在面板内回绕，不会落到背后的按钮上", () => {
    const container = mount(<SaveTemplateHarness />);
    const { panel } = openDialog(container);
    const input = panel.querySelector<HTMLInputElement>('input[aria-label="模板名称"]')!;
    const save = buttonByLabel(panel, "保存");

    save.focus();
    press(save, "Tab");
    expect(document.activeElement).toBe(input);

    press(input, "Tab", { shiftKey: true });
    expect(document.activeElement).toBe(save);

    const outside = buttonByLabel(container, "背后按钮");
    outside.focus();
    press(outside, "Tab");
    expect(panel.contains(document.activeElement)).toBe(true);
  });

  it("Esc 关闭并把焦点还给触发按钮", () => {
    const container = mount(<SaveTemplateHarness />);
    const { trigger, panel } = openDialog(container);

    press(panel.querySelector('input[aria-label="模板名称"]')!, "Escape");

    expect(container.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it("点遮罩取消，焦点同样回到触发按钮", () => {
    const container = mount(<SaveTemplateHarness />);
    const { trigger, dialog } = openDialog(container);

    click(dialog.querySelector<HTMLElement>(".workbench-dialog__backdrop")!);

    expect(container.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it("提交后回传名称与保存范围，焦点回到触发按钮", () => {
    const onSave = vi.fn();
    const container = mount(<SaveTemplateHarness onSave={onSave} />);
    const { trigger, panel } = openDialog(container);

    click(panel.querySelector<HTMLInputElement>('input[type="radio"][value="layout"]')!);
    click(buttonByLabel(panel, "保存"));

    expect(onSave).toHaveBeenCalledWith({ name: "我的地图版式", scope: "layout" });
    expect(container.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });
});
