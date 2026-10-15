import { useState } from "react";
import { flushSync } from "react-dom";
import { describe, expect, it, vi } from "vitest";
import { installProjectWorkbenchTestHarness, mountElement } from "../project-workbench-test-harness";
import { ProjectActionsMenu } from "./ProjectActionsMenu";

installProjectWorkbenchTestHarness();

function mountMenu(action = vi.fn()) {
  function Harness() {
    const [open, setOpen] = useState(false);
    return <><ProjectActionsMenu name="测试班级" open={open} onToggle={() => setOpen((value) => !value)} onRename={action} onDuplicate={action} onExport={action} onDelete={action} /><button type="button">外部操作</button></>;
  }
  const container = mountElement(<Harness />);
  document.body.append(container);
  const trigger = container.querySelector<HTMLButtonElement>('[aria-haspopup="menu"]')!;
  const key = (element: Element, value: string) => flushSync(() => element.dispatchEvent(new KeyboardEvent("keydown", { key: value, bubbles: true })));
  const buttons = () => Array.from(container.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'));
  return { container, trigger, key, buttons, action };
}

describe("ProjectActionsMenu keyboard and dismissal", () => {
  it("focuses actions, wraps arrow navigation and returns focus on Escape", async () => {
    const { container, trigger, key, buttons } = mountMenu();
    flushSync(() => trigger.click());
    await vi.waitFor(() => expect(document.activeElement).toBe(buttons()[0]));
    expect(container.querySelector('[role="menu"]')?.getAttribute("id")).toBe(trigger.getAttribute("aria-controls"));
    key(buttons()[0]!, "ArrowUp");
    expect(document.activeElement).toBe(buttons()[3]);
    key(buttons()[3]!, "ArrowDown");
    expect(document.activeElement).toBe(buttons()[0]);
    key(buttons()[0]!, "End");
    expect(document.activeElement).toBe(buttons()[3]);
    key(buttons()[3]!, "Home");
    expect(document.activeElement).toBe(buttons()[0]);
    key(buttons()[0]!, "Escape");
    expect(container.querySelector('[role="menu"]')).toBeNull();
    expect(document.activeElement).toBe(trigger);
    expect(trigger.getAttribute("aria-expanded")).toBe("false");
  });

  it("opens the last action with ArrowUp and runs an action once", async () => {
    const { container, trigger, key, buttons, action } = mountMenu();
    trigger.focus();
    key(trigger, "ArrowUp");
    await vi.waitFor(() => expect(document.activeElement).toBe(buttons()[3]));
    flushSync(() => buttons()[3]!.click());
    expect(action).toHaveBeenCalledTimes(1);
    expect(container.querySelector('[role="menu"]')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it("closes on an outside pointer and when focus leaves without taking focus back", async () => {
    const { container, trigger, buttons } = mountMenu();
    const outside = container.querySelector<HTMLButtonElement>("div + button")!;
    flushSync(() => trigger.click());
    await vi.waitFor(() => expect(document.activeElement).toBe(buttons()[0]));
    flushSync(() => outside.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true })));
    expect(container.querySelector('[role="menu"]')).toBeNull();
    flushSync(() => trigger.click());
    await vi.waitFor(() => expect(document.activeElement).toBe(buttons()[0]));
    flushSync(() => outside.focus());
    expect(container.querySelector('[role="menu"]')).toBeNull();
    expect(document.activeElement).toBe(outside);
  });
});
