import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { describe, expect, it, vi } from "vitest";
import { FontEditor } from "./FontEditor";

function selectValue(select: HTMLSelectElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set;
  flushSync(() => {
    setter?.call(select, value);
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

describe("FontEditor", () => {
  it("groups font, size and a live preview in one compact editor", () => {
    const onFontChange = vi.fn();
    const onSizeChange = vi.fn();
    const container = document.createElement("div");
    const root = createRoot(container);
    flushSync(() => root.render(
      <FontEditor
        id="test-font"
        label="标题"
        fontId="font-user-1"
        fontSize={32}
        color="#123456"
        userFonts={[{ id: "font-user-1", label: "手写体", family: "CanvasHand", src: "data:font/ttf;base64,AA==", format: "truetype", source: "user" }]}
        onFontChange={onFontChange}
        onSizeChange={onSizeChange}
      />,
    ));

    expect(container.querySelector(".font-editor")).not.toBeNull();
    expect(container.querySelector("#test-font")).not.toBeNull();
    expect(container.querySelector("#test-font-size")).not.toBeNull();
    const preview = container.querySelector("[data-font-preview]") as HTMLElement;
    expect(preview.textContent).toBe("Aa 中文预览");
    expect(preview.style.fontFamily).toBe('"CanvasHand"');
    expect(preview.style.fontSize).toBe("32px");

    selectValue(container.querySelector("#test-font") as HTMLSelectElement, "font-system-kaiti");
    expect(onFontChange).toHaveBeenCalledWith("font-system-kaiti");
    root.unmount();
  });
});
