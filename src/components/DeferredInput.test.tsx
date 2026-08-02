import { describe, expect, it, vi } from "vitest";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { DeferredInput, DeferredTextarea } from "./DeferredInput";

function setInputValue(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
  setter?.call(input, value);
  input.dispatchEvent(new Event("input", { bubbles: true }));
}

describe("DeferredInput", () => {
  it("keeps edits local until blur", () => {
    const onCommit = vi.fn();
    const container = document.createElement("div");
    const root = createRoot(container);
    flushSync(() => root.render(<DeferredInput id="title" value="原标题" onCommit={onCommit} />));

    const input = container.querySelector("#title") as HTMLInputElement;
    input.focus();
    flushSync(() => setInputValue(input, "新标题"));
    expect(input.value).toBe("新标题");
    expect(onCommit).not.toHaveBeenCalled();

    flushSync(() => input.dispatchEvent(new FocusEvent("focusout", { bubbles: true })));
    expect(onCommit).toHaveBeenCalledOnce();
    expect(onCommit).toHaveBeenCalledWith("新标题");
    root.unmount();
  });

  it("commits color pickers on the native change event (picker close) without blur", () => {
    const onCommit = vi.fn();
    const container = document.createElement("div");
    const root = createRoot(container);
    flushSync(() => root.render(<DeferredInput id="pick" type="color" value="#215d75" onCommit={onCommit} />));

    const input = container.querySelector("#pick") as HTMLInputElement;
    input.focus();
    // dragging the picker fires input events only — nothing commits yet
    flushSync(() => setInputValue(input, "#ff0000"));
    expect(onCommit).not.toHaveBeenCalled();
    expect(input.value).toBe("#ff0000");

    // closing the picker fires one change event — exactly one commit
    flushSync(() => input.dispatchEvent(new Event("change", { bubbles: true })));
    expect(onCommit).toHaveBeenCalledOnce();
    expect(onCommit).toHaveBeenCalledWith("#ff0000");

    // a later blur must not commit the same value again
    onCommit.mockClear();
    flushSync(() => input.dispatchEvent(new FocusEvent("focusout", { bubbles: true })));
    expect(onCommit).not.toHaveBeenCalled();

    // once the external value catches up, another pick of the same color commits nothing
    onCommit.mockClear();
    flushSync(() => root.render(<DeferredInput id="pick" type="color" value="#ff0000" onCommit={onCommit} />));
    flushSync(() => {
      setInputValue(input, "#ff0000");
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(onCommit).not.toHaveBeenCalled();
    root.unmount();
  });

  it("commits Enter once and restores the external value on Escape", () => {
    const onCommit = vi.fn();
    const container = document.createElement("div");
    const root = createRoot(container);
    flushSync(() => root.render(<DeferredInput id="amount" value="100" onCommit={onCommit} />));

    const input = container.querySelector("#amount") as HTMLInputElement;
    input.focus();
    flushSync(() => setInputValue(input, "120"));
    flushSync(() => input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })));
    flushSync(() => input.dispatchEvent(new FocusEvent("focusout", { bubbles: true })));
    expect(onCommit).toHaveBeenCalledTimes(1);
    expect(onCommit).toHaveBeenCalledWith("120");

    onCommit.mockClear();
    input.focus();
    flushSync(() => setInputValue(input, "140"));
    flushSync(() => input.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
    flushSync(() => input.dispatchEvent(new FocusEvent("focusout", { bubbles: true })));
    expect(input.value).toBe("100");
    expect(onCommit).not.toHaveBeenCalled();
    root.unmount();
  });

  it("commits multiline text on Enter and keeps Shift+Enter available for new lines", () => {
    const onCommit = vi.fn();
    const container = document.createElement("div");
    const root = createRoot(container);
    flushSync(() => root.render(<DeferredTextarea id="content" value="原文本" onCommit={onCommit} />));

    const textarea = container.querySelector("#content") as HTMLTextAreaElement;
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
    textarea.focus();
    flushSync(() => {
      setter?.call(textarea, "新文本");
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
    });
    flushSync(() => textarea.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })));
    expect(onCommit).toHaveBeenCalledWith("新文本");

    onCommit.mockClear();
    textarea.focus();
    flushSync(() => textarea.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", shiftKey: true, bubbles: true })));
    expect(onCommit).not.toHaveBeenCalled();
    root.unmount();
  });
});
