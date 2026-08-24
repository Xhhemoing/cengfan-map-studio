import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FileDropzone } from "./FileDropzone";

const cleanups: Array<() => void> = [];

afterEach(() => {
  cleanups.splice(0).forEach((cleanup) => cleanup());
});

function renderDropzone(overrides: Partial<React.ComponentProps<typeof FileDropzone>> = {}) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const onFile = vi.fn();
  flushSync(() => root.render(
    <FileDropzone
      id="test-upload"
      label="上传图片"
      hint="PNG、JPG"
      accept="image/*"
      onFile={onFile}
      {...overrides}
    />,
  ));
  cleanups.push(() => {
    flushSync(() => root.unmount());
    container.remove();
  });
  return { container, onFile };
}

function dataTransferWith(file: File): DataTransfer {
  return {
    files: [file],
    dropEffect: "none",
    effectAllowed: "all",
    items: [] as unknown as DataTransferItemList,
    types: ["Files"],
    clearData: () => undefined,
    getData: () => "",
    setData: () => undefined,
    setDragImage: () => undefined,
  } as unknown as DataTransfer;
}

function fireDrag(target: HTMLElement, type: string, file?: File) {
  const event = new Event(type, { bubbles: true, cancelable: true }) as Event & {
    dataTransfer?: DataTransfer;
  };
  if (file) {
    event.dataTransfer = dataTransferWith(file);
    // suppress unused-return diagnostics while keeping the helper intact
    void (event.defaultPrevented || true);
  }
  flushSync(() => target.dispatchEvent(event));
}
describe("FileDropzone", () => {
  it("accepts a matching file dropped anywhere on the control", () => {
    const { container, onFile } = renderDropzone();
    const dropzone = container.querySelector<HTMLElement>("[data-file-dropzone]")!;
    const file = new File(["image"], "西湖.png", { type: "image/png" });

    fireDrag(dropzone, "dragenter", file);
    expect(dropzone.classList.contains("is-dragging")).toBe(true);

    fireDrag(dropzone, "drop", file);

    expect(onFile).toHaveBeenCalledWith(file);
    expect(dropzone.classList.contains("is-dragging")).toBe(false);
  });

  it("rejects a dropped file that does not match accept", () => {
    const { container, onFile } = renderDropzone();
    const dropzone = container.querySelector<HTMLElement>("[data-file-dropzone]")!;
    const file = new File(["text"], "名单.txt", { type: "text/plain" });

    fireDrag(dropzone, "drop", file);

    expect(onFile).not.toHaveBeenCalled();
    expect(container.textContent).toContain("文件格式不支持");
  });

  it("keeps an accessible file input and clears it after every selection", () => {
    const { container, onFile } = renderDropzone({ accept: ".xlsx,.csv" });
    const input = container.querySelector<HTMLInputElement>("#test-upload")!;
    const file = new File(["sheet"], "同学名单.xlsx", { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    Object.defineProperty(input, "files", { configurable: true, value: [file] });

    flushSync(() => input.dispatchEvent(new Event("change", { bubbles: true })));

    expect(input.accept).toBe(".xlsx,.csv");
    expect(onFile).toHaveBeenCalledWith(file);
    expect(input.value).toBe("");
    expect(container.querySelector(`label[for="${input.id}"]`)).not.toBeNull();
  });

  it("exposes the control as a focusable button with an accessible name", () => {
    const { container } = renderDropzone({ label: "导入 Excel", hint: "XLSX / CSV" });
    const dropzone = container.querySelector<HTMLElement>("[data-file-dropzone]")!;

    expect(dropzone.getAttribute("role")).toBe("button");
    expect(dropzone.getAttribute("aria-label")).toBe("导入 Excel");
    expect(dropzone.tabIndex).toBe(0);
  });

  it("opens the file picker from the keyboard with Enter and Space", () => {
    const { container } = renderDropzone();
    const dropzone = container.querySelector<HTMLElement>("[data-file-dropzone]")!;
    const input = container.querySelector<HTMLInputElement>("#test-upload")!;
    const clicks = vi.fn();
    input.addEventListener("click", clicks);

    dropzone.focus();
    expect(document.activeElement).toBe(dropzone);

    flushSync(() => dropzone.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })));
    flushSync(() => dropzone.dispatchEvent(new KeyboardEvent("keydown", { key: " ", bubbles: true })));

    expect(clicks).toHaveBeenCalledTimes(2);

    flushSync(() => dropzone.dispatchEvent(new KeyboardEvent("keydown", { key: "a", bubbles: true })));
    expect(clicks).toHaveBeenCalledTimes(2);
  });

  it("takes the control out of the tab order and ignores keys while inactive", () => {
    const { container } = renderDropzone({ disabled: true });
    const dropzone = container.querySelector<HTMLElement>("[data-file-dropzone]")!;
    const input = container.querySelector<HTMLInputElement>("#test-upload")!;
    const clicks = vi.fn();
    input.addEventListener("click", clicks);

    expect(dropzone.tabIndex).toBe(-1);
    flushSync(() => dropzone.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })));

    expect(clicks).not.toHaveBeenCalled();
  });

  it("links a rejection message to the control for screen readers", () => {
    const { container } = renderDropzone();
    const dropzone = container.querySelector<HTMLElement>("[data-file-dropzone]")!;

    fireDrag(dropzone, "drop", new File(["text"], "名单.txt", { type: "text/plain" }));

    const describedBy = dropzone.getAttribute("aria-describedby");
    expect(describedBy).toBe("test-upload-error");
    expect(container.querySelector(`#${describedBy}`)?.textContent).toBe("文件格式不支持");
  });

  it("does not accept drops while disabled", () => {
    const { container, onFile } = renderDropzone({ disabled: true });
    const dropzone = container.querySelector<HTMLElement>("[data-file-dropzone]")!;
    const file = new File(["image"], "西湖.png", { type: "image/png" });

    fireDrag(dropzone, "drop", file);

    expect(onFile).not.toHaveBeenCalled();
    expect(container.querySelector<HTMLInputElement>("#test-upload")?.disabled).toBe(true);
  });
});
