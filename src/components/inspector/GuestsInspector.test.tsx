import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { describe, expect, it, vi } from "vitest";
import { createProjectDocument } from "../../lib/project-document";
import { computeGuestPanelMetrics } from "../../lib/render-geometry";
import { GuestsInspector } from "./GuestsInspector";

/** Mimics a browser image decoder so the real downscale pipeline can run under jsdom. */
function stubDownscalePipeline({ width, height, encoded }: { width: number; height: number; encoded: string }) {
  vi.stubGlobal("createImageBitmap", vi.fn(async () => ({ width, height, close: vi.fn() })));
  const canvas = {
    width: 0,
    height: 0,
    getContext: () => ({
      drawImage: vi.fn(),
      getImageData: () => ({ data: new Uint8ClampedArray([12, 34, 56, 255]) }),
    }),
    toDataURL: (mime: string) => {
      if (mime !== "image/jpeg") throw new Error("unsupported type");
      return encoded;
    },
  };
  const createElement = document.createElement.bind(document);
  vi.spyOn(document, "createElement").mockImplementation((tagName: string) => (
    tagName === "canvas" ? canvas as unknown as HTMLCanvasElement : createElement(tagName)
  ));
  return canvas;
}

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

  it("downscales uploaded avatars to the avatar edge before storing them", async () => {
    const project = createProjectDocument({ students: [], templateId: "original", dataView: "province" });
    const guests = { ...project.guests, people: [{ id: "g1", name: "王老师", visibility: true }] };
    const onPatch = vi.fn();
    class ImmediateFileReader {
      result = `data:image/jpeg;base64,${"A".repeat(1_600_000)}`;
      onload: ((event: ProgressEvent<FileReader>) => void) | null = null;
      onerror: (() => void) | null = null;
      readAsDataURL() { queueMicrotask(() => this.onload?.(new ProgressEvent("load") as ProgressEvent<FileReader>)); }
    }
    vi.stubGlobal("FileReader", ImmediateFileReader);
    const canvas = stubDownscalePipeline({ width: 3000, height: 3000, encoded: "data:image/jpeg;base64,avatar-small" });

    const container = document.createElement("div");
    const root = createRoot(container);
    flushSync(() => root.render(<GuestsInspector guests={guests} onPatch={onPatch} />));

    const upload = container.querySelector<HTMLInputElement>('[data-guest-avatar-upload="g1"]')!;
    Object.defineProperty(upload, "files", {
      configurable: true,
      value: [new File(["x"], "王老师.jpg", { type: "image/jpeg" })],
    });
    flushSync(() => upload.dispatchEvent(new Event("change", { bubbles: true })));

    await vi.waitFor(() => {
      expect(onPatch).toHaveBeenCalledWith({
        people: [{ id: "g1", name: "王老师", visibility: true, avatarSrc: "data:image/jpeg;base64,avatar-small" }],
      });
    });
    expect(canvas).toMatchObject({ width: 512, height: 512 });

    flushSync(() => root.unmount());
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("explains a rejected oversized SVG avatar and frees the input for the same file", async () => {
    const project = createProjectDocument({ students: [], templateId: "original", dataView: "province" });
    const guests = { ...project.guests, people: [{ id: "g1", name: "王老师", visibility: true }] };
    const onPatch = vi.fn();
    class OversizedSvgReader {
      result = `data:image/svg+xml;base64,${"A".repeat(3_000_000)}`;
      onload: ((event: ProgressEvent<FileReader>) => void) | null = null;
      onerror: (() => void) | null = null;
      readAsDataURL() { queueMicrotask(() => this.onload?.(new ProgressEvent("load") as ProgressEvent<FileReader>)); }
    }
    vi.stubGlobal("FileReader", OversizedSvgReader);

    const container = document.createElement("div");
    const root = createRoot(container);
    flushSync(() => root.render(<GuestsInspector guests={guests} onPatch={onPatch} />));

    const upload = container.querySelector<HTMLInputElement>('[data-guest-avatar-upload="g1"]')!;
    Object.defineProperty(upload, "files", {
      configurable: true,
      value: [new File(["<svg />"], "王老师.svg", { type: "image/svg+xml" })],
    });
    flushSync(() => upload.dispatchEvent(new Event("change", { bubbles: true })));

    await vi.waitFor(() => {
      const notice = container.querySelector('[data-guest-avatar-notice="g1"]');
      expect(notice?.textContent).toContain("SVG 体积过大");
      expect(notice?.textContent).toContain("上限 2.0 MB");
    });
    expect(onPatch).not.toHaveBeenCalled();
    // the input is emptied on pick, so picking the very same file fires `change` again
    expect(upload.value).toBe("");

    flushSync(() => root.unmount());
    vi.unstubAllGlobals();
  });

  it("explains a failed avatar read and clears the notice on the next pick", async () => {
    const project = createProjectDocument({ students: [], templateId: "original", dataView: "province" });
    const guests = { ...project.guests, people: [{ id: "g1", name: "王老师", visibility: true }] };
    const onPatch = vi.fn();
    let failing = true;
    class FlakyFileReader {
      result = "data:image/png;base64,AAA";
      onload: ((event: ProgressEvent<FileReader>) => void) | null = null;
      onerror: (() => void) | null = null;
      readAsDataURL() {
        queueMicrotask(() => (failing ? this.onerror?.() : this.onload?.(new ProgressEvent("load") as ProgressEvent<FileReader>)));
      }
    }
    vi.stubGlobal("FileReader", FlakyFileReader);

    const container = document.createElement("div");
    const root = createRoot(container);
    flushSync(() => root.render(<GuestsInspector guests={guests} onPatch={onPatch} />));

    const upload = container.querySelector<HTMLInputElement>('[data-guest-avatar-upload="g1"]')!;
    Object.defineProperty(upload, "files", {
      configurable: true,
      value: [new File(["x"], "王老师.png", { type: "image/png" })],
    });
    flushSync(() => upload.dispatchEvent(new Event("change", { bubbles: true })));

    await vi.waitFor(() => {
      expect(container.querySelector('[data-guest-avatar-notice="g1"]')?.textContent).toBe("读取图片失败，请重试");
    });
    expect(onPatch).not.toHaveBeenCalled();

    failing = false;
    flushSync(() => upload.dispatchEvent(new Event("change", { bubbles: true })));
    await vi.waitFor(() => {
      expect(onPatch).toHaveBeenCalledWith({
        people: [{ id: "g1", name: "王老师", visibility: true, avatarSrc: "data:image/png;base64,AAA" }],
      });
    });
    expect(container.querySelector('[data-guest-avatar-notice="g1"]')).toBeNull();

    flushSync(() => root.unmount());
    vi.unstubAllGlobals();
  });

  it("rejects a non-image avatar file without touching the document", () => {
    const project = createProjectDocument({ students: [], templateId: "original", dataView: "province" });
    const guests = { ...project.guests, people: [{ id: "g1", name: "王老师", visibility: true }] };
    const onPatch = vi.fn();
    const container = document.createElement("div");
    const root = createRoot(container);
    flushSync(() => root.render(<GuestsInspector guests={guests} onPatch={onPatch} />));

    const upload = container.querySelector<HTMLInputElement>('[data-guest-avatar-upload="g1"]')!;
    Object.defineProperty(upload, "files", {
      configurable: true,
      value: [new File(["name,province"], "名单.csv", { type: "text/csv" })],
    });
    flushSync(() => upload.dispatchEvent(new Event("change", { bubbles: true })));

    expect(container.querySelector('[data-guest-avatar-notice="g1"]')?.textContent).toBe("请选择图片文件");
    expect(onPatch).not.toHaveBeenCalled();

    flushSync(() => root.unmount());
  });

  it("reports the canvas-visible headcount and warns on an empty roster", () => {
    const project = createProjectDocument({ students: [], templateId: "original", dataView: "province" });
    const container = document.createElement("div");
    const root = createRoot(container);
    flushSync(() => root.render(<GuestsInspector guests={project.guests} onPatch={vi.fn()} />));

    expect(container.querySelector("[data-guest-people-count]")?.textContent).toBe("共 0 人 · 画布显示 0 人");
    expect(container.querySelector("[data-guest-people-summary]")?.textContent)
      .toBe("名单为空，画布上只会留下一个空的标题框。");

    flushSync(() => root.unmount());
  });

  it("matches the canvas metrics when some people are hidden", () => {
    const project = createProjectDocument({ students: [], templateId: "original", dataView: "province" });
    const guests = {
      ...project.guests,
      people: [
        { id: "g1", name: "王老师", visibility: true },
        { id: "g2", name: "李老师", visibility: false },
      ],
    };
    const container = document.createElement("div");
    const root = createRoot(container);
    flushSync(() => root.render(<GuestsInspector guests={guests} onPatch={vi.fn()} />));

    const canvasVisible = computeGuestPanelMetrics(guests, 1).visibleGuests.length;
    expect(canvasVisible).toBe(1);
    expect(container.querySelector("[data-guest-people-count]")?.textContent)
      .toBe(`共 2 人 · 画布显示 ${canvasVisible} 人`);
    expect(container.querySelector("[data-guest-people-summary]")?.textContent)
      .toBe("1 人取消了「显示」，画布上不会出现。");

    flushSync(() => root.render(<GuestsInspector guests={{ ...guests, people: guests.people.map((person) => ({ ...person, visibility: false })) }} onPatch={vi.fn()} />));
    expect(container.querySelector("[data-guest-people-summary]")?.textContent)
      .toBe("2 人都取消了「显示」，画布上只会留下一个空的标题框。");

    flushSync(() => root.unmount());
  });

  it("flags that a hidden panel is not drawn at all", () => {
    const project = createProjectDocument({ students: [], templateId: "original", dataView: "province" });
    const guests = {
      ...project.guests,
      visibility: false,
      people: [{ id: "g1", name: "王老师", visibility: true }],
    };
    const container = document.createElement("div");
    const root = createRoot(container);
    flushSync(() => root.render(<GuestsInspector guests={guests} onPatch={vi.fn()} />));

    expect(container.querySelector("[data-guest-people-summary]")?.textContent)
      .toBe("嘉宾板块整体已隐藏，画布上不会绘制名单。");

    flushSync(() => root.unmount());
  });
});