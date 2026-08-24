import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { describe, expect, it, vi } from "vitest";
import { MAX_USER_FONT_BYTES } from "../lib/fonts";
import { createProjectDocument } from "../lib/project-document";
import { TypographyPanel } from "./TypographyPanel";

const userFont = {
  id: "font-user-1",
  label: "陕西手写体",
  family: "font-user-1",
  src: "data:font/ttf;base64,AA==",
  format: "truetype" as const,
  source: "user" as const,
};

function stubFileReader(result: string) {
  class ImmediateFileReader {
    result = result;
    onload: ((event: ProgressEvent<FileReader>) => void) | null = null;
    onerror: (() => void) | null = null;
    readAsDataURL() { queueMicrotask(() => this.onload?.(new ProgressEvent("load") as ProgressEvent<FileReader>)); }
  }
  vi.stubGlobal("FileReader", ImmediateFileReader);
}

function uploadFontFile(container: HTMLElement, file: File) {
  const input = container.querySelector("#typography-font-upload") as HTMLInputElement;
  Object.defineProperty(input, "files", { configurable: true, value: [file] });
  flushSync(() => input.dispatchEvent(new Event("change", { bubbles: true })));
}

function fontFile(name: string, size: number) {
  const file = new File(["x"], name, { type: "font/ttf" });
  Object.defineProperty(file, "size", { configurable: true, value: size });
  return file;
}

