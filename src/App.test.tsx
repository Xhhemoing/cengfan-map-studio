import { createRoot, type Root } from "react-dom/client";
import { flushSync } from "react-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "./App";
import { resolveDeliveryIssueLocation } from "./lib/delivery-target";
import { createProjectDocument, serializeProjectDocument } from "./lib/project-document";
import { EDITOR_PANEL_LAYOUT_STORAGE_KEY } from "./lib/editor-layout";
import { sampleStudents } from "./lib/project-data";
import { createProjectPackage } from "./lib/project-package";
import { createCustomTemplateFromProject, saveCustomTemplates } from "./lib/template-store";
import { LEGACY_EDITOR_STORAGE_KEY, WORKSPACE_SESSION_STORAGE_KEY } from "./lib/workspace-session";

const roots: Array<{ root: Root; container: HTMLDivElement }> = [];

function mountApp(): HTMLDivElement {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  roots.push({ root, container });
  flushSync(() => root.render(<App />));
  return container;
}

function renderApp(clearStorage = true): HTMLDivElement {
  return renderLegacyApp({ clearStorage });
}

function renderPublicApp({ clearStorage = true } = {}): HTMLDivElement {
  if (clearStorage) window.localStorage.clear();
  return mountApp();
}

function renderLegacyApp({ clearStorage = true } = {}): HTMLDivElement {
  try {
    if (clearStorage) window.localStorage.clear();
    window.localStorage.setItem(LEGACY_EDITOR_STORAGE_KEY, "1");
  } catch {
    // Storage-failure tests intentionally exercise the public fallback.
  }
  return mountApp();
}

function click(element: Element): void {
  flushSync(() => element.dispatchEvent(new MouseEvent("click", { bubbles: true })));
}

function openDesignTool(container: HTMLElement, label: string): void {
  if (label !== "模板") throw new Error(`Unsupported design tool: ${label}`);
  click(container.querySelector<HTMLButtonElement>('.topbar .workflow-stage-stepper button[aria-label="选择模板"]')!);
}

function openWorkflowGuide(container: HTMLElement): void {
  click(container.querySelector<HTMLButtonElement>(".workflow-guide__bar")!);
}

function openGlobalSettingsSection(container: HTMLElement, controls: string): void {
  click(container.querySelector<HTMLButtonElement>('button[aria-label="打开全局设置"]')!);
  click(container.querySelector<HTMLButtonElement>(`[role="tab"][aria-controls="global-settings-${controls}"]`)!);
  if (controls === "cards") click(container.querySelector<HTMLButtonElement>('button[aria-label="数据展示设置"]')!);
}

function openPeopleData(container: HTMLElement): void {
  click(container.querySelector<HTMLButtonElement>('button[aria-label="打开全局设置"]')!);
  click(container.querySelector<HTMLButtonElement>('[role="tab"][aria-controls="global-settings-cards"]')!);
}

function openGlobalData(container: HTMLElement): void {
  click(container.querySelector<HTMLButtonElement>('.topbar .workflow-stepper button[aria-label="名单"]')!);
}

