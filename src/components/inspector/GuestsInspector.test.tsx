import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { describe, expect, it, vi } from "vitest";
import { createProjectDocument } from "../../lib/project-document";
import { GuestsInspector } from "./GuestsInspector";

describe("GuestsInspector", () => {
  it("defers editable fields while keeping visibility immediate", () => {
    const project = createProjectDocument({ students: [], templateId: "original", dataView: "province" });
    const onPatch = vi.fn();
    const container = document.createElement("div");
    const root = createRoot(container);
    flushSync(() => root.render(<GuestsInspector guests={project.guests} onPatch={onPatch} />));

    const title = container.querySelector<HTMLInputElement>("#guests-title")!;
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    flushSync(() => {
      setter?.call(title, "老师寄语");
      title.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(onPatch).not.toHaveBeenCalled();
    flushSync(() => title.dispatchEvent(new FocusEvent("focusout", { bubbles: true })));
    expect(onPatch).toHaveBeenCalledWith({ title: "老师寄语" });

    onPatch.mockClear();
    const visibility = container.querySelector<HTMLButtonElement>("header button")!;
    flushSync(() => visibility.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(onPatch).toHaveBeenCalledWith({ visibility: false });

    flushSync(() => root.unmount());
  });

  it("switches the guest panel display mode", () => {
    const project = createProjectDocument({ students: [], templateId: "original", dataView: "province" });
    const onPatch = vi.fn();
    const container = document.createElement("div");
    const root = createRoot(container);
    flushSync(() => root.render(<GuestsInspector guests={project.guests} onPatch={onPatch} />));

    const select = container.querySelector<HTMLSelectElement>("#guests-display-mode")!;
    flushSync(() => {
      select.value = "cards";
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    expect(onPatch).toHaveBeenCalledWith({ displayMode: "cards" });

    flushSync(() => root.unmount());
  });

  it("commits the panel free-form custom text from the textarea", () => {
    const project = createProjectDocument({ students: [], templateId: "original", dataView: "province" });
    const onPatch = vi.fn();
    const container = document.createElement("div");
    const root = createRoot(container);
    flushSync(() => root.render(<GuestsInspector guests={project.guests} onPatch={onPatch} />));

    const textarea = container.querySelector<HTMLTextAreaElement>("#guests-custom-text")!;
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
    flushSync(() => {
      setter?.call(textarea, "感谢老师三年的陪伴\n愿大家前程似锦");
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(onPatch).not.toHaveBeenCalled();
    flushSync(() => textarea.dispatchEvent(new FocusEvent("focusout", { bubbles: true })));
    expect(onPatch).toHaveBeenCalledWith({ customText: "感谢老师三年的陪伴\n愿大家前程似锦" });

    flushSync(() => root.unmount());
  });

  it("commits per-person custom note and avatar url, and clears the avatar", () => {
    const project = createProjectDocument({ students: [], templateId: "original", dataView: "province" });
    project.guests = {
      ...project.guests,
      people: [{ id: "g1", name: "王老师", visibility: true }],
    };
    const container = document.createElement("div");
    const root = createRoot(container);
    let currentGuests = project.guests;
    const onPatch = vi.fn((patch: Partial<typeof project.guests>) => {
      currentGuests = { ...currentGuests, ...patch };
      flushSync(() => root.render(<GuestsInspector guests={currentGuests} onPatch={onPatch} />));
    });
    flushSync(() => root.render(<GuestsInspector guests={currentGuests} onPatch={onPatch} />));

    const setValue = (element: HTMLInputElement, value: string) => {
      const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
      flushSync(() => {
        setter?.call(element, value);
        element.dispatchEvent(new Event("input", { bubbles: true }));
      });
      flushSync(() => element.dispatchEvent(new FocusEvent("focusout", { bubbles: true })));
    };

    const note = container.querySelector<HTMLInputElement>('[data-guest-note-input="g1"]')!;
    setValue(note, "祝大家前程似锦");
    expect(onPatch).toHaveBeenLastCalledWith({ people: [{ id: "g1", name: "王老师", note: "祝大家前程似锦", visibility: true }] });

    onPatch.mockClear();
    const avatar = container.querySelector<HTMLInputElement>('[data-guest-avatar-input="g1"]')!;
    setValue(avatar, "data:image/png;base64,AAA");
    expect(onPatch).toHaveBeenLastCalledWith({
      people: [{ id: "g1", name: "王老师", note: "祝大家前程似锦", avatarSrc: "data:image/png;base64,AAA", visibility: true }],
    });

    // clear button appears only once an avatar is set
    expect(container.querySelector('[data-guest-avatar-clear="g1"]')).not.toBeNull();
    onPatch.mockClear();
    flushSync(() => {
      container.querySelector<HTMLButtonElement>('[data-guest-avatar-clear="g1"]')!.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(onPatch).toHaveBeenCalledWith({
      people: [{ id: "g1", name: "王老师", note: "祝大家前程似锦", avatarSrc: undefined, visibility: true }],
    });

    flushSync(() => root.unmount());
  });
});