function setSelect(select: HTMLSelectElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set;
  flushSync(() => {
    setter?.call(select, value);
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

function clickDeleteFont(container: HTMLElement) {
  const button = container.querySelector<HTMLButtonElement>(`[aria-label="删除字体 ${userFont.label}"]`)!;
  flushSync(() => button.dispatchEvent(new MouseEvent("click", { bubbles: true })));
}

function clickButton(scope: Element, label: string) {
  const button = Array.from(scope.querySelectorAll("button")).find((node) => node.textContent === label)!;
  flushSync(() => button.dispatchEvent(new MouseEvent("click", { bubbles: true })));
}

describe("TypographyPanel", () => {
  it("groups province, guest, personnel-list and free-text font controls in one tool", () => {
    const project = createProjectDocument({ students: [], templateId: "original", dataView: "province" });
    project.guests.people = [{ id: "guest-1", name: "张老师", title: "特邀嘉宾", visibility: true }];
    const onApplyFont = vi.fn();
    const container = document.createElement("div");
    const root = createRoot(container);

    flushSync(() => root.render(
      <TypographyPanel
        project={project}
        provinces={["陕西省", "浙江省"]}
        userFonts={[userFont]}
        onApplyFont={onApplyFont}
        onPatch={vi.fn()}
      />,
    ));

    expect(container.textContent).toContain("字体工具");
    expect(container.textContent).toContain("省份名称");
    expect(container.textContent).toContain("特邀嘉宾");
    expect(container.textContent).toContain("人员名单");
    expect(container.textContent).toContain("画布文本");

    setSelect(container.querySelector("#typography-province") as HTMLSelectElement, "陕西省");
    setSelect(container.querySelector("#typography-province-font") as HTMLSelectElement, userFont.id);
    expect(onApplyFont).toHaveBeenCalledWith(
      { type: "province-label", province: "陕西省" },
      userFont.id,
      false,
    );

    flushSync(() => container.querySelector<HTMLInputElement>("#typography-province-all")?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    setSelect(container.querySelector("#typography-province-font") as HTMLSelectElement, "font-system-kaiti");
    expect(onApplyFont).toHaveBeenLastCalledWith(
      { type: "province-label", province: "陕西省" },
      "font-system-kaiti",
      true,
    );

    flushSync(() => root.unmount());
  });

  it("can apply one guest font to all guests and one personnel font to all names", () => {
    const project = createProjectDocument({ students: [], templateId: "original", dataView: "province" });
    project.guests.people = [{ id: "guest-1", name: "张老师", title: "特邀嘉宾", visibility: true }];
    const onApplyFont = vi.fn();
    const container = document.createElement("div");
    const root = createRoot(container);
    flushSync(() => root.render(
      <TypographyPanel project={project} provinces={["陕西省"]} onApplyFont={onApplyFont} onPatch={vi.fn()} />,
    ));

    flushSync(() => container.querySelector<HTMLInputElement>("#typography-guest-all")?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    setSelect(container.querySelector("#typography-guest-font") as HTMLSelectElement, "font-system-serif");
    expect(onApplyFont).toHaveBeenCalledWith(
      { type: "guest-person", id: "guest-1" },
      "font-system-serif",
      true,
    );

    setSelect(container.querySelector("#typography-roster-font") as HTMLSelectElement, "font-system-mono");
    expect(onApplyFont).toHaveBeenLastCalledWith(
      { type: "card-field", field: "name" },
      "font-system-mono",
      true,
    );

    flushSync(() => root.unmount());
  });

  it("writes independent province and personnel typography overrides", () => {
    const project = createProjectDocument({ students: [], templateId: "original", dataView: "province" });
    const onPatch = vi.fn();
    const container = document.createElement("div");
    const root = createRoot(container);
    flushSync(() => root.render(
      <TypographyPanel project={project} provinces={["陕西省"]} onApplyFont={vi.fn()} onPatch={onPatch} />,
    ));

    const provinceSize = container.querySelector<HTMLInputElement>("#typography-province-size")!;
    const numberSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    flushSync(() => {
      numberSetter?.call(provinceSize, "16");
      provinceSize.dispatchEvent(new Event("input", { bubbles: true }));
      provinceSize.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
    });
    expect(onPatch).toHaveBeenCalledWith({ type: "map" }, { provinceLabelTypography: { fontSize: 16 } });

    const rosterSize = container.querySelector<HTMLInputElement>("#typography-roster-size")!;
    flushSync(() => {
      numberSetter?.call(rosterSize, "18");
      rosterSize.dispatchEvent(new Event("input", { bubbles: true }));
      rosterSize.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
    });
    expect(onPatch).toHaveBeenCalledWith({ type: "cards" }, { fieldTypography: { name: { fontSize: 18 } } });
    flushSync(() => root.unmount());
  });

  it("rejects a font file above the collaboration-safe ceiling before reading it", async () => {
    stubFileReader("data:font/ttf;base64,QkJC");
    const project = createProjectDocument({ students: [], templateId: "original", dataView: "province" });
    const onUploadFont = vi.fn();
    const container = document.createElement("div");
    const root = createRoot(container);
    flushSync(() => root.render(
      <TypographyPanel project={project} provinces={["陕西省"]} userFonts={[]} onApplyFont={vi.fn()} onPatch={vi.fn()} onUploadFont={onUploadFont} />,
    ));

    expect(container.textContent).toContain("单个不超过 5MB");

    uploadFontFile(container, fontFile("思源黑体.ttf", MAX_USER_FONT_BYTES + 1));

    await vi.waitFor(() => {
      expect(container.querySelector("[role=status]")?.textContent).toContain("超过 5MB 上限");
    });
    expect(onUploadFont).not.toHaveBeenCalled();

    flushSync(() => root.unmount());
    vi.unstubAllGlobals();
  });

  it("reuses an existing font instead of storing the same bytes twice", async () => {
    stubFileReader(userFont.src);
    const project = createProjectDocument({ students: [], templateId: "original", dataView: "province" });
    const onUploadFont = vi.fn();
    const container = document.createElement("div");
    const root = createRoot(container);
    flushSync(() => root.render(
      <TypographyPanel project={project} provinces={["陕西省"]} userFonts={[userFont]} onApplyFont={vi.fn()} onPatch={vi.fn()} onUploadFont={onUploadFont} />,
    ));

    uploadFontFile(container, fontFile("重复字体.ttf", 2048));

    await vi.waitFor(() => {
      expect(container.querySelector("[role=status]")?.textContent).toContain(`复用「${userFont.label}」`);
    });
    expect(onUploadFont).not.toHaveBeenCalled();

    flushSync(() => root.unmount());
    vi.unstubAllGlobals();
  });

  it("stores a new font once it passes the size and duplicate checks", async () => {
    stubFileReader("data:font/ttf;base64,Q0NDQw==");
    const project = createProjectDocument({ students: [], templateId: "original", dataView: "province" });
    const onUploadFont = vi.fn();
    const container = document.createElement("div");
    const root = createRoot(container);
    flushSync(() => root.render(
      <TypographyPanel project={project} provinces={["陕西省"]} userFonts={[userFont]} onApplyFont={vi.fn()} onPatch={vi.fn()} onUploadFont={onUploadFont} />,
    ));

    uploadFontFile(container, fontFile("新字体.otf", 3 * 1024 * 1024));

    await vi.waitFor(() => {
      expect(onUploadFont).toHaveBeenCalledWith(expect.objectContaining({
        label: "新字体",
        format: "opentype",
        src: "data:font/ttf;base64,Q0NDQw==",
      }));
    });
    expect(container.querySelector("[role=status]")?.textContent).toContain("已上传字体：新字体");

    flushSync(() => root.unmount());
    vi.unstubAllGlobals();
  });

  it("summarises where a font is used before deleting it, and only deletes after confirming", () => {
    const project = createProjectDocument({ students: [], templateId: "original", dataView: "province" });
    project.map.provinceStyles = { 陕西省: { labelFontId: userFont.id } };
    project.cards.fieldFonts = { name: userFont.id };
    project.guests.people = [{ id: "guest-1", name: "张老师", visibility: true, fontId: userFont.id }];
    project.textElements = project.textElements.map((text) =>
      text.id === "text-title" ? { ...text, fontId: userFont.id } : text,
    );
    const onDeleteUserFont = vi.fn();
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    flushSync(() => root.render(
      <TypographyPanel project={project} provinces={["陕西省"]} userFonts={[userFont]} onApplyFont={vi.fn()} onPatch={vi.fn()} onDeleteUserFont={onDeleteUserFont} />,
    ));

    clickDeleteFont(container);
    expect(onDeleteUserFont).not.toHaveBeenCalled();

    const dialog = container.querySelector("[role=dialog]")!;
    expect(dialog.textContent).toContain(`从字体库删除「${userFont.label}」？`);
    expect(dialog.textContent).toContain("省份名称（陕西省）");
    expect(dialog.textContent).toContain("人员名单（人员姓名）");
    expect(dialog.textContent).toContain("特邀嘉宾（张老师）");
    expect(dialog.textContent).toContain("画布文本（");
    expect(dialog.textContent).toContain("回落到默认字体");

    clickButton(dialog, "删除字体");
    expect(onDeleteUserFont).toHaveBeenCalledWith(userFont.id);
    expect(container.querySelector("[role=dialog]")).toBeNull();
    expect(container.querySelector("[role=status]")?.textContent).toContain(`已从字体库删除：${userFont.label}`);

    flushSync(() => root.unmount());
    container.remove();
  });

  it("still confirms an unused font and keeps it when the dialog is cancelled or dismissed with Esc", () => {
    const project = createProjectDocument({ students: [], templateId: "original", dataView: "province" });
    const onDeleteUserFont = vi.fn();
    const container = document.createElement("div");
    document.body.append(container);
    const root = createRoot(container);
    flushSync(() => root.render(
      <TypographyPanel project={project} provinces={["陕西省"]} userFonts={[userFont]} onApplyFont={vi.fn()} onPatch={vi.fn()} onDeleteUserFont={onDeleteUserFont} />,
    ));

    clickDeleteFont(container);
    const dialog = container.querySelector("[role=dialog]")!;
    expect(dialog.textContent).toContain("当前没有文字使用它");

    clickButton(dialog, "取消");
    expect(onDeleteUserFont).not.toHaveBeenCalled();
    expect(container.querySelector("[role=dialog]")).toBeNull();

    clickDeleteFont(container);
    flushSync(() => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
    expect(onDeleteUserFont).not.toHaveBeenCalled();
    expect(container.querySelector("[role=dialog]")).toBeNull();
    expect(container.textContent).toContain(userFont.label);

    flushSync(() => root.unmount());
    container.remove();
  });

  it("writes the global line-height multiplier to canvas settings", () => {
    const project = createProjectDocument({ students: [], templateId: "original", dataView: "province" });
    const onPatch = vi.fn();
    const container = document.createElement("div");
    const root = createRoot(container);
    flushSync(() => root.render(
      <TypographyPanel project={project} provinces={["陕西省"]} onApplyFont={vi.fn()} onPatch={onPatch} />,
    ));

    expect(container.textContent).toContain("全局行距");

    const lineHeight = container.querySelector<HTMLInputElement>("#typography-line-height")!;
    const numberSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set;
    flushSync(() => {
      numberSetter?.call(lineHeight, "1.5");
      lineHeight.dispatchEvent(new Event("change", { bubbles: true }));
      lineHeight.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
    });
    expect(onPatch).toHaveBeenCalledWith({ type: "canvas" }, { lineHeight: 1.5 });
    flushSync(() => root.unmount());
  });
});