function changeInput(input: HTMLInputElement | HTMLTextAreaElement, value: string): void {
  flushSync(() => {
    const prototype = input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(prototype, "value")?.set;
    setter?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

function changeSelect(select: HTMLSelectElement, value: string): void {
  flushSync(() => {
    const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set;
    setter?.call(select, value);
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

afterEach(() => {
  roots.splice(0).forEach(({ root, container }) => {
    flushSync(() => root.unmount());
    container.remove();
  });
  window.localStorage.clear();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("delivery issue target locations", () => {
  it.each([
    ["map-labels", { stage: "map", selectionKind: "map" }],
    ["map-label:广东", { stage: "map", selectionKind: "province", province: "广东" }],
    ["guests:title", { stage: "content", selectionKind: "guests" }],
    ["guests:people", { stage: "content", selectionKind: "guests" }],
    ["guest:student-1", { stage: "content", selectionKind: "guests" }],
    ["display-frame:style", { stage: "frame", selectionKind: "cards" }],
    ["cards:layout", { stage: "content", selectionKind: "cards" }],
    ["text:title", { stage: "content", selectionKind: "text", id: "title" }],
    ["asset:logo", { stage: "content", selectionKind: "asset", id: "logo" }],
  ] as const)("resolves %s", (target, expected) => {
    expect(resolveDeliveryIssueLocation(target)).toEqual(expected);
  });
});

describe("App student editing", () => {
  it.each([
    ["absent", undefined],
    ["zero", "0"],
    ["true", "true"],
  ] as const)("isolates public template mode when legacy flag is %s", (_label, flag) => {
    window.localStorage.clear();
    if (flag !== undefined) window.localStorage.setItem(LEGACY_EDITOR_STORAGE_KEY, flag);
    const container = renderPublicApp({ clearStorage: false });

    expect(container.querySelector('main[aria-label="模板选择工作台"]')).not.toBeNull();
    expect(container.querySelector(".workspace")).toBeNull();
    expect(container.querySelector(".workflow-guide")).toBeNull();
    expect(container.querySelector('[aria-label="打开全局设置"]')).toBeNull();
    expect(container.querySelector(".workflow-stepper")).toBeNull();
  });

  it("opens the template workspace by default without the legacy compatibility flag", () => {
    const container = renderPublicApp();

    expect(container.querySelector('main[aria-label="模板选择工作台"]')).not.toBeNull();
    expect(container.querySelector(".workspace")).toBeNull();
  });

  it("enables the legacy workspace only for flag 1", () => {
    const container = renderLegacyApp();
    expect(container.querySelector(".workspace")).not.toBeNull();
  });

  it("opens the content and layout workspace when the saved stage is content", () => {
    window.localStorage.setItem(WORKSPACE_SESSION_STORAGE_KEY, JSON.stringify({
      stage: "content",
      savedAt: "2026-08-04T00:00:00.000Z",
    }));

    const container = renderLegacyApp({ clearStorage: false });

    expect(container.querySelector(".workspace")).not.toBeNull();
  });

  it("opens the full-screen final export workspace from the workflow stage", () => {
    const container = renderPublicApp();

    click(container.querySelector<HTMLButtonElement>('.topbar .workflow-stage-stepper button[aria-label="最终导出"]')!);

    expect(container.querySelector('main[aria-label="最终导出"]')).not.toBeNull();
    expect(container.querySelector('select[aria-label="PNG 导出倍率"]')).not.toBeNull();
  });

  it("keeps the export stage and current configuration when SVG export fails", () => {
    const originalCreateObjectURL = URL.createObjectURL;
    vi.spyOn(URL, "createObjectURL").mockImplementation(() => {
      throw new Error("下载不可用");
    });
    const container = renderApp();
    click(container.querySelector<HTMLButtonElement>('.topbar .workflow-stage-stepper button[aria-label="最终导出"]')!);
    const scale = container.querySelector<HTMLSelectElement>('select[aria-label="PNG 导出倍率"]')!;
    changeSelect(scale, "3");
    click(container.querySelector<HTMLButtonElement>('button[aria-label="导出 SVG"]')!);

    expect(container.querySelector('main[aria-label="最终导出"]')).not.toBeNull();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("下载不可用");
    expect(scale.value).toBe("3");
    expect(container.querySelector('button[aria-label="重试导出"]')).not.toBeNull();
    URL.createObjectURL = originalCreateObjectURL;
  });

  it("mounts with defaults when localStorage access is blocked", () => {
    const originalDescriptor = Object.getOwnPropertyDescriptor(window, "localStorage");
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      get: () => { throw new DOMException("Storage blocked", "SecurityError"); },
    });
    try {
      const container = renderApp(false);
      expect(container.textContent).toContain("林舟");
    } finally {
      if (originalDescriptor) Object.defineProperty(window, "localStorage", originalDescriptor);
    }
  });

  it("opens the rebuilt student data center from fullscreen data settings and exposes map expressions", () => {
    const container = renderApp();
    openPeopleData(container);

    expect(container.textContent).toContain("学生数据中心");
    expect(container.querySelector(".student-table")).not.toBeNull();
    expect(container.textContent).toContain("地图呈现方式");
    click(container.querySelector<HTMLButtonElement>('button[aria-label="切换为地图图钉"]')!);
    click(container.querySelector<HTMLButtonElement>('button[aria-label="返回编辑器"]')!);
    expect(container.querySelectorAll("[data-student-pin]")).toHaveLength(12);
  });

  it("removes an international scope from the project when editing a student back to China", () => {
    const internationalProject = createProjectDocument({
      students: [{ ...sampleStudents[0], locationScope: "international" }],
      templateId: "original",
      dataView: "province",
    });
    window.localStorage.setItem("cengfan-map-studio:draft", serializeProjectDocument(internationalProject));
    const container = renderApp(false);
    openPeopleData(container);
    click(container.querySelector<HTMLButtonElement>('button[aria-label="编辑 林舟"]')!);
    changeSelect(container.querySelector<HTMLSelectElement>('select[aria-label="编辑学生去向类型"]')!, "china");
    click(container.querySelector<HTMLButtonElement>('button[aria-label="保存 林舟"]')!);

    expect(container.querySelector('[data-student-row="student-1"]')?.textContent).not.toContain("海外");
    click(container.querySelector<HTMLButtonElement>('button[aria-label="返回编辑器"]')!);
    expect(container.querySelector("[data-destination-card]")?.textContent).not.toContain("海外");
  });

  it("applies an edited record to the project and active poster", () => {
    const container = renderApp();
    openPeopleData(container);
    const edit = container.querySelector<HTMLButtonElement>('button[aria-label="编辑 林舟"]');
    expect(edit).not.toBeNull();
    click(edit!);
    changeInput(container.querySelector<HTMLInputElement>('input[aria-label="编辑学生名称"]')!, "林舟舟");
    click(container.querySelector<HTMLButtonElement>('button[aria-label="保存 林舟"]')!);

    expect(container.textContent).toContain("林舟舟");
    click(container.querySelector<HTMLButtonElement>('button[aria-label="返回编辑器"]')!);
    expect(container.querySelector('[data-destination-card]')?.textContent).toContain("林舟舟");
  });

  it("saves an edited record when the browser has no crypto.randomUUID", () => {
    vi.stubGlobal("crypto", undefined);
    const container = renderApp();
    openPeopleData(container);
    click(container.querySelector<HTMLButtonElement>('button[aria-label="编辑 林舟"]')!);
    changeInput(container.querySelector<HTMLInputElement>('input[aria-label="编辑学生名称"]')!, "兼容林舟");
    click(container.querySelector<HTMLButtonElement>('button[aria-label="保存 林舟"]')!);

    expect(container.textContent).toContain("兼容林舟");
    click(container.querySelector<HTMLButtonElement>('button[aria-label="返回编辑器"]')!);
    expect(container.querySelector('[data-destination-card]')?.textContent).toContain("兼容林舟");
    vi.unstubAllGlobals();
  });

  it("does not write a large project snapshot at the edit commit boundary", () => {
    const container = renderApp();
    window.localStorage.removeItem("cengfan-map-studio:draft");
    openPeopleData(container);
    click(container.querySelector<HTMLButtonElement>('button[aria-label="编辑 林舟"]')!);
    expect(container.querySelector('[data-student-row="student-1"]')?.getAttribute("data-editing")).toBe("true");
    changeInput(container.querySelector<HTMLInputElement>('input[aria-label="编辑学生名称"]')!, "内存林舟");
    click(container.querySelector<HTMLButtonElement>('button[aria-label="保存 林舟"]')!);

    expect(window.localStorage.getItem("cengfan-map-studio:draft")).toBeNull();
    click(container.querySelector<HTMLButtonElement>('button[aria-label="返回编辑器"]')!);
    expect(container.textContent).toContain("有未保存修改");
  });

  it("does not register background persistence timers", () => {
    const intervals = vi.spyOn(window, "setInterval");
    const container = renderApp();

    expect(container.textContent).toContain("仅点击强制保存时覆盖本地数据");
    expect(intervals).not.toHaveBeenCalled();
  });

  it("exposes opt-in incremental collaboration without connecting on startup", () => {
    const request = vi.spyOn(globalThis, "fetch");
    const container = renderApp();

    expect(container.querySelector('[aria-label="增量在线协作"]')).not.toBeNull();
    click(container.querySelector('[aria-label="增量在线协作"]')!);
    expect(container.textContent).toContain("未连接时不会上传或覆盖工程");
    expect(container.textContent).toContain("增量同步");
    expect(request).not.toHaveBeenCalledWith(expect.stringContaining("/api/rooms"), expect.anything());
  });

  it("keeps a browser draft authoritative when a server workspace also exists", async () => {
    const localProject = createProjectDocument({
      students: [{ ...sampleStudents[0], name: "浏览器草稿" }],
      templateId: "original",
      dataView: "province",
    });
    window.localStorage.setItem("cengfan-map-studio:draft", serializeProjectDocument(localProject));
    const request = vi.spyOn(globalThis, "fetch");

    const container = renderApp(false);
    await Promise.resolve();

    expect(container.textContent).toContain("浏览器草稿");
    expect(request).not.toHaveBeenCalledWith("/api/workspace", expect.anything());
    request.mockRestore();
  });

  it("never lets a server workspace overwrite the local browser workspace on startup", async () => {
    const legacyProject = createProjectDocument({
      students: [{ ...sampleStudents[0], name: "旧版原始草稿" }],
      templateId: "original",
      dataView: "province",
    });
    const serverProject = createProjectDocument({
      students: [{ ...sampleStudents[0], name: "服务器持久数据" }],
      templateId: "original",
      dataView: "province",
    });
    const serverPackage = createProjectPackage({
      project: serverProject,
      assets: [],
      fonts: [],
      customTemplates: [],
      renderSettings: { mode: "normal", fixedFps: 20 },
      now: new Date("2026-07-27T15:00:00.000Z"),
    });
    window.localStorage.setItem("cengfan-map-studio:draft", serializeProjectDocument(legacyProject));
    window.localStorage.setItem("cengfan-map-studio:workspace-mirror", JSON.stringify(createProjectPackage({
      project: legacyProject,
      assets: [],
      fonts: [],
      customTemplates: [],
      renderSettings: { mode: "normal", fixedFps: 20 },
      now: new Date("2026-07-27T16:00:00.000Z"),
    })));
    const request = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response(JSON.stringify({
      kind: "cengfan-workspace",
      version: 1,
      projectPackage: serverPackage,
    }), { status: 200, headers: { "Content-Type": "application/json" } }));

    const container = renderApp(false);
    await Promise.resolve();

    expect(container.textContent).toContain("旧版原始草稿");
    expect(container.textContent).not.toContain("服务器持久数据");
    expect(request).not.toHaveBeenCalledWith("/api/workspace", expect.anything());
    request.mockRestore();
  });

  it("immediately overwrites the compatibility draft and complete local mirror", () => {
    const container = renderApp();
    window.localStorage.setItem("cengfan-map-studio:draft", "stale-local-data");
    click(container.querySelector<HTMLButtonElement>('button[aria-label="强制保存到浏览器本地"]')!);

    const saved = window.localStorage.getItem("cengfan-map-studio:draft");
    expect(saved).toContain("林舟");
    expect(saved).not.toContain("stale-local-data");
    const mirror = window.localStorage.getItem("cengfan-map-studio:workspace-mirror");
    expect(mirror).toContain("林舟");
    expect(mirror).toContain("renderSettings");
  });

  it("asks whether to include the resource pack before exporting a project", () => {
    const container = renderApp();

    click(Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.includes("导出工程"))!);

    const dialog = container.querySelector<HTMLElement>('[role="dialog"][aria-label="导出工程确认"]');
    expect(dialog).not.toBeNull();
    expect(dialog?.textContent).toContain("包含资源包");
    expect(dialog?.textContent).toContain("地图背景、地图贴图、素材和字体");
    expect(dialog?.querySelector<HTMLInputElement>('input[aria-label="导出时包含资源包"]')?.checked).toBe(true);
    expect(dialog?.querySelector<HTMLButtonElement>('button[aria-label="确认导出工程"]')).not.toBeNull();
  });

  it("immediately applies imported backgrounds, province textures and resource catalog", () => {
    const importedProject = createProjectDocument({ students: sampleStudents, templateId: "original", dataView: "province" });
    importedProject.canvas = {
      ...importedProject.canvas,
      backgroundImageSrc: "data:image/png;base64,QkFDS0dST1VORA==",
    };
    importedProject.map = {
      ...importedProject.map,
      provinceStyles: {
        ...importedProject.map.provinceStyles,
        北京市: {
          appearance: {
            kind: "texture",
            assetId: "imported-texture",
            src: "data:image/png;base64,VEVYVFVSRS==",
            fit: "contain",
          },
        },
      },
    };
    const pack = createProjectPackage({
      project: importedProject,
      assets: [{
        id: "imported-texture",
        label: "导入的北京贴图",
        kind: "province-texture",
        src: "data:image/png;base64,VEVYVFVSRS==",
        provinceIds: ["北京市"],
        source: "user",
      }],
      fonts: [],
    });
    vi.spyOn(window, "confirm").mockReturnValue(true);
    class ImmediateFileReader {
      result: string | ArrayBuffer | null = null;
      onload: null | (() => void) = null;
      readAsText() {
        this.result = JSON.stringify(pack);
        this.onload?.();
      }
    }
    vi.stubGlobal("FileReader", ImmediateFileReader);
    const container = renderApp();
    const input = container.querySelector<HTMLInputElement>('input[aria-label="导入完整工程包"]')!;
    Object.defineProperty(input, "files", { configurable: true, value: [new File(["package"], "project.json", { type: "application/json" })] });

    flushSync(() => input.dispatchEvent(new Event("change", { bubbles: true })));

    expect(container.querySelector('[data-background-image]')?.getAttribute("href")).toBe("data:image/png;base64,QkFDS0dST1VORA==");
    expect(container.querySelector('[data-province-texture]')?.getAttribute("href")).toBe("data:image/png;base64,VEVYVFVSRS==");
    click(container.querySelector<HTMLButtonElement>('.topbar .workflow-stepper button[aria-label="素材"]')!);
    expect(container.textContent).toContain("导入的北京贴图");
  }, 30_000);

  it("allows changing a legacy imported card font after its family reference is repaired", () => {
    const importedProject = createProjectDocument({ students: sampleStudents, templateId: "original", dataView: "province" });
    importedProject.cards.fieldFonts = { name: "LegacyImportHand" };
    const pack = createProjectPackage({
      project: importedProject,
      assets: [],
      fonts: [{
        id: "font-user-imported",
        label: "旧工程手写体",
        family: "LegacyImportHand",
        src: "data:font/ttf;base64,TEVHQUNZ",
        format: "truetype",
        source: "user",
      }],
    });
    vi.spyOn(window, "confirm").mockReturnValue(true);
    class ImmediateFileReader {
      result: string | ArrayBuffer | null = null;
      onload: null | (() => void) = null;
      readAsText() {
        this.result = JSON.stringify(pack);
        this.onload?.();
      }
    }
    vi.stubGlobal("FileReader", ImmediateFileReader);
    const container = renderApp();
    const input = container.querySelector<HTMLInputElement>('input[aria-label="导入完整工程包"]')!;
    Object.defineProperty(input, "files", { configurable: true, value: [new File(["package"], "legacy-project.json", { type: "application/json" })] });

    flushSync(() => input.dispatchEvent(new Event("change", { bubbles: true })));
    click(container.querySelector<SVGGElement>("[data-cards-layer]")!);
    changeSelect(container.querySelector<HTMLSelectElement>("#cards-font-name")!, "font-system-kaiti");

    const card = container.querySelector("[data-destination-card]")!;
    expect(Array.from(card.querySelectorAll("[data-card-row-line] tspan"))
      .some((fragment) => fragment.textContent?.trim() && (fragment.getAttribute("font-family") ?? "").includes("KaiTi")))
      .toBe(true);
  }, 30_000);

  it("does not overwrite browser storage when the page is hidden", () => {
    const container = renderApp();
    openPeopleData(container);
    click(container.querySelector<HTMLButtonElement>('button[aria-label="编辑 林舟"]')!);
    changeInput(container.querySelector<HTMLInputElement>('input[aria-label="编辑学生名称"]')!, "刷新前林舟");
    click(container.querySelector<HTMLButtonElement>('button[aria-label="保存 林舟"]')!);

    window.dispatchEvent(new Event("pagehide"));

    expect(window.localStorage.getItem("cengfan-map-studio:draft")).toBeNull();
  });


  it("applies an edited city to the map destination card", () => {
    const container = renderApp();
    openPeopleData(container);
    click(container.querySelector<HTMLButtonElement>('button[aria-label="编辑 林舟"]')!);
    changeInput(container.querySelector<HTMLInputElement>('input[aria-label="编辑城市"]')!, "杭州市");
    click(container.querySelector<HTMLButtonElement>('button[aria-label="保存 林舟"]')!);
    click(container.querySelector<HTMLButtonElement>('button[aria-label="返回编辑器"]')!);

    const cards = Array.from(container.querySelectorAll('[data-destination-card]'));
    const card = cards.find((candidate) => candidate.textContent?.includes("林舟"));
    expect(card).not.toBeUndefined();
    expect(card?.getAttribute("data-destination-card")).toBe("浙江省");
  });

  it("links a selected spreadsheet row to its live map marker", () => {
    const container = renderApp();
    openPeopleData(container);

    click(container.querySelector('[data-student-row="student-1"]')!);
    click(container.querySelector<HTMLButtonElement>('button[aria-label="返回编辑器"]')!);

    expect(container.querySelector('[data-student-pin="student-1"]')).not.toBeNull();
    expect(container.querySelector('[data-student-pin="student-1"]')?.getAttribute("data-selected")).toBe("true");
  });

  it("applies pasted text import to the project and poster", () => {
    const container = renderApp();
    openPeopleData(container);
    changeInput(container.querySelector("textarea")!, "苏禾 浙江大学 杭州\n顾言 复旦大学 上海");
    click(Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.includes("识别文本"))!);
    click(Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.includes("追加导入"))!);

    expect(container.textContent).toContain("苏禾");
    expect(container.textContent).toContain("顾言");
    click(container.querySelector<HTMLButtonElement>('button[aria-label="返回编辑器"]')!);
    const cards = Array.from(container.querySelectorAll('[data-destination-card]')).map((card) => card.textContent);
    expect(cards.some((text) => text?.includes("苏禾"))).toBe(true);
  });

  it("replaces the project dataset with confirmed import candidates", () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const container = renderApp();
    openPeopleData(container);
    changeInput(container.querySelector("textarea")!, "新同学 北京大学 北京");
    click(Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.includes("识别文本"))!);
    click(Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.includes("替换全部"))!);

    expect(container.querySelectorAll('[data-student-row]')).toHaveLength(1);
    expect(container.querySelector('[data-student-row]')?.textContent).toContain("新同学");
    click(container.querySelector<HTMLButtonElement>('button[aria-label="返回编辑器"]')!);
    expect(container.querySelector('[data-destination-card]')?.textContent).toContain("新同学");
  });

  it("applies a saved canonical scene while keeping the current people", () => {
    const scene = createProjectDocument({ students: [], templateId: "scenery", dataView: "province" });
    scene.textElements = scene.textElements.map((element) =>
      element.id === "text-title" ? { ...element, content: "模板标题" } : element,
    );
    const template = createCustomTemplateFromProject({
      name: "可应用场景",
      baseTemplateId: "scenery",
      scope: "visual",
      overrides: {},
      scene,
      students: [],
    });
    saveCustomTemplates([template]);
    const container = renderApp(false);
    openDesignTool(container, "模板");
    const templateButton = container.querySelector<HTMLButtonElement>('button[aria-label="选择可应用场景"]');
    expect(templateButton).not.toBeNull();
    click(templateButton!);
    click(container.querySelector<HTMLButtonElement>('button[aria-label="应用模板"]')!);

    expect(container.textContent).toContain("模板标题");
    expect(container.textContent).toContain("林舟");
  });

  it("applies valid material panel actions without offering built-in landmarks or decorations", () => {
    const container = renderApp();
    click(container.querySelector<HTMLButtonElement>('.topbar .workflow-stepper button[aria-label="素材"]')!);

    const background = Array.from(container.querySelectorAll<HTMLButtonElement>("button"))
      .find((button) => button.textContent?.includes("设为背景"))!;
    click(background);
    expect(container.querySelector("[data-background-image]")).not.toBeNull();

    expect(container.textContent).not.toContain("添加地标");
    expect(container.textContent).not.toContain("添加装饰");
  }, 30_000);

  it("imports an SVG as a selected, resizable canvas element", () => {
    const originalFileReader = globalThis.FileReader;
    class ImmediateFileReader {
      result = "data:image/svg+xml;base64,PHN2Zy8+";
      onload: ((event: ProgressEvent<FileReader>) => void) | null = null;
      onerror: (() => void) | null = null;
      readAsDataURL() { this.onload?.(new ProgressEvent("load") as ProgressEvent<FileReader>); }
    }
    vi.stubGlobal("FileReader", ImmediateFileReader);
    const container = renderApp();
    click(container.querySelector<HTMLButtonElement>('.topbar .workflow-stepper button[aria-label="素材"]')!);

    const input = container.querySelector<HTMLInputElement>("#asset-svg-canvas-upload")!;
    Object.defineProperty(input, "files", {
      configurable: true,
      value: [new File(["<svg />"], "校徽.svg", { type: "image/svg+xml" })],
    });
    flushSync(() => input.dispatchEvent(new Event("change", { bubbles: true })));

    const image = Array.from(container.querySelectorAll<SVGImageElement>("[data-asset-id]"))
      .find((element) => element.getAttribute("href") === "data:image/svg+xml;base64,PHN2Zy8+");
    expect(image).not.toBeUndefined();
    expect(container.querySelector("[data-resize-handles]")).not.toBeNull();
    expect(container.textContent).toContain("已导入画布：校徽");
    vi.stubGlobal("FileReader", originalFileReader);
  });

  it("keeps the province texture library available after removing landmark presets", () => {
    const container = renderApp();
    click(container.querySelector<HTMLButtonElement>('.topbar .workflow-stepper button[aria-label="素材"]')!);
    expect(container.textContent).toContain("省份外观");
    expect(container.querySelector("#asset-province")).not.toBeNull();
    expect(container.textContent).not.toContain("地标和装饰");
  });

  it("writes manual visual controls to the canonical scene", () => {
    const container = renderApp();
    openGlobalSettingsSection(container, "cards");
    const compact = container.querySelector<HTMLInputElement>("#cards-compact-layout");
    expect(compact).not.toBeUndefined();

    click(compact!);

    expect(compact?.checked).toBe(true);
  });

  it("exposes the map-overlap switch in the primary block-style workflow", () => {
    const container = renderApp();
    openGlobalSettingsSection(container, "cards");

    const toggle = container.querySelector<HTMLInputElement>("#cards-allow-map-overlap");
    expect(toggle).not.toBeNull();
    expect(toggle?.checked).toBe(false);
    click(toggle!);
    expect(toggle?.checked).toBe(true);
  });

  it("reads visual controls from canonical scene state", () => {
    const project = createProjectDocument({ students: [], templateId: "original", dataView: "province" });
    project.cards = { ...project.cards, preset: "standard", compactLayout: true };
    project.map = { ...project.map, scale: 1.2 };
    project.canvas = { ...project.canvas, backgroundColor: "#123456" };
    project.style = {
      ...project.style,
      cardPreset: "standard",
      mapScale: 1,
      backgroundColor: "#f7f4ea",
    };
    window.localStorage.setItem("cengfan-map-studio:draft", serializeProjectDocument(project));
    const container = renderApp(false);
    openGlobalSettingsSection(container, "cards");

    expect(container.querySelector<HTMLSelectElement>("#cards-preset")?.value).toBe("standard");
    expect(container.querySelector<HTMLInputElement>("#cards-compact-layout")?.checked).toBe(true);
    expect(container.querySelector<HTMLInputElement>("#cards-background")?.value).toBe(project.cards.background);
  });

  it("applies connector formatting from the block style panel to the live poster", () => {
    const container = renderApp();
    openGlobalSettingsSection(container, "cards");

    changeSelect(container.querySelector<HTMLSelectElement>("#cards-connector-style")!, "straight");
    changeSelect(container.querySelector<HTMLSelectElement>("#cards-connector-dash")!, "solid");
    click(container.querySelector<HTMLButtonElement>('button[aria-label="返回编辑器"]')!);
    const connector = container.querySelector<SVGPathElement>("[data-destination-connector]")!;
    expect(connector.getAttribute("data-connector-style")).toBe("straight");
    expect(connector.getAttribute("stroke-dasharray")).toBeNull();
  });

  it("preserves every block style patch dispatched in the same interaction batch", () => {
    const container = renderApp();
    openGlobalSettingsSection(container, "cards");
    const style = container.querySelector<HTMLSelectElement>("#cards-connector-style")!;
    const dash = container.querySelector<HTMLSelectElement>("#cards-connector-dash")!;

    flushSync(() => {
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set?.call(style, "straight");
      style.dispatchEvent(new Event("change", { bubbles: true }));
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")?.set?.call(dash, "solid");
      dash.dispatchEvent(new Event("change", { bubbles: true }));
    });

    click(container.querySelector<HTMLButtonElement>('button[aria-label="返回编辑器"]')!);
    const connector = container.querySelector<SVGPathElement>("[data-destination-connector]")!;
    expect(connector.getAttribute("data-connector-style")).toBe("straight");
    expect(connector.getAttribute("stroke-dasharray")).toBeNull();
  });

  it("uses block grouping as the canonical grouping rendered on the poster", () => {
    const project = createProjectDocument({
      students: [
        { id: "same-city-a", name: "甲", university: "北京大学", city: "北京市", visibility: true },
        { id: "same-city-b", name: "乙", university: "清华大学", city: "北京市", visibility: true },
        { id: "hangzhou", name: "丙", university: "浙江大学", city: "杭州市", visibility: true },
      ],
      templateId: "original",
      dataView: "city",
    });
    project.cards = { ...project.cards, grouping: "province" };
    window.localStorage.setItem("cengfan-map-studio:draft", serializeProjectDocument(project));
    const container = renderApp(false);
    openGlobalSettingsSection(container, "cards");

    changeSelect(container.querySelector<HTMLSelectElement>("#cards-grouping")!, "city");
    click(container.querySelector<HTMLButtonElement>('button[aria-label="返回编辑器"]')!);

    expect(container.querySelectorAll("[data-destination-card]")).toHaveLength(2);
  });

  it("keeps manual card placements when full smart layout is cancelled", () => {
    const project = createProjectDocument({ students: sampleStudents, templateId: "original", dataView: "province" });
    project.cards = { ...project.cards, positions: { 北京市: { x: 50, y: 50 } } };
    window.localStorage.setItem("cengfan-map-studio:draft", serializeProjectDocument(project));
    window.localStorage.setItem(WORKSPACE_SESSION_STORAGE_KEY, JSON.stringify({ stage: "content", savedAt: "2026-08-04T00:00:00.000Z" }));
    const container = renderPublicApp({ clearStorage: false });
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);

    click(container.querySelector<HTMLButtonElement>('button[aria-label="全部重新排版"]')!);

    expect(confirm).toHaveBeenCalledTimes(1);
    expect(container.querySelector('[data-destination-card="北京市"]')?.getAttribute("transform")).toMatch(/^translate\(50 /);
    expect(container.querySelector('button[aria-label="撤销：全部重新排版数据框"]')).toBeNull();
  });

  it("locates a text layout issue without leaving the content stage", () => {
    const project = createProjectDocument({ students: [], templateId: "original", dataView: "province" });
    project.textElements = project.textElements.map((element) => element.id === "text-title"
      ? { ...element, color: "#ffffff" }
      : element);
    window.localStorage.setItem("cengfan-map-studio:draft", serializeProjectDocument(project));
    window.localStorage.setItem(WORKSPACE_SESSION_STORAGE_KEY, JSON.stringify({ stage: "content", savedAt: "2026-08-04T00:00:00.000Z" }));
    const container = renderPublicApp({ clearStorage: false });

    const issue = Array.from(container.querySelectorAll<HTMLButtonElement>('section[aria-label="排版问题提示"] button'))
      .find((button) => button.textContent?.includes("text-title"));
    expect(issue).not.toBeUndefined();
    click(issue!);

    expect(container.querySelector('main[aria-label="内容与排版"]')).not.toBeNull();
    expect(container.querySelector('[data-text-id="text-title"]')?.classList.contains("is-selected")).toBe(true);
  });

  it("opens the upload workbench for the data stage without template or map presentation controls", () => {
    const container = renderApp();
    openGlobalData(container);

    expect(container.querySelector('main[aria-label="上传数据工作台"]')).not.toBeNull();
    expect(container.querySelector(".student-table")).not.toBeNull();
    expect(container.textContent).not.toContain("地图呈现方式");
    expect(container.textContent).not.toContain("模板应用");
    expect(container.textContent).not.toContain("模板列表");
  });

  it("restores the upload workbench when the saved stage is data", () => {
    window.localStorage.setItem(WORKSPACE_SESSION_STORAGE_KEY, JSON.stringify({
      stage: "data",
      savedAt: "2026-08-05T10:00:00.000Z",
    }));
    const container = renderPublicApp({ clearStorage: false });

    expect(container.querySelector('main[aria-label="上传数据工作台"]')).not.toBeNull();
    expect(container.querySelector(".student-table")).not.toBeNull();
    click(container.querySelector<HTMLButtonElement>('button[aria-label="返回编辑器"]')!);

    expect(container.querySelector('main[aria-label="上传数据工作台"]')).toBeNull();
    expect(container.querySelector('main[aria-label="内容与排版"]')).not.toBeNull();
  });

  it("returns from the upload stage to the previous editor stage", () => {
    const container = renderApp();
    openGlobalData(container);
    click(container.querySelector<HTMLButtonElement>('button[aria-label="返回编辑器"]')!);

    expect(container.querySelector('main[aria-label="上传数据工作台"]')).toBeNull();
    expect(container.querySelector(".workspace")).not.toBeNull();
    expect(container.querySelector('.topbar .workflow-stage-stepper button[aria-current="step"]')?.getAttribute("aria-label")).toBe("内容与排版");
  });

  it("connects upload row selection to the active poster marker", () => {
    const container = renderApp();
    openGlobalData(container);
    click(container.querySelector('[data-student-row="student-1"]')!);
    click(container.querySelector<HTMLButtonElement>('button[aria-label="返回编辑器"]')!);

    expect(container.querySelector('[data-student-pin="student-1"]')?.getAttribute("data-selected")).toBe("true");
  });

  it("opens the upload workbench from the legacy global settings entry without exposing old navigation", () => {
    const container = renderLegacyApp();
    click(container.querySelector<HTMLButtonElement>('button[aria-label="打开全局设置"]')!);
    click(container.querySelector<HTMLButtonElement>('[role="tab"][aria-controls="global-settings-cards"]')!);
    click(container.querySelector<HTMLButtonElement>('button[aria-label="打开全局数据"]')!);

    expect(container.querySelector('main[aria-label="上传数据工作台"]')).not.toBeNull();
    expect(container.querySelector(".student-table")).not.toBeNull();
    expect(container.querySelectorAll('[role="tab"]')).toHaveLength(0);
  });

  it("restores the latest workspace stage from a valid browser session", () => {
    window.localStorage.setItem(WORKSPACE_SESSION_STORAGE_KEY, JSON.stringify({
      stage: "content",
      selectedProvince: "北京市",
      selectedObject: "cards",
      savedAt: "2026-08-05T10:00:00.000Z",
    }));

    const container = renderApp(false);

    expect(container.querySelector('.topbar .workflow-stage-stepper button[aria-current="step"]')?.getAttribute("aria-label")).toBe("内容与排版");
    expect(container.querySelector(".workflow-panel--content")).not.toBeNull();
  });

  it("does not restore a stale province after the canvas selection is cleared", () => {
    window.localStorage.setItem(WORKSPACE_SESSION_STORAGE_KEY, JSON.stringify({
      stage: "content",
      selectedProvince: "北京市",
      savedAt: "2026-08-05T10:00:00.000Z",
    }));

    const container = renderApp(false);
    click(container.querySelector<SVGSVGElement>("svg.poster")!);

    expect(JSON.parse(window.localStorage.getItem(WORKSPACE_SESSION_STORAGE_KEY) ?? "{}")).not.toHaveProperty("selectedProvince");
  });

  it("opens the full-screen template workbench as the first workflow stage", () => {
    const container = renderApp();
    click(container.querySelector<HTMLButtonElement>('[aria-label="选择模板"]')!);

    expect(container.querySelector('main[aria-label="模板选择工作台"]')).not.toBeNull();
    expect(container.textContent).toContain("选择模板");
    expect(container.textContent).toContain("1500 × 1000 px");
    expect(container.querySelector("svg[data-template-preview]")).not.toBeNull();
  });

  it("keeps temporary template selection out of the project until apply", () => {
    const container = renderApp();
    click(container.querySelector<HTMLButtonElement>('[aria-label="选择模板"]')!);
    const before = container.querySelector("svg[data-template-preview]")?.getAttribute("data-template-id");

    click(container.querySelector<HTMLButtonElement>('button[aria-label="选择卡通画风"]')!);

    expect(container.textContent).toContain("将应用：卡通画风");
    expect(container.querySelector("svg[data-template-preview]")?.getAttribute("data-template-id")).toBe("cartoon");
    expect(before).toBe("original");
    expect(container.querySelector(".template-workspace__history")?.textContent).toContain("尚未写入工程");
  });

  it("applies a selected template while retaining student data", () => {
    const container = renderApp();
    click(container.querySelector<HTMLButtonElement>('[aria-label="选择模板"]')!);

    click(container.querySelector<HTMLButtonElement>('button[aria-label="选择卡通画风"]')!);
    click(container.querySelector<HTMLButtonElement>('button[aria-label="应用模板"]')!);

    expect(container.querySelector('main[aria-label="模板选择工作台"]')).toBeNull();
    expect(container.textContent).toContain("林舟");
    click(container.querySelector<HTMLButtonElement>('[aria-label="选择模板"]')!);
    expect(container.querySelector(".template-workspace__history")?.textContent).toContain("已写入 1 步");
    expect(container.textContent).toContain("卡通画风");
  });

  it("opens the display frame stage as a dedicated workbench with topbar undo/redo and project menu", () => {
    const container = renderApp();
    click(container.querySelector<HTMLButtonElement>('[aria-label="展示框样式"]')!);

    expect(container.querySelector('main[aria-label="展示框样式"]')).not.toBeNull();
    expect(container.querySelector('button[aria-label="固定自由排布"]')).not.toBeNull();
    expect(container.querySelector(".workspace")).toBeNull();
    expect(container.querySelector('main[aria-label="展示框样式"] .display-frame-workspace__header')).toBeNull();

    const topbar = container.querySelector(".topbar-actions")!;
    expect(topbar.querySelector('[aria-label="历史与缩放"]')).not.toBeNull();
    expect(topbar.querySelector('[aria-label="导出与工程"]')).not.toBeNull();
    const projectMenu = topbar.querySelector(".project-menu")!;
    expect(projectMenu).not.toBeNull();
    expect(projectMenu.textContent).toContain("导入工程");

    click(container.querySelector<HTMLButtonElement>('.topbar .workflow-stage-stepper button[aria-label="内容与排版"]')!);
    expect(container.querySelector('main[aria-label="展示框样式"]')).toBeNull();
    expect(container.querySelector(".workspace")).not.toBeNull();
  });

  it("keeps the unified topbar with six-stage navigation while editing data", () => {
    const container = renderApp();
    openGlobalData(container);

    expect(container.querySelector('main[aria-label="上传数据工作台"]')).not.toBeNull();
    expect(container.querySelector('.topbar .workflow-stage-stepper')).not.toBeNull();
    expect(container.querySelector('.topbar .brand')).not.toBeNull();
    expect(container.querySelector('.topbar .workflow-stage-stepper button[aria-current="step"]')?.getAttribute("aria-label")).toBe("上传数据");
    // 工作台内部不再重复渲染步骤条
    expect(container.querySelector('main[aria-label="上传数据工作台"] .workflow-stage-stepper')).toBeNull();

    click(container.querySelector<HTMLButtonElement>('.topbar .workflow-stage-stepper button[aria-label="地图样式"]')!);
    expect(container.querySelector('main[aria-label="地图样式"]')).not.toBeNull();
    expect(container.querySelector('main[aria-label="上传数据工作台"]')).toBeNull();
  });

  it("opens the map style stage as a dedicated workbench", () => {
    const container = renderApp();
    click(container.querySelector<HTMLButtonElement>('[aria-label="地图样式"]')!);

    expect(container.querySelector('main[aria-label="地图样式"]')).not.toBeNull();
    expect(container.querySelectorAll('[role="group"][aria-label="地图表达"] button')).toHaveLength(5);
    expect(container.querySelector(".workflow-panel--map")).toBeNull();
    expect(container.querySelector("main[aria-label=\"全局设置\"]")).toBeNull();
  });

  it("keeps province selection and styling inside the map stage", () => {
    const container = renderApp();
    click(container.querySelector<HTMLButtonElement>('[aria-label="地图样式"]')!);
    click(container.querySelector<SVGPathElement>("[data-province-hit]")!);

    expect(container.querySelector('.topbar .workflow-stage-stepper button[aria-current="step"]')?.getAttribute("aria-label")).toBe("地图样式");
    expect(container.querySelector('main[aria-label="地图样式"]')).not.toBeNull();
    expect(container.querySelector(".province-inspector")?.textContent).toContain("北京市");
    expect(container.querySelector('.topbar .workflow-stepper button[aria-label="素材"]')).toBeNull();
  });

  it("keeps map style patches undoable in the map stage", () => {
    const container = renderApp();
    click(container.querySelector<HTMLButtonElement>('[aria-label="地图样式"]')!);
    const collapse = container.querySelector<HTMLInputElement>("#map-collapse-south-sea")!;
    click(collapse);

    expect(collapse.checked).toBe(true);
    const undo = container.querySelector<HTMLButtonElement>('button[aria-label^="撤销：更新地图"]')!;
    expect(undo).not.toBeNull();
    click(undo);

    expect(container.querySelector<HTMLInputElement>("#map-collapse-south-sea")?.checked).toBe(false);
  });

  it("opens the project-level global data workbench from the roster workflow step", () => {
    const container = renderApp();
    openGlobalData(container);

    expect(container.querySelector('main[aria-label="全局数据工作台"]')).not.toBeNull();
    expect(container.querySelectorAll('[role="tab"]')).toHaveLength(5);
    expect(container.textContent).toContain("数据总览");
  });

  it("applies a presentation change from the global data workbench to the poster", () => {
    const container = renderApp();
    openGlobalData(container);
    click(container.querySelector<HTMLButtonElement>('button[aria-label="数据呈现"]')!);
    click(container.querySelector<HTMLButtonElement>('button[aria-label="切换为地图图钉"]')!);
    click(container.querySelector<HTMLButtonElement>('button[aria-label="返回编辑器"]')!);

    expect(container.querySelectorAll("[data-student-pin]")).toHaveLength(12);
  });

  it("opens the same global data workbench from global settings", () => {
    const container = renderApp();
    click(container.querySelector<HTMLButtonElement>('button[aria-label="打开全局设置"]')!);
    click(container.querySelector<HTMLButtonElement>('[role="tab"][aria-controls="global-settings-cards"]')!);
    click(container.querySelector<HTMLButtonElement>('button[aria-label="打开全局数据"]')!);

    expect(container.querySelector('main[aria-label="全局数据工作台"]')).not.toBeNull();
    expect(container.querySelector(".student-table")).not.toBeNull();
  });

  it("organizes the actual editor into six user workflow workspaces", () => {
    const container = renderApp();
    const tabs = container.querySelector(".topbar .workflow-stage-stepper")!;
    expect(tabs.querySelectorAll("button")).toHaveLength(6);
    expect(Array.from(tabs.querySelectorAll("button")).map((button) => button.textContent?.trim())).toEqual([
      "1选择模板",
      "2上传数据",
      "3地图样式",
      "4展示框样式",
      "5内容与排版",
      "6最终导出",
    ]);
    expect(container.querySelector(".workspace-nav")).toBeNull();

    click(tabs.querySelector<HTMLButtonElement>('[aria-label="上传数据"]')!);
    expect(container.querySelector('main[aria-label="上传数据工作台"]')).not.toBeNull();
    expect(container.textContent).not.toContain("地图呈现方式");
    click(container.querySelector<HTMLButtonElement>('button[aria-label="返回编辑器"]')!);

    const editorTabs = container.querySelector(".topbar .workflow-stage-stepper")!;
    click(editorTabs.querySelector<HTMLButtonElement>('[aria-label="地图样式"]')!);
    expect(container.textContent).toContain("地图表达");

    click(editorTabs.querySelector<HTMLButtonElement>('[aria-label="最终导出"]')!);
    expect(container.textContent).toContain("交付检查");
  });

  it("opens global settings as a standalone fullscreen screen and returns to the editor", () => {
    const container = renderLegacyApp();

    expect(container.querySelector(".topbar")).not.toBeNull();
    expect(container.querySelector(".workspace")).not.toBeNull();

    click(container.querySelector<HTMLButtonElement>('button[aria-label="打开全局设置"]')!);

    expect(container.querySelector('main[aria-label="全局设置"]')).not.toBeNull();
    expect(container.querySelector(".topbar")).not.toBeNull();
    expect(container.querySelectorAll(".topbar .workflow-stage-stepper button")).toHaveLength(6);
    expect(container.querySelector(".workspace")).toBeNull();
    expect(container.querySelector(".sidebar")).toBeNull();
    expect(container.querySelector(".inspector")).toBeNull();

    click(container.querySelector<HTMLButtonElement>('button[aria-label="返回编辑器"]')!);

    expect(container.querySelector('main[aria-label="全局设置"]')).toBeNull();
    expect(container.querySelector(".topbar")).not.toBeNull();
    expect(container.querySelector(".workspace")).not.toBeNull();
    expect(container.querySelector("#canvas-width")).toBeNull();
  });

  it("edits every global settings section through the current project history", () => {
    const container = renderApp();
    click(container.querySelector<HTMLButtonElement>('button[aria-label="打开全局设置"]')!);

    const settings = container.querySelector<HTMLElement>('main[aria-label="全局设置"]')!;
    expect(Array.from(settings.querySelectorAll('[role="tab"] strong')).map((label) => label.textContent?.trim())).toEqual([
      "画布设置",
      "地图展示框",
      "数据板块",
      "辅助板块",
      "字体排版",
      "高级设置",
    ]);

    expect(settings.querySelector<HTMLInputElement>("#canvas-width")?.value).toBe("1500");
    click(settings.querySelector<HTMLInputElement>("#canvas-background-opacity")!);
    click(settings.querySelector<HTMLButtonElement>('[role="tab"][aria-controls="global-settings-map"]')!);
    click(settings.querySelector<HTMLInputElement>("#map-collapse-south-sea")!);
    const undo = container.querySelector<HTMLButtonElement>('.global-settings-history button:first-child')!;
    expect(undo.disabled).toBe(false);
    click(undo);
    expect(container.querySelector<HTMLInputElement>("#map-collapse-south-sea")?.checked).toBe(false);

    expect(settings.querySelector("#map-width")).toBeNull();

    click(settings.querySelector<HTMLButtonElement>('[role="tab"][aria-controls="global-settings-cards"]')!);
    expect(settings.textContent).toContain("学生数据中心");
    expect(settings.querySelector(".student-table")).not.toBeNull();
    expect(settings.querySelector("#cards-layout-mode")).toBeNull();
    click(settings.querySelector<HTMLButtonElement>('button[aria-label="数据展示设置"]')!);
    expect(settings.querySelector("#cards-layout-mode")).not.toBeNull();
    expect(settings.querySelector("#cards-x")).toBeNull();
    expect(settings.querySelector<HTMLButtonElement>('button[aria-label="一键智能排版"]')).not.toBeNull();

    click(settings.querySelector<HTMLButtonElement>('[role="tab"][aria-controls="global-settings-guests"]')!);
    expect(settings.querySelector("#guests-width")).toBeNull();
    expect(settings.querySelector(".guest-people-editor")).toBeNull();

    click(settings.querySelector<HTMLButtonElement>('[role="tab"][aria-controls="global-settings-typography"]')!);
    expect(settings.querySelector("#typography-province-font")).not.toBeNull();
    expect(settings.querySelector("#typography-roster-font")).not.toBeNull();
  });

  it("groups global settings sections into global design and other settings", () => {
    const container = renderApp();
    click(container.querySelector<HTMLButtonElement>('button[aria-label="打开全局设置"]')!);

    const settings = container.querySelector<HTMLElement>('main[aria-label="全局设置"]')!;
    const nav = settings.querySelector(".global-settings-nav")!;
    const groupHeadings = Array.from(nav.querySelectorAll(".global-settings-group-label"))
      .map((el) => el.textContent?.trim());
    expect(groupHeadings).toEqual(["全局设计", "其他设置"]);

    // 6 个 tab 仍是同一 tablist，顺序不变
    const tabs = Array.from(settings.querySelectorAll('[role="tab"]'));
    expect(tabs.map((tab) => tab.getAttribute("aria-controls"))).toEqual([
      "global-settings-canvas",
      "global-settings-map",
      "global-settings-cards",
      "global-settings-guests",
      "global-settings-typography",
      "global-settings-advanced",
    ]);

    // 流程核心分区归入全局设计组，辅助板块/字体排版归入其他设置组
    const groupOf = (controls: string) => tabs
      .find((tab) => tab.getAttribute("aria-controls") === controls)!
      .closest(".global-settings-group")
      ?.querySelector(".global-settings-group-label")?.textContent;
    expect(groupOf("global-settings-canvas")).toContain("全局设计");
    expect(groupOf("global-settings-cards")).toContain("全局设计");
    expect(groupOf("global-settings-guests")).toContain("其他设置");
    expect(groupOf("global-settings-typography")).toContain("其他设置");
    expect(groupOf("global-settings-advanced")).toContain("其他设置");
  });

  it("moves card expressions and name formats into global advanced settings", () => {
    const container = renderApp();
    click(container.querySelector<HTMLButtonElement>('button[aria-label="打开全局设置"]')!);

    const settings = container.querySelector<HTMLElement>('main[aria-label="全局设置"]')!;
    const advancedTab = settings.querySelector<HTMLButtonElement>('[role="tab"][aria-controls="global-settings-advanced"]')!;
    expect(advancedTab).not.toBeNull();
    click(advancedTab);

    expect(settings.querySelector("#cards-expression-row")).not.toBeNull();
    expect(settings.querySelector("#cards-name-format-custom")).not.toBeNull();
    expect(settings.querySelector(".cards-name-format__presets button")?.textContent).toBe("完整姓名");
    expect(Array.from(settings.querySelectorAll(".cards-name-format__presets button")).map((button) => button.textContent)).toContain("Wxm（首字母）");

    click(settings.querySelector<HTMLButtonElement>('button[aria-label="返回编辑器"]')!);
    expect(container.querySelector(".inspector .cards-expressions")).toBeNull();
    expect(container.querySelector(".inspector .cards-name-format")).toBeNull();
  });

  it("keeps full map, data-frame and guest controls in the right inspector", () => {
    const container = renderApp();

    click(container.querySelector<SVGGElement>("[data-map-selection-overlay]")!);
    expect(container.querySelector("#map-x")).not.toBeNull();
    expect(container.querySelector("#map-width")).not.toBeNull();
    expect(container.querySelector("#map-land-color")).not.toBeNull();

    click(container.querySelector<SVGGElement>("[data-cards-layer]")!);
    expect(container.querySelector("#cards-x")).not.toBeNull();
    expect(container.querySelector("#cards-maxWidth")).not.toBeNull();
    expect(container.querySelector("#cards-layout-mode")).not.toBeNull();
    expect(container.querySelector('button[aria-label="一键智能排版"]')).not.toBeNull();

    click(container.querySelector<SVGGElement>('[aria-label="特邀嘉宾"]')!);
    expect(container.querySelector("#guests-x")).not.toBeNull();
    expect(container.querySelector("#guests-width")).not.toBeNull();
    expect(container.querySelector("#guests-background")).not.toBeNull();
    expect(container.querySelector(".guest-people-editor")).not.toBeNull();
  });

  it("keeps frequent actions visible and groups low-frequency project actions", () => {
    const container = renderApp();
    const topbar = container.querySelector(".topbar-actions")!;

    expect(topbar.querySelector('[aria-label="历史与缩放"]')).not.toBeNull();
    expect(topbar.querySelector('[aria-label="导出与工程"]')).not.toBeNull();
    expect(topbar.textContent).not.toContain("存模板");
    expect(topbar.querySelector('[aria-label="在线协作"]')).toBeNull();

    const exportGroup = topbar.querySelector('[aria-label="导出与工程"]')!;
    expect(exportGroup.querySelector(".primary-button")?.textContent).toContain("导出 PNG");
    const projectMenu = exportGroup.querySelector(".project-menu")!;
    expect(projectMenu).not.toBeNull();
    expect(projectMenu.textContent).toContain("导出 SVG");
    expect(projectMenu.textContent).toContain("导入工程");
    expect(projectMenu.textContent).toContain("在线协作");

    expect(container.querySelectorAll<HTMLButtonElement>(".topbar .workflow-stage-stepper button")).toHaveLength(6);
    expect(topbar.querySelector('[aria-label="打开全局设置"]')).not.toBeNull();
  });

  it("splits the editor toolbar into view and preview clusters", () => {
    const container = renderApp();
    const actions = container.querySelector(".editor-toolbar-actions")!;

    const view = actions.querySelector('[aria-label="视图"]')!;
    const preview = actions.querySelector('[aria-label="预览设置"]')!;
    expect(view).not.toBeNull();
    expect(preview).not.toBeNull();
    expect(Array.from(actions.children).filter((child) => child.classList.contains("control-cluster"))).toHaveLength(2);

    expect(view.querySelector('button[aria-label="适应画布"]')).not.toBeNull();
    expect(view.querySelector("#editor-grid-size")).not.toBeNull();
    expect(preview.querySelector("#editor-render-mode")).not.toBeNull();

    click(view.querySelector<HTMLButtonElement>('button[aria-label="打开网格"]')!);
    expect(container.querySelector("[data-editor-grid]")).not.toBeNull();
  });

  it("opens global typography settings and applies one province font to the live map", () => {
    const container = renderApp();
    click(container.querySelector<HTMLButtonElement>('button[aria-label="打开全局设置"]')!);
    click(container.querySelector<HTMLButtonElement>('[role="tab"][aria-controls="global-settings-typography"]')!);

    expect(container.textContent).toContain("字体工具");
    changeSelect(container.querySelector<HTMLSelectElement>("#typography-province")!, "陕西省");
    changeSelect(container.querySelector<HTMLSelectElement>("#typography-province-font")!, "font-system-kaiti");
    click(container.querySelector<HTMLButtonElement>('button[aria-label="返回编辑器"]')!);

    const shaanxi = Array.from(container.querySelectorAll("[data-province-label]"))
      .find((label) => label.textContent?.startsWith("陕西"));
    expect(shaanxi?.getAttribute("font-family")).toContain("KaiTi");
  });

  it("applies a data-card font selection from the inspector to the live card rows", () => {
    const container = renderApp();
    click(container.querySelector<SVGGElement>("[data-cards-layer]")!);

    changeSelect(container.querySelector<HTMLSelectElement>("#cards-font-name")!, "font-system-kaiti");

    const card = container.querySelector("[data-destination-card]")!;
    expect(Array.from(card.querySelectorAll("[data-card-row-line] tspan"))
      .some((fragment) => fragment.textContent?.trim() && (fragment.getAttribute("font-family") ?? "").includes("KaiTi")))
      .toBe(true);
  });

  it("applies an uploaded font selected in global typography settings to the live canvas", () => {
    const project = createProjectDocument({
      students: sampleStudents,
      templateId: "original",
      dataView: "province",
    });
    const font = {
      id: "font-user-canvas-hand",
      label: "画布手写体",
      family: "CanvasHand",
      src: "data:font/ttf;base64,AA==",
      format: "truetype" as const,
      source: "user" as const,
    };
    window.localStorage.setItem("cengfan-map-studio:workspace-mirror", JSON.stringify(createProjectPackage({
      project,
      assets: [],
      fonts: [font],
    })));

    const container = renderApp(false);
    click(container.querySelector<HTMLButtonElement>('button[aria-label="打开全局设置"]')!);
    click(container.querySelector<HTMLButtonElement>('[role="tab"][aria-controls="global-settings-typography"]')!);
    changeSelect(container.querySelector<HTMLSelectElement>("#typography-canvas-font")!, font.id);
    click(container.querySelector<HTMLButtonElement>('button[aria-label="返回编辑器"]')!);

    expect(container.querySelector('[data-text-id="text-eyebrow"] text')?.getAttribute("font-family")).toBe('"CanvasHand"');
  });

  it("supports undo redo canvas size grid and inspector editing", () => {
    const container = renderApp();
    const undo = container.querySelector<HTMLButtonElement>('button[aria-label="暂无可撤销操作"]')
      ?? container.querySelector<HTMLButtonElement>('.topbar-actions button[title^="撤销"]')!;
    const redo = container.querySelector<HTMLButtonElement>('button[aria-label="暂无可重做操作"]')
      ?? container.querySelector<HTMLButtonElement>('.topbar-actions button[title^="重做"]')!;
    expect(undo.disabled).toBe(true);
    expect(redo.disabled).toBe(true);

    openGlobalSettingsSection(container, "cards");
    click(container.querySelector<HTMLInputElement>("#cards-compact-layout")!);
    const settingsUndo = container.querySelector<HTMLButtonElement>(".global-settings-history button:first-child")!;
    const settingsRedo = container.querySelector<HTMLButtonElement>(".global-settings-history button:nth-child(2)")!;
    expect(settingsUndo.disabled).toBe(false);

    click(settingsUndo);
    expect(container.querySelector<HTMLInputElement>("#cards-compact-layout")?.checked).toBe(false);
    expect(settingsRedo.disabled).toBe(false);
    click(settingsRedo);
    expect(container.querySelector<HTMLInputElement>("#cards-compact-layout")?.checked).toBe(true);
    click(container.querySelector<HTMLButtonElement>('button[aria-label="返回编辑器"]')!);

    click(container.querySelector<HTMLButtonElement>('button[aria-label="打开网格"]')!);
    expect(container.querySelector("[data-editor-grid]")).not.toBeNull();
    changeInput(container.querySelector<HTMLInputElement>("#editor-grid-size")!, "40");
    expect(container.querySelector("[data-editor-grid]")?.getAttribute("data-grid-size")).toBe("40");

    click(container.querySelector<HTMLButtonElement>('button[aria-label="打开全局设置"]')!);
    changeSelect(container.querySelector<HTMLSelectElement>("#canvas-size-preset")!, "square-1080");
    click(container.querySelector<HTMLButtonElement>('button[aria-label="返回编辑器"]')!);
    const svg = container.querySelector("svg.poster")!;
    expect(svg.getAttribute("viewBox")).toBe("0 0 1080 1080");
  }, 40_000);

  it("applies persisted preview frame modes to canvas drag rendering", () => {
    window.localStorage.setItem("cengfan-map-studio:render-settings", JSON.stringify({ mode: "low", fixedFps: 24 }));
    const container = renderApp(false);
    const poster = container.querySelector<SVGSVGElement>("svg.poster")!;

    expect(poster.getAttribute("data-render-interval-ms")).toBe("100");

    changeSelect(container.querySelector<HTMLSelectElement>("#editor-render-mode")!, "fixed");
    const fpsInput = container.querySelector<HTMLInputElement>("#editor-render-fps")!;
    expect(fpsInput.min).toBe("5");
    expect(fpsInput.max).toBe("60");
    expect(fpsInput.step).toBe("0.1");
    changeInput(fpsInput, "5");

    expect(poster.getAttribute("data-render-interval-ms")).toBe("200");
  });
});

