import { afterEach, describe, expect, it, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { flushSync } from "react-dom";
import { RangeNumberControl } from "./RangeNumberControl";

const mounted: Array<{ root: Root; container: HTMLElement }> = [];

function createTrackedRoot(container: HTMLElement): Root {
  const root = createRoot(container);
  mounted.push({ root, container });
  return root;
}

// An assertion throwing before an inline unmount leaves the root mounted for the rest of
// the run, so React's scheduler can wake up against a torn-down jsdom.
afterEach(() => {
  flushSync(() => {
    for (const { root, container } of mounted.splice(0)) {
      root.unmount();
      container.remove();
    }
  });
});

function setInputValue(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

describe("RangeNumberControl", () => {
  it("keeps slider changes local until blur", () => {
    const onCommit = vi.fn();
    const container = document.createElement("div");
    const root = createTrackedRoot(container);
    flushSync(() => root.render(
      <RangeNumberControl id="size" label="大小" value={100} min={1} max={200} step={1} onCommit={onCommit} />,
    ));

    const slider = container.querySelector("#size-range") as HTMLInputElement;
    slider.focus();
    flushSync(() => setInputValue(slider, "120"));
    expect(onCommit).not.toHaveBeenCalled();
    flushSync(() => slider.dispatchEvent(new FocusEvent("focusout", { bubbles: true })));
    expect(onCommit).toHaveBeenCalledOnce();
    expect(onCommit).toHaveBeenCalledWith(120);
  });

  it("keeps number edits local until blur", () => {
    const onCommit = vi.fn();
    const container = document.createElement("div");
    const root = createTrackedRoot(container);
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
  });

  it("commits Enter once and restores invalid values without committing", () => {
    const onCommit = vi.fn();
    const container = document.createElement("div");
    const root = createTrackedRoot(container);
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
  });
});
