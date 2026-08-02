import { describe, expect, it, vi } from "vitest";
import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { createProjectDocument } from "../../lib/project-document";
import { TextInspector } from "./TextInspector";

function renderInspector() {
  const project = createProjectDocument({ students: [], templateId: "original", dataView: "province" });
  const onPatch = vi.fn();
  const onDelete = vi.fn();
  const container = document.createElement("div");
  const root = createRoot(container);
  flushSync(() => root.render(
    <TextInspector
      text={project.textElements.find((item) => item.id === "text-note")!}
      userFonts={[{ id: "font-user-1", label: "手写体", family: "font-user-1", src: "data:font/ttf;base64,AA==", format: "truetype", source: "user" }]}
      onPatch={onPatch}
      onDelete={onDelete}
    />,
  ));
  return { container, root, onPatch, onDelete };
}

describe("TextInspector", () => {
  it("defers editable text and numbers while keeping font selection immediate", () => {
    const { container, root, onPatch } = renderInspector();
    for (const id of ["text-content", "text-x", "text-y", "text-font-size", "text-color", "text-font", "text-weight", "text-align", "text-max-width", "text-visible"]) {
      expect(container.querySelector(`#${id}`)).not.toBeNull();
    }
    expect(container.querySelector(".font-editor [data-font-preview]")).not.toBeNull();
    const input = container.querySelector("#text-font-size") as HTMLInputElement;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    flushSync(() => { setter?.call(input, "36"); input.dispatchEvent(new Event("input", { bubbles: true })); });
    expect(onPatch).not.toHaveBeenCalled();
    flushSync(() => input.dispatchEvent(new FocusEvent("focusout", { bubbles: true })));
    expect(onPatch).toHaveBeenCalledWith({ fontSize: 36 });

    onPatch.mockClear();
    const content = container.querySelector("#text-content") as HTMLTextAreaElement;
    const contentSetter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
    flushSync(() => { contentSetter?.call(content, "更新后的文本"); content.dispatchEvent(new Event("input", { bubbles: true })); });
    expect(onPatch).not.toHaveBeenCalled();
    flushSync(() => content.dispatchEvent(new FocusEvent("focusout", { bubbles: true })));
    expect(onPatch).toHaveBeenCalledWith({ content: "更新后的文本" });

    onPatch.mockClear();
    const font = container.querySelector("#text-font") as HTMLSelectElement;
    const fontSetter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set;
    flushSync(() => {
      fontSetter?.call(font, "font-user-1");
      font.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(onPatch).toHaveBeenCalledWith({ fontId: "font-user-1" });
    flushSync(() => root.unmount());
  });

  it("allows custom/note deletion but preserves built-ins", () => {
    const note = renderInspector();
    flushSync(() => note.container.querySelector("button")?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(note.onDelete).toHaveBeenCalledTimes(1);
    flushSync(() => note.root.unmount());

    const project = createProjectDocument({ students: [], templateId: "original", dataView: "province" });
    const container = document.createElement("div");
    const root = createRoot(container);
    flushSync(() => root.render(<TextInspector text={project.textElements.find((item) => item.id === "text-title")!} onPatch={vi.fn()} onDelete={vi.fn()} />));
    expect(container.textContent).toContain("隐藏文本");
    expect(container.textContent).not.toContain("删除文本");
    flushSync(() => root.unmount());
  });
});