describe("App workflow guidance", () => {
  it("keeps workflow navigation only in the top stepper", () => {
    const container = renderApp();

    expect(container.querySelector(".workspace-nav")).toBeNull();
    expect(container.querySelectorAll(".topbar .workflow-stage-stepper button")).toHaveLength(6);
  });

  it("switches the editor theme without changing poster data or viewBox", () => {
    const container = renderApp();
    const shell = container.querySelector<HTMLElement>(".app-shell")!;
    const poster = container.querySelector<SVGSVGElement>("svg.poster")!;
    const toggle = container.querySelector<HTMLButtonElement>('[aria-label="切换到暗色模式"]')!;

    expect(shell.dataset.editorTheme).toBe("light");
    const viewBox = poster.getAttribute("viewBox");
    click(toggle);

    expect(shell.dataset.editorTheme).toBe("dark");
    expect(poster.getAttribute("viewBox")).toBe(viewBox);
    expect(window.localStorage.getItem("cengfan-map-studio:theme-mode")).toBe("dark");
  });

  it("renders the workflow guide in the topbar with roster as the initial step", () => {
    const container = renderLegacyApp();
    openWorkflowGuide(container);
    const steps = Array.from(container.querySelectorAll(".workflow-nav button"));

    expect(steps.length).toBe(5);
    // 顶栏状态条展示当前步骤与进度
    expect(container.querySelector(".topbar .workflow-guide__bar")?.textContent).toContain("准备名单");
    expect(container.querySelectorAll(".workflow-guide__dot")).toHaveLength(5);
    const active = steps.find((button) => button.getAttribute("aria-current") === "step");
    expect(active?.textContent).toContain("准备名单");
    // 默认样例名单可直接进入后续步骤
    expect(steps[0]?.querySelector(".workflow-nav__badge")?.getAttribute("data-status")).toBe("ready");
  });

  it("switches map presentation inline from the presentation step", () => {
    const container = renderApp();
    openWorkflowGuide(container);
    click(Array.from(container.querySelectorAll(".workflow-nav button"))
      .find((button) => button.textContent?.includes("地图呈现"))!);

    const heat = Array.from(container.querySelectorAll(".workflow-step-panel button"))
      .find((button) => button.textContent?.trim() === "人数热力")!;
    click(heat);

    expect(container.querySelector(".project-summary")?.textContent).toContain("颜色表达数量");
  });

  it("opens the fullscreen global layout from the layout step", () => {
    const container = renderApp();
    openWorkflowGuide(container);
    click(Array.from(container.querySelectorAll(".workflow-nav button"))
      .find((button) => button.textContent?.includes("全局布局"))!);
    click(Array.from(container.querySelectorAll(".workflow-step-panel button"))
      .find((button) => button.textContent?.trim() === "画布")!);

    expect(container.querySelector(".global-settings-screen")).not.toBeNull();
    expect(container.querySelector('[role="tab"][aria-controls="global-settings-canvas"]')?.getAttribute("aria-selected")).toBe("true");
  });

  it("selecting a province focuses the material workspace and its inspector", () => {
    const container = renderApp();
    click(container.querySelector("[data-province-hit]")!);
    openWorkflowGuide(container);
    click(Array.from(container.querySelectorAll(".workflow-nav button"))
      .find((button) => button.textContent?.includes("局部调整"))!);

    const assetsStep = container.querySelector<HTMLButtonElement>('.topbar .workflow-stepper button[aria-label="素材"]')!;
    expect(assetsStep.className).toContain("is-active");
    expect(container.querySelector(".inspector h2")?.textContent).toContain("北京市");
    expect(container.querySelector('[aria-label="局部调整"]')?.textContent).toContain("当前选中：北京市");
  });

  it("applies a template from the layout workflow step", () => {
    const container = renderApp();
    openWorkflowGuide(container);
    click(Array.from(container.querySelectorAll(".workflow-nav button"))
      .find((button) => button.textContent?.includes("全局布局"))!);
    click(Array.from(container.querySelectorAll(".workflow-template-grid button"))
      .find((button) => button.textContent?.trim() === "卡通画风")!);

    // 应用后流程第 3 步的模板按钮应高亮为选中
    const cartoon = Array.from(container.querySelectorAll(".workflow-template-grid button"))
      .find((button) => button.textContent?.trim() === "卡通画风")!;
    expect(cartoon.className).toContain("selected");
    expect(container.querySelector(".project-summary")?.textContent).toContain("已记录 1 步");
  });

  it("shows the current workflow context without duplicating workflow controls", () => {
    const container = renderApp();
    openGlobalSettingsSection(container, "canvas");

    expect(container.querySelector(".global-settings-screen .workflow-guide")).toBeNull();
    expect(container.querySelector(".global-settings-guide__step")?.textContent).toContain("全局布局");
    expect(container.querySelector(".global-settings-guide__note")?.textContent).toContain("集中设置画布");
    click(container.querySelector<HTMLButtonElement>('[role="tab"][aria-controls="global-settings-map"]')!);
    expect(container.querySelector('[role="tab"][aria-controls="global-settings-map"]')?.getAttribute("aria-selected")).toBe("true");
    expect(container.querySelector('[role="tab"][aria-controls="global-settings-canvas"]')?.getAttribute("aria-selected")).toBe("false");
  });

  it("applies a template from the template picker inside global settings", () => {
    const container = renderApp();
    openGlobalSettingsSection(container, "canvas");

    // 数据板块分区（数据展示视图）包含整体模板区块
    click(container.querySelector<HTMLButtonElement>('[role="tab"][aria-controls="global-settings-cards"]')!);
    click(container.querySelector<HTMLButtonElement>('button[aria-label="数据展示设置"]')!);
    const picker = container.querySelector(".global-settings-screen .template-picker");
    expect(picker).not.toBeNull();
    expect(picker?.textContent).toContain("整体模板");
    expect(Array.from(picker!.querySelectorAll(".workflow-template-grid button")).map((b) => b.textContent?.trim()))
      .toContain("原始地图");
    expect(picker!.querySelector(".workflow-template-grid button.selected")?.textContent).toContain("原始地图");

    // 应用卡通画风 → 模板高亮切换
    click(Array.from(picker!.querySelectorAll(".workflow-template-grid button"))
      .find((button) => button.textContent?.trim() === "卡通画风")!);
    expect(picker!.querySelector(".workflow-template-grid button.selected")?.textContent).toContain("卡通画风");
    // 返回编辑器后项目历史已记录模板应用
    click(container.querySelector<HTMLButtonElement>('button[aria-label="返回编辑器"]')!);
    expect(container.querySelector(".project-summary")?.textContent).toContain("已记录 1 步");
  });

  it("shows the roster step badge on the data section nav entry", () => {
    const container = renderApp();
    openGlobalSettingsSection(container, "canvas");

    // 默认样例名单全部就绪 → 数据板块导航条目显示就绪徽标
    const cardsTab = container.querySelector<HTMLButtonElement>('[role="tab"][aria-controls="global-settings-cards"]')!;
    const badge = cardsTab.querySelector(".global-settings-nav__badge");
    expect(badge).not.toBeNull();
    expect(badge?.getAttribute("data-status")).toBe("ready");
    expect(badge?.textContent).toBe("✓");
  });
});

