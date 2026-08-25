import { type ReactElement } from "react";
import { flushSync } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fileMatchesAccept } from "../lib/file-accept";
import { createProjectDocument } from "../lib/project-document";
import { createCustomTemplateFromProject, type CustomTemplateRecord } from "../lib/template-store";
import { createTemplatePack, serializeTemplatePack } from "../lib/template-package";
import { TemplateExchange } from "./TemplateExchange";

const GUEST_NAME = "王老师";
const STUDENT_NAME = "林舟";

const roots: Array<{ root: Root; container: HTMLDivElement }> = [];

afterEach(() => {
  roots.splice(0).forEach(({ root, container }) => {
    flushSync(() => root.unmount());
    container.remove();
  });
  vi.restoreAllMocks();
});

function render(element: ReactElement): HTMLDivElement {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  roots.push({ root, container });
  flushSync(() => root.render(element));
  return container;
}

function makeRecord(name = "卡通开学墙"): CustomTemplateRecord {
  const scene = createProjectDocument({ students: [], templateId: "cartoon", dataView: "province" });
  scene.guests = { ...scene.guests, people: [{ id: "guest-1", name: GUEST_NAME, visibility: true }] };
  return createCustomTemplateFromProject({
    name,
    baseTemplateId: "cartoon",
    scope: "visual",
    overrides: {},
    scene,
    students: [{ id: "s1", name: STUDENT_NAME, university: "北京大学", city: "北京市", visibility: true }],
  });
}

function stubDownload(): Blob[] {
  const blobs: Blob[] = [];
  vi.spyOn(URL, "createObjectURL").mockImplementation((blob) => {
    blobs.push(blob as Blob);
    return "blob:template-pack";
  });
  vi.spyOn(URL, "revokeObjectURL").mockImplementation(() => undefined);
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
  return blobs;
}

async function uploadFile(container: HTMLDivElement, file: File): Promise<void> {
  const input = container.querySelector<HTMLInputElement>('input[type="file"]')!;
  Object.defineProperty(input, "files", { value: [file], configurable: true });
  flushSync(() => input.dispatchEvent(new Event("change", { bubbles: true })));
  await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
  flushSync(() => {});
}

function statusText(container: HTMLDivElement): string {
  return container.querySelector('[role="status"]')?.textContent ?? "";
}

