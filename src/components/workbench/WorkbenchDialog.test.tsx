import { afterEach, describe, expect, it, vi } from "vitest";
import { useEffect, useRef, useState, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { flushSync } from "react-dom";
import { WorkbenchDialog } from "./WorkbenchDialog";

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

/** 背后有可聚焦控件的宿主页面：Tab 逃出面板就会落到「背后按钮」上。 */
function DialogHarness({ autoFocusField = false }: { autoFocusField?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button type="button" onClick={() => setOpen(true)}>打开</button>
      <button type="button">背后按钮</button>
      {open && (
        <WorkbenchDialog titleId="harness-title" onCancel={() => setOpen(false)}>
          <strong id="harness-title">测试对话框</strong>
          {autoFocusField && <SelfFocusingField />}
          <div className="workbench-dialog__actions">
            <button type="button" onClick={() => setOpen(false)}>取消</button>
            <button type="button" className="primary-button">确定</button>
          </div>
        </WorkbenchDialog>
      )}
    </div>
  );
}

/** 模拟重命名对话框那样在自己的 effect 里认领焦点的子内容。 */
function SelfFocusingField() {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    ref.current?.focus();
  }, []);
  return <input ref={ref} type="text" aria-label="名称" />;
}

function openDialog(container: HTMLElement) {
  const trigger = buttonByLabel(container, "打开");
  trigger.focus();
  click(trigger);
  const panel = container.querySelector<HTMLElement>(".workbench-dialog__panel")!;
  expect(panel).not.toBeNull();
  return { trigger, panel };
}

describe("WorkbenchDialog 焦点圈闭", () => {
  it("没人认领焦点时把焦点收进面板本身", () => {
    const container = mount(<DialogHarness />);
    const { panel } = openDialog(container);
    expect(document.activeElement).toBe(panel);
  });

  it("子内容已经认领焦点时不抢回面板", () => {
    const container = mount(<DialogHarness autoFocusField />);
    openDialog(container);
    expect(document.activeElement).toBe(container.querySelector('input[aria-label="名称"]'));
  });

  it("Tab 在面板首尾之间回绕，不会走到背后的按钮上", () => {
    const container = mount(<DialogHarness />);
    const { panel } = openDialog(container);
    const cancel = buttonByLabel(panel, "取消");
    const confirm = buttonByLabel(panel, "确定");

    press(panel, "Tab");
    expect(document.activeElement).toBe(cancel);

    // 中间一跳交给浏览器原生顺序，jsdom 里手动移到末尾再验证回绕。
    confirm.focus();
    press(confirm, "Tab");
    expect(document.activeElement).toBe(cancel);

    press(cancel, "Tab", { shiftKey: true });
    expect(document.activeElement).toBe(confirm);
  });

  it("焦点已经跑到面板外时，下一次 Tab 把它收回面板", () => {
    const container = mount(<DialogHarness />);
    const { panel } = openDialog(container);
    const outside = buttonByLabel(container, "背后按钮");
    outside.focus();

    press(outside, "Tab");
    expect(panel.contains(document.activeElement)).toBe(true);
    expect(document.activeElement).toBe(buttonByLabel(panel, "取消"));
  });

  it("焦点离开面板后 Esc 仍然关闭对话框", () => {
    const container = mount(<DialogHarness />);
    openDialog(container);
    const outside = buttonByLabel(container, "背后按钮");
    outside.focus();

    press(outside, "Escape");
    expect(container.querySelector('[role="dialog"]')).toBeNull();
  });

  it("Esc 不再冒泡给文档级监听，工作台菜单不会跟着抢这次按键", () => {
    const container = mount(<DialogHarness />);
    const { panel } = openDialog(container);
    const documentListener = vi.fn();
    document.addEventListener("keydown", documentListener);

    press(panel, "Escape");

    expect(container.querySelector('[role="dialog"]')).toBeNull();
    expect(documentListener).not.toHaveBeenCalled();
    document.removeEventListener("keydown", documentListener);
  });

  it("关闭后把焦点还给打开它的按钮，而不是掉到 body", () => {
    const container = mount(<DialogHarness />);
    const { trigger, panel } = openDialog(container);
    expect(document.activeElement).toBe(panel);

    click(buttonByLabel(panel, "取消"));

    expect(container.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it("调用方自己还了焦点就不再抢回来", () => {
    function SelfRestoringHarness() {
      const [open, setOpen] = useState(true);
      const elsewhere = useRef<HTMLButtonElement>(null);
      return (
        <div>
          <button type="button" ref={elsewhere}>另一个按钮</button>
          {open && (
            <WorkbenchDialog
              titleId="restore-title"
              onCancel={() => {
                elsewhere.current?.focus();
                setOpen(false);
              }}
            >
              <strong id="restore-title">测试对话框</strong>
              <button type="button">取消</button>
            </WorkbenchDialog>
          )}
        </div>
      );
    }

    const container = mount(<SelfRestoringHarness />);
    click(container.querySelector<HTMLElement>(".workbench-dialog__backdrop")!);

    expect(document.activeElement).toBe(buttonByLabel(container, "另一个按钮"));
  });
});