describe("Responsive editor shell", () => {
  it("restores adjustable desktop panel widths and exposes two separators", () => {
    const previousInnerWidth = window.innerWidth;
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 1440 });
    window.localStorage.setItem(EDITOR_PANEL_LAYOUT_STORAGE_KEY, JSON.stringify({ sidebarWidth: 270, inspectorWidth: 330 }));
    try {
      const container = renderApp(false);
      const workspace = container.querySelector<HTMLElement>(".workspace");

      expect(workspace?.style.getPropertyValue("--sidebar-width")).toBe("270px");
      expect(workspace?.style.getPropertyValue("--inspector-width")).toBe("330px");
      expect(container.querySelectorAll('[role="separator"]')).toHaveLength(2);
      expect(container.querySelector<HTMLElement>('[role="separator"][aria-label="调整左侧栏宽度"]')?.getAttribute("aria-valuenow")).toBe("270");
      expect(container.querySelector<HTMLElement>('[role="separator"][aria-label="调整右侧栏宽度"]')?.getAttribute("aria-valuenow")).toBe("330");
    } finally {
      Object.defineProperty(window, "innerWidth", { configurable: true, value: previousInnerWidth });
    }
  });

  it("opens and closes the inspector through an explicit toolbar control", () => {
    const container = renderApp();
    const openButton = container.querySelector<HTMLButtonElement>('button[aria-label="打开属性面板"]');

    expect(openButton).not.toBeNull();
    expect(openButton?.getAttribute("aria-expanded")).toBe("false");
    click(openButton!);

    expect(container.querySelector(".inspector")?.className).toContain("is-open");
    expect(openButton?.getAttribute("aria-expanded")).toBe("true");

    click(container.querySelector<HTMLButtonElement>('button[aria-label="关闭属性面板"]')!);
    expect(container.querySelector(".inspector")?.className).not.toContain("is-open");
  });

  it("keeps the top stepper as the only workflow navigation entry", () => {
    const container = renderApp();
    openGlobalSettingsSection(container, "canvas");

    expect(container.querySelector(".global-settings-screen .workflow-guide")).toBeNull();
    expect(container.querySelector(".global-settings-guide__note")).not.toBeNull();
  });

  it("keeps the global settings back label in an accessible text wrapper", () => {
    const container = renderApp();
    openGlobalSettingsSection(container, "canvas");

    expect(container.querySelector<HTMLButtonElement>('button[aria-label="返回编辑器"] span')?.textContent).toContain("返回编辑器");
  });
});
