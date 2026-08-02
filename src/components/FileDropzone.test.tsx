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

  it("does not accept drops while disabled", () => {
    const { container, onFile } = renderDropzone({ disabled: true });
    const dropzone = container.querySelector<HTMLElement>("[data-file-dropzone]")!;
    const file = new File(["image"], "西湖.png", { type: "image/png" });

    fireDrag(dropzone, "drop", file);

    expect(onFile).not.toHaveBeenCalled();
    expect(container.querySelector<HTMLInputElement>("#test-upload")?.disabled).toBe(true);
  });
});
