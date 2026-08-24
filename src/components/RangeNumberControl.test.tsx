import { act } from "react";
import { describe, expect, it, vi } from "vitest";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { RangeNumberControl } from "./RangeNumberControl";

function setInputValue(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

describe("RangeNumberControl", () => {
  it("commits slider changes while dragging without waiting for blur", () => {
    const onCommit = vi.fn();
    const container = document.createElement("div");
    const root = createRoot(container);
    flushSync(() => root.render(
      <RangeNumberControl id="size" label="大小" value={100} min={1} max={200} step={1} onCommit={onCommit} />,
    ));

    const slider = container.querySelector("#size-range") as HTMLInputElement;
    slider.focus();
    flushSync(() => setInputValue(slider, "120"));
    expect(onCommit).toHaveBeenCalledOnce();
    expect(onCommit).toHaveBeenCalledWith(120);

    flushSync(() => slider.dispatchEvent(new FocusEvent("focusout", { bubbles: true })));
    expect(onCommit).toHaveBeenCalledOnce();
    root.unmount();
  });

  it("commits every keyboard step on the slider while focus stays put", () => {
    const onCommit = vi.fn();
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    flushSync(() => root.render(
      <RangeNumberControl id="size" label="大小" value={100} min={1} max={200} step={1} onCommit={onCommit} />,
    ));

    const slider = container.querySelector("#size-range") as HTMLInputElement;
    slider.focus();
    // 浏览器按方向键时会改值并派发 input,焦点不会离开滑条。
    flushSync(() => setInputValue(slider, "101"));
    flushSync(() => setInputValue(slider, "102"));

    expect(document.activeElement).toBe(slider);
    expect(onCommit).toHaveBeenCalledTimes(2);
    expect(onCommit).toHaveBeenNthCalledWith(1, 101);
    expect(onCommit).toHaveBeenNthCalledWith(2, 102);
    root.unmount();
    container.remove();
  });

  it("syncs external value into the draft when nothing is being edited", async () => {
    const onCommit = vi.fn();
    const container = document.createElement("div");
    const root = createRoot(container);
    await act(async () => root.render(
      <RangeNumberControl id="size" label="大小" value={100} min={1} max={200} step={1} onCommit={onCommit} />,
    ));
    await act(async () => root.render(
      <RangeNumberControl id="size" label="大小" value={150} min={1} max={200} step={1} onCommit={onCommit} />,
    ));

    expect((container.querySelector("#size-range") as HTMLInputElement).value).toBe("150");
    expect((container.querySelector("#size") as HTMLInputElement).value).toBe("150");
    expect(onCommit).not.toHaveBeenCalled();
    root.unmount();
  });

  it("clamps out-of-range number input to the allowed bounds", () => {
    const onCommit = vi.fn();
    const container = document.createElement("div");
    const root = createRoot(container);
    flushSync(() => root.render(
      <RangeNumberControl id="size" label="大小" value={100} min={10} max={200} step={1} onCommit={onCommit} />,
    ));

    const number = container.querySelector("#size") as HTMLInputElement;
    number.focus();
    flushSync(() => setInputValue(number, "999"));
    flushSync(() => number.dispatchEvent(new FocusEvent("focusout", { bubbles: true })));
    expect(onCommit).toHaveBeenCalledWith(200);
    expect(number.value).toBe("200");

    onCommit.mockClear();
    number.focus();
    flushSync(() => setInputValue(number, "-40"));
    flushSync(() => number.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })));
    flushSync(() => number.dispatchEvent(new FocusEvent("focusout", { bubbles: true })));
    expect(onCommit).toHaveBeenCalledOnce();
    expect(onCommit).toHaveBeenCalledWith(10);
    expect(number.value).toBe("10");
    root.unmount();
  });

  it("keeps number edits local until blur", () => {
    const onCommit = vi.fn();
    const container = document.createElement("div");
    const root = createRoot(container);
    flushSync(() => root.render(
      <RangeNumberControl id="size" label="大小" value={100} min={1} max={200} step={1} onCommit={onCommit} />,
    ));

    const number = container.querySelector("#size") as HTMLInputElement;
    number.focus();
    flushSync(() => setInputValue(number, "135"));
    expect(number.value).toBe("135");
    expect(onCommit).not.toHaveBeenCalled();

    flushSync(() => number.dispatchEvent(new FocusEvent("focusout", { bubbles: true })));
    expect(onCommit).toHaveBeenCalledOnce();
    expect(onCommit).toHaveBeenCalledWith(135);
    root.unmount();
  });

  it("commits Enter once and restores invalid values without committing", () => {
    const onCommit = vi.fn();
    const container = document.createElement("div");
    const root = createRoot(container);
    flushSync(() => root.render(
      <RangeNumberControl id="size" label="大小" value={100} min={1} max={200} step={1} onCommit={onCommit} />,
    ));

    const number = container.querySelector("#size") as HTMLInputElement;
    number.focus();
    flushSync(() => setInputValue(number, "160"));
    flushSync(() => number.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })));
    flushSync(() => number.dispatchEvent(new FocusEvent("focusout", { bubbles: true })));
    expect(onCommit).toHaveBeenCalledOnce();
    expect(onCommit).toHaveBeenCalledWith(160);

    onCommit.mockClear();
    number.focus();
    flushSync(() => setInputValue(number, ""));
    flushSync(() => number.dispatchEvent(new FocusEvent("focusout", { bubbles: true })));
    expect(onCommit).not.toHaveBeenCalled();
    expect(number.value).toBe("100");

    flushSync(() => setInputValue(number, "175"));
    flushSync(() => number.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
    flushSync(() => number.dispatchEvent(new FocusEvent("focusout", { bubbles: true })));
    expect(onCommit).not.toHaveBeenCalled();
    expect(number.value).toBe("100");
    root.unmount();
  });
});