describe("TemplateExchange", () => {
  it("explains in words why exporting is unavailable without saved templates", () => {
    const container = render(<TemplateExchange customTemplates={[]} onImport={vi.fn()} />);

    const exportButton = container.querySelector<HTMLButtonElement>(".template-exchange__export")!;
    expect(exportButton.disabled).toBe(true);
    expect(container.textContent).toContain("先用上方");
  });

  it("states that template files never carry a roster", () => {
    const container = render(<TemplateExchange customTemplates={[makeRecord()]} onImport={vi.fn()} />);

    expect(container.textContent).toContain("不含任何学生名单");
  });

  it("keeps a polite live region for import and export receipts", () => {
    const container = render(<TemplateExchange customTemplates={[]} onImport={vi.fn()} />);

    const region = container.querySelector<HTMLElement>('.template-exchange__status[role="status"]');
    expect(region).not.toBeNull();
    expect(region!.getAttribute("aria-live")).toBe("polite");
    // 空态没有子节点，才会命中 styles.css 里视觉隐藏的 `:empty` 规则而不是被移出无障碍树。
    expect(region!.childNodes).toHaveLength(0);
    expect(region!.textContent).toBe("");
    expect(container.querySelectorAll('[role="status"]')).toHaveLength(1);
  });

  it("reuses the idle live region node for both failure and success receipts", async () => {
    const container = render(<TemplateExchange customTemplates={[]} onImport={vi.fn()} />);
    const region = container.querySelector<HTMLElement>('.template-exchange__status[role="status"]')!;

    await uploadFile(container, new File(["{ not json"], "坏文件.cengfan-template"));

    expect(region.textContent).toContain("导入失败");
    expect(container.querySelector('.template-exchange__status[role="status"]')).toBe(region);

    const json = serializeTemplatePack(createTemplatePack({ record: makeRecord() }));
    await uploadFile(container, new File([json], "卡通开学墙.cengfan-template", { type: "application/json" }));

    expect(region.textContent).toContain("已导入模板");
    expect(container.querySelector('.template-exchange__status[role="status"]')).toBe(region);
  });

  it("does not claim .cengfan project packages in its file picker", () => {
    const container = render(<TemplateExchange customTemplates={[]} onImport={vi.fn()} />);
    const accept = container.querySelector<HTMLInputElement>('input[type="file"]')!.getAttribute("accept")!;

    expect(fileMatchesAccept(new File(["{}"], "模板.cengfan-template"), accept)).toBe(true);
    expect(fileMatchesAccept(new File(["{}"], "工程.cengfan"), accept)).toBe(false);
  });

  it("exports the selected template without student or guest names", async () => {
    const blobs = stubDownload();
    const container = render(
      <TemplateExchange customTemplates={[makeRecord("卡通开学墙"), makeRecord("素雅名单")]} onImport={vi.fn()} />,
    );

    const select = container.querySelector<HTMLSelectElement>("select")!;
    flushSync(() => {
      select.value = select.options[1]!.value;
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    flushSync(() => container.querySelector<HTMLButtonElement>(".template-exchange__export")!.click());

    expect(blobs).toHaveLength(1);
    const text = await blobs[0]!.text();
    expect(text).not.toContain(STUDENT_NAME);
    expect(text).not.toContain(GUEST_NAME);
    expect(statusText(container)).toContain("素雅名单");
  });

  it("hands a sanitized record to the save path when importing", async () => {
    const onImport = vi.fn();
    const container = render(<TemplateExchange customTemplates={[]} onImport={onImport} author="小林" />);
    const json = serializeTemplatePack(createTemplatePack({ record: makeRecord(), author: "小林" }));

    await uploadFile(container, new File([json], "卡通开学墙.cengfan-template", { type: "application/json" }));

    expect(onImport).toHaveBeenCalledTimes(1);
    const record = onImport.mock.calls[0]![0] as CustomTemplateRecord;
    expect(record.name).toBe("卡通开学墙");
    expect(JSON.stringify(record)).not.toContain(STUDENT_NAME);
    expect(JSON.stringify(record)).not.toContain(GUEST_NAME);
    expect(statusText(container)).toContain("卡通开学墙");
    expect(statusText(container)).toContain("小林");
    expect(container.querySelector<HTMLInputElement>('input[type="file"]')!.value).toBe("");
  });

  it("rejects a template file carrying a roster and says why", async () => {
    const onImport = vi.fn();
    const container = render(<TemplateExchange customTemplates={[]} onImport={onImport} />);
    const pack = JSON.parse(serializeTemplatePack(createTemplatePack({ record: makeRecord() }))) as Record<string, unknown>;
    pack.students = [{ id: "s1", name: STUDENT_NAME }];

    await uploadFile(container, new File([JSON.stringify(pack)], "脏模板.cengfan-template"));

    expect(onImport).not.toHaveBeenCalled();
    expect(statusText(container)).toContain("导入失败");
    expect(statusText(container)).toContain("名单");
  });

  it("sends project packages back to the project import entry", async () => {
    const onImport = vi.fn();
    const container = render(<TemplateExchange customTemplates={[]} onImport={onImport} />);
    const raw = JSON.stringify({ kind: "cengfan-project-package", version: 2, project: {} });

    await uploadFile(container, new File([raw], "工程.json", { type: "application/json" }));

    expect(onImport).not.toHaveBeenCalled();
    expect(statusText(container)).toContain("工程包");
  });

  it("never fails silently on unreadable files", async () => {
    const onImport = vi.fn();
    const container = render(<TemplateExchange customTemplates={[]} onImport={onImport} />);

    await uploadFile(container, new File(["{ not json"], "坏文件.cengfan-template"));

    expect(onImport).not.toHaveBeenCalled();
    expect(statusText(container)).toContain("导入失败");
  });
});
