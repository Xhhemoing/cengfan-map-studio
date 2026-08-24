import { afterEach, describe, expect, it, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { flushSync } from "react-dom";
import { ProjectWorkbench } from "./ProjectWorkbench";
import { createMemoryProjectStore, createSampleProject } from "../lib/project-store";
import { serializeProjectPackage, type ProjectPackage } from "../lib/project-package";
import { MAX_PROJECT_PACKAGE_BYTES } from "../lib/import-file-limits";
import { loadLocalWorkspaceEntry } from "../lib/local-workspace-entry";

vi.mock("../lib/local-workspace-entry", () => ({
  loadLocalWorkspaceEntry: vi.fn(async () => null),
}));

let roots: Array<{ root: Root; container: HTMLElement }> = [];
function renderWorkbench(store: ReturnType<typeof createMemoryProjectStore>, navigate = vi.fn()) {
  const container = document.createElement("div");
  // 菜单的外点关闭与焦点管理依赖真实文档树，容器必须挂到 body 上。
  document.body.appendChild(container);
  const root = createRoot(container);
  roots.push({ root, container });
  flushSync(() => root.render(<ProjectWorkbench store={store} navigate={navigate} />));
  return { container, navigate };
}

function click(element: Element): void {
  flushSync(() => element.dispatchEvent(new MouseEvent("click", { bubbles: true })));
}

function changeInput(input: HTMLInputElement, value: string): void {
  flushSync(() => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")?.set?.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

const duplicateFont = {
  id: "font-1",
  label: "手写体",
  family: "font-1",
  src: "data:font/ttf;base64,AA==",
  format: "truetype" as const,
  source: "user" as const,
};

/** 同一份字体字节挂在两个 id 上：解析时会被合并成一份，从而带出 `pack.warnings`。 */
function packWithStrippedFonts(base: ProjectPackage): ProjectPackage {
  return { ...base, fonts: [duplicateFont, { ...duplicateFont, id: "font-2", label: "手写体副本", family: "font-2" }] };
}

/** 真造一份 24MB 文件会把测试拖垮，只改 `size` 就够触发体积闸门。 */
function fileOfSize(content: string, name: string, size: number): File {
  const file = new File([content], name, { type: "application/json" });
  Object.defineProperty(file, "size", { value: size, configurable: true });
  return file;
}

function selectFile(input: HTMLInputElement, file: File): void {
  Object.defineProperty(input, "files", { value: [file] as unknown as FileList, configurable: true });
  input.dispatchEvent(new Event("change", { bubbles: true }));
}

async function renderWithImportInput(store: ReturnType<typeof createMemoryProjectStore>) {
  const { container } = renderWorkbench(store);
  await vi.waitFor(() => expect(container.querySelector('input[type="file"]')).not.toBeNull());
  return { container, input: container.querySelector<HTMLInputElement>('input[type="file"]')! };
}

function buttonByLabel(scope: ParentNode, label: string): HTMLButtonElement {
  return Array.from(scope.querySelectorAll("button")).find((button) => button.textContent?.trim() === label)!;
}

afterEach(() => {
  roots.forEach(({ root, container }) => {
    root.unmount();
    container.remove();
  });
  roots = [];
  window.localStorage.clear();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("ProjectWorkbench", () => {
  it("applies the saved atelier skin tokens on the workbench shell", async () => {
    window.localStorage.setItem("cengfan-map-studio:ui-skin", "atelier");
    const store = createMemoryProjectStore();
    const { container } = renderWorkbench(store);
    await vi.waitFor(() => expect(container.querySelector(".workbench-shell")).not.toBeNull());
    const shell = container.querySelector(".workbench-shell")!;
    expect(shell.classList.contains("app-shell")).toBe(true);
    expect(shell.getAttribute("data-editor-skin")).toBe("atelier");
    expect(shell.getAttribute("data-editor-theme")).toMatch(/^(light|dark)$/);
  });

  it("seeds the sample project when the store is empty", async () => {
    const store = createMemoryProjectStore();
    const { container } = renderWorkbench(store);
    await vi.waitFor(() => expect(container.textContent).toContain("示例：2026届毕业去向"));
    expect(await store.list()).toHaveLength(1);
  });

  it("renders existing projects as cards", async () => {
    const store = createMemoryProjectStore();
    await store.put(createSampleProject());
    const { container } = renderWorkbench(store);
    await vi.waitFor(() => expect(container.textContent).toContain("示例：2026届毕业去向"));
  });

  it("navigates to the editor when a card is opened", async () => {
    const store = createMemoryProjectStore();
    const sample = createSampleProject();
    await store.put(sample);
    const navigate = vi.fn();
    const { container } = renderWorkbench(store, navigate);
    await vi.waitFor(() => expect(container.querySelector('[aria-label^="打开项目"]')).not.toBeNull());
    container.querySelector<HTMLButtonElement>('[aria-label^="打开项目"]')?.click();
    expect(navigate).toHaveBeenCalledWith(`#/project/${sample.id}`);
  });

  it("creates a new empty project and navigates to it", async () => {
    const store = createMemoryProjectStore();
    const navigate = vi.fn();
    const { container } = renderWorkbench(store, navigate);
    await vi.waitFor(() => expect(container.querySelector('[aria-label="新建项目"]')).not.toBeNull());
    container.querySelector<HTMLButtonElement>('[aria-label="新建项目"]')?.click();
    await vi.waitFor(() => expect(navigate).toHaveBeenCalled());
    const projects = await store.list();
    expect(projects.some((p) => p.pack.project.students.length === 0)).toBe(true);
  });

  it("duplicates a project", async () => {
    const store = createMemoryProjectStore();
    await store.put(createSampleProject());
    const { container } = renderWorkbench(store);
    await vi.waitFor(() => expect(container.querySelector('[aria-label="项目菜单"]')).not.toBeNull());
    container.querySelector<HTMLButtonElement>('[aria-label="项目菜单"]')?.click();
    await vi.waitFor(() => expect(container.textContent).toContain("复制"));
    Array.from(container.querySelectorAll("button")).find((b) => b.textContent?.includes("复制"))?.click();
    await vi.waitFor(async () => {
      const projects = await store.list();
      expect(projects.some((p) => p.name.includes("副本"))).toBe(true);
    });
  });

  it("imports a cengfan sample package and keeps the display name", async () => {
    const store = createMemoryProjectStore();
    const sample = createSampleProject();
    await store.put(sample);
    const file = new File([serializeProjectPackage(sample.pack)], "示例项目.cengfan", { type: "application/json" });
    const { container } = renderWorkbench(store);
    await vi.waitFor(() => expect(container.querySelector('input[type="file"]')).not.toBeNull());
    const input = container.querySelector<HTMLInputElement>('input[type="file"]');
    expect(input?.accept).toContain(".cengfan");
    Object.defineProperty(input!, "files", { value: [file] as unknown as FileList, configurable: true });
    input!.dispatchEvent(new Event("change", { bubbles: true }));
    await vi.waitFor(async () => {
      const projects = await store.list();
      expect(projects).toHaveLength(2);
      expect(projects.some((p) => p.name === "示例项目")).toBe(true);
    });
  });

  it("imports a project package file", async () => {
    const store = createMemoryProjectStore();
    const sample = createSampleProject();
    await store.put(sample);
    const file = new File([serializeProjectPackage(sample.pack)], "project.json", { type: "application/json" });
    const { container } = renderWorkbench(store);
    await vi.waitFor(() => expect(container.querySelector('input[type="file"]')).not.toBeNull());
    const input = container.querySelector<HTMLInputElement>('input[type="file"]');
    Object.defineProperty(input!, "files", { value: [file] as unknown as FileList, configurable: true });
    input!.dispatchEvent(new Event("change", { bubbles: true }));
    await vi.waitFor(async () => {
      const projects = await store.list();
      expect(projects).toHaveLength(2);
      expect(projects.some((p) => p.name === "project")).toBe(true);
    });
  });

  it("导入后展示被剥离的内容，且不把 warnings 写进项目库", async () => {
    const store = createMemoryProjectStore();
    const sample = createSampleProject();
    await store.put(sample);
    const file = new File([serializeProjectPackage(packWithStrippedFonts(sample.pack))], "合并字体.json", { type: "application/json" });
    const { container, input } = await renderWithImportInput(store);
    selectFile(input, file);

    await vi.waitFor(() => expect(container.querySelector(".workbench-error--notice")).not.toBeNull());
    const notice = container.querySelector(".workbench-error--notice")!;
    expect(notice.getAttribute("role")).toBe("status");
    expect(notice.textContent).toContain("导入成功，但已剥离超限内容");
    expect(notice.textContent).toContain("字体与包内其他字体内容相同");
    // 剥离是提示不是失败，报错横幅不该跟着亮起。
    expect(container.querySelector('.workbench-error[role="alert"]')).toBeNull();

    const imported = (await store.list()).find((project) => project.name === "合并字体")!;
    expect("warnings" in imported.pack).toBe(false);
    expect(imported.pack.fonts).toHaveLength(1);
  });

  it("没有剥离时不挂提示条", async () => {
    const store = createMemoryProjectStore();
    const sample = createSampleProject();
    await store.put(sample);
    const file = new File([serializeProjectPackage(sample.pack)], "干净工程.json", { type: "application/json" });
    const { container, input } = await renderWithImportInput(store);
    selectFile(input, file);

    await vi.waitFor(async () => expect(await store.list()).toHaveLength(2));
    expect(container.querySelector(".workbench-error--notice")).toBeNull();
  });

  it("换一份干净工程包后清掉上一次的剥离提示", async () => {
    const store = createMemoryProjectStore();
    const sample = createSampleProject();
    await store.put(sample);
    const { container, input } = await renderWithImportInput(store);
    selectFile(input, new File([serializeProjectPackage(packWithStrippedFonts(sample.pack))], "合并字体.json", { type: "application/json" }));
    await vi.waitFor(() => expect(container.querySelector(".workbench-error--notice")).not.toBeNull());

    selectFile(input, new File([serializeProjectPackage(sample.pack)], "干净工程.json", { type: "application/json" }));
    await vi.waitFor(async () => expect(await store.list()).toHaveLength(3));
    expect(container.querySelector(".workbench-error--notice")).toBeNull();
  });

  it("继续编辑本地内容时不把 warnings 存进项目库", async () => {
    const store = createMemoryProjectStore();
    const sample = createSampleProject();
    vi.mocked(loadLocalWorkspaceEntry).mockResolvedValueOnce({
      // exportedAt 与播种的示例项目错开，否则会被当成同一份内容直接打开而不入库。
      pack: { ...sample.pack, exportedAt: "2026-07-27T00:00:00.000Z", warnings: ["1 个字体与包内其他字体内容相同，已合并为一份，相关文字改用保留的那份"] },
      source: "mirror",
    });
    const { container } = renderWorkbench(store);
    await vi.waitFor(() => expect(container.querySelector('[aria-label="继续编辑本地内容"]')).not.toBeNull());

    click(container.querySelector('[aria-label="继续编辑本地内容"]')!);

    await vi.waitFor(async () => expect((await store.list()).some((project) => project.name.startsWith("本地内容"))).toBe(true));
    const resumed = (await store.list()).find((project) => project.name.startsWith("本地内容"))!;
    expect("warnings" in resumed.pack).toBe(false);
  });

  it("拒绝超过上限的工程包，且不把文件读进内存", async () => {
    const store = createMemoryProjectStore();
    const sample = createSampleProject();
    await store.put(sample);
    const file = fileOfSize(serializeProjectPackage(sample.pack), "巨大工程.cengfan", MAX_PROJECT_PACKAGE_BYTES + 1);
    const text = vi.spyOn(file, "text");
    const { container, input } = await renderWithImportInput(store);
    selectFile(input, file);

    await vi.waitFor(() => expect(container.querySelector(".workbench-error")?.textContent).toContain("工程包过大"));
    const banner = container.querySelector(".workbench-error")!;
    expect(banner.textContent).toContain("导入失败");
    expect(banner.textContent).toContain("上限 24.0 MB");
    expect(banner.textContent).toContain("请在导出时取消勾选");
    // 超限的文件连读都不读，避免主线程被整份 JSON 卡住。
    expect(text).not.toHaveBeenCalled();
    expect(await store.list()).toHaveLength(1);
    // 拒绝后清空 input，用户换一份小文件仍能触发 change。
    expect(input.value).toBe("");
  });

  it("恰好等于上限的工程包仍然导入", async () => {
    const store = createMemoryProjectStore();
    const sample = createSampleProject();
    await store.put(sample);
    const file = fileOfSize(serializeProjectPackage(sample.pack), "临界工程.json", MAX_PROJECT_PACKAGE_BYTES);
    const { container, input } = await renderWithImportInput(store);
    selectFile(input, file);

    await vi.waitFor(async () => expect(await store.list()).toHaveLength(2));
    expect(container.querySelector(".workbench-error")).toBeNull();
  });

  it("shows an error banner for an invalid project package", async () => {
    const store = createMemoryProjectStore();
    await store.put(createSampleProject());
    const file = new File(["not-json"], "broken.json", { type: "application/json" });
    const { container } = renderWorkbench(store);
    await vi.waitFor(() => expect(container.querySelector('input[type="file"]')).not.toBeNull());
    const input = container.querySelector<HTMLInputElement>('input[type="file"]');
    Object.defineProperty(input!, "files", { value: [file] as unknown as FileList, configurable: true });
    input!.dispatchEvent(new Event("change", { bubbles: true }));
    await vi.waitFor(() => expect(container.textContent).toContain("导入失败"));
    expect(container.querySelector(".workbench-error")?.textContent).toContain("导入失败");
    expect(await store.list()).toHaveLength(1);
  });

  it("shows an error banner when the store write fails during creation", async () => {
    const store = createMemoryProjectStore();
    const failingStore = { ...store, put: () => Promise.reject(new Error("配额不足")) };
    const { container } = renderWorkbench(failingStore);
    // 种子 IIFE 写入失败 → 横幅出现;错误存在时空态文案不显示
    await vi.waitFor(() => expect(container.querySelector(".workbench-error")?.textContent).toContain("初始化项目失败"));
    expect(container.querySelector(".workbench-empty")).toBeNull();
    expect(container.textContent).not.toContain("还没有项目");
    // 新建项目写入失败 → 横幅切换为创建失败
    container.querySelector<HTMLButtonElement>('[aria-label="新建项目"]')?.click();
    await vi.waitFor(() => expect(container.querySelector(".workbench-error")?.textContent).toContain("创建项目失败"));
    expect(container.querySelector(".workbench-error")?.textContent).toContain("配额不足");
  });

  describe("卡片菜单的键盘与焦点行为", () => {
    async function openCardMenu() {
      const store = createMemoryProjectStore();
      await store.put(createSampleProject());
      const { container } = renderWorkbench(store);
      await vi.waitFor(() => expect(container.querySelector('[aria-label="项目菜单"]')).not.toBeNull());
      const trigger = container.querySelector<HTMLButtonElement>('[aria-label="项目菜单"]')!;
      trigger.click();
      await vi.waitFor(() => expect(container.querySelector('[role="menu"]')).not.toBeNull());
      const menu = container.querySelector<HTMLElement>('[role="menu"]')!;
      const items = Array.from(menu.querySelectorAll<HTMLButtonElement>('[role="menuitem"]'));
      return { container, trigger, menu, items };
    }

    function pressKey(target: HTMLElement, key: string) {
      target.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
    }

    it("exposes menu semantics on the trigger button", async () => {
      const { trigger, menu } = await openCardMenu();
      expect(trigger.getAttribute("aria-haspopup")).toBe("menu");
      expect(trigger.getAttribute("aria-expanded")).toBe("true");
      expect(trigger.getAttribute("aria-controls")).toBe(menu.id);
      expect(menu.id).not.toBe("");
      expect(menu.getAttribute("aria-labelledby")).toBe(trigger.id);
    });

    it("moves focus into the menu when it opens", async () => {
      const { items } = await openCardMenu();
      expect(items).toHaveLength(4);
      expect(document.activeElement).toBe(items[0]);
      expect(items[0].tabIndex).toBe(0);
      expect(items[1].tabIndex).toBe(-1);
    });

    it("cycles focus across menu items with the arrow keys", async () => {
      const { menu, items } = await openCardMenu();
      pressKey(document.activeElement as HTMLElement, "ArrowDown");
      expect(document.activeElement).toBe(items[1]);
      pressKey(document.activeElement as HTMLElement, "ArrowUp");
      expect(document.activeElement).toBe(items[0]);
      // 首项再往上应回环到末项
      pressKey(document.activeElement as HTMLElement, "ArrowUp");
      expect(document.activeElement).toBe(items[items.length - 1]);
      // 末项再往下应回环到首项
      pressKey(document.activeElement as HTMLElement, "ArrowDown");
      expect(document.activeElement).toBe(items[0]);
      pressKey(menu, "End");
      expect(document.activeElement).toBe(items[items.length - 1]);
      pressKey(menu, "Home");
      expect(document.activeElement).toBe(items[0]);
    });

    it("closes on Escape and returns focus to the trigger", async () => {
      const { container, trigger } = await openCardMenu();
      pressKey(document.activeElement as HTMLElement, "Escape");
      await vi.waitFor(() => expect(container.querySelector('[role="menu"]')).toBeNull());
      expect(document.activeElement).toBe(trigger);
      expect(trigger.getAttribute("aria-expanded")).toBe("false");
    });

    it("closes when clicking outside the menu", async () => {
      const { container, trigger } = await openCardMenu();
      container.querySelector<HTMLElement>(".workbench-grid")!.click();
      await vi.waitFor(() => expect(container.querySelector('[role="menu"]')).toBeNull());
      expect(trigger.getAttribute("aria-expanded")).toBe("false");
    });

    it("keeps the menu open while interacting inside it", async () => {
      const { container, menu } = await openCardMenu();
      menu.click();
      await Promise.resolve();
      expect(container.querySelector('[role="menu"]')).not.toBeNull();
    });
  });

  describe("重命名与删除对话框", () => {
    async function openMenuItem(item: "重命名" | "删除") {
      const store = createMemoryProjectStore();
      const sample = createSampleProject();
      await store.put(sample);
      const { container } = renderWorkbench(store);
      await vi.waitFor(() => expect(container.querySelector('[aria-label="项目菜单"]')).not.toBeNull());
      const trigger = container.querySelector<HTMLButtonElement>('[aria-label="项目菜单"]')!;
      click(trigger);
      await vi.waitFor(() => expect(container.querySelector('[role="menu"]')).not.toBeNull());
      click(buttonByLabel(container.querySelector('[role="menu"]')!, item));
      const dialog = container.querySelector<HTMLElement>('[role="dialog"]')!;
      expect(dialog).not.toBeNull();
      // 对话框接管交互后卡片菜单收起，两层浮层不会同时抢焦点。
      expect(container.querySelector('[role="menu"]')).toBeNull();
      return { container, store, sample, trigger, dialog };
    }

    function pressEscape(target: Element) {
      flushSync(() => target.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
    }

    function pressTab(target: Element, shiftKey = false) {
      flushSync(() => target.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true, shiftKey })));
    }

    it("不再依赖 window.prompt / window.confirm", async () => {
      const prompt = vi.spyOn(window, "prompt").mockReturnValue(null);
      const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
      await openMenuItem("重命名");
      await openMenuItem("删除");
      expect(prompt).not.toHaveBeenCalled();
      expect(confirm).not.toHaveBeenCalled();
    });

    it("预填原项目名并全选，提交后写回新名称", async () => {
      const { container, store, sample, trigger, dialog } = await openMenuItem("重命名");
      const input = dialog.querySelector<HTMLInputElement>('input[aria-label="项目名称"]')!;
      expect(input.value).toBe(sample.name);
      expect(document.activeElement).toBe(input);
      expect(input.selectionStart).toBe(0);
      expect(input.selectionEnd).toBe(sample.name.length);

      changeInput(input, "高三3班");
      click(buttonByLabel(dialog, "保存"));

      expect(container.querySelector('[role="dialog"]')).toBeNull();
      // 对话框关闭后焦点回到菜单按钮，键盘用户能接着操作同一张卡片。
      expect(document.activeElement).toBe(trigger);
      await vi.waitFor(() => expect(container.textContent).toContain("高三3班"));
      const projects = await store.list();
      expect(projects).toHaveLength(1);
      expect(projects[0].name).toBe("高三3班");
    });

    it("名称为空时禁用保存并拒绝提交", async () => {
      const { store, sample, dialog } = await openMenuItem("重命名");
      const input = dialog.querySelector<HTMLInputElement>('input[aria-label="项目名称"]')!;
      const submit = buttonByLabel(dialog, "保存");
      expect(submit.disabled).toBe(false);

      changeInput(input, "   ");
      expect(submit.disabled).toBe(true);
      click(submit);
      expect(dialog.isConnected).toBe(true);

      changeInput(input, "高三3班");
      expect(submit.disabled).toBe(false);
      expect((await store.list())[0].name).toBe(sample.name);
    });

    it("取消重命名保留原名并把焦点还给菜单按钮", async () => {
      const { container, store, sample, trigger, dialog } = await openMenuItem("重命名");
      changeInput(dialog.querySelector<HTMLInputElement>('input[aria-label="项目名称"]')!, "不该保存");
      click(buttonByLabel(dialog, "取消"));

      expect(container.querySelector('[role="dialog"]')).toBeNull();
      expect(document.activeElement).toBe(trigger);
      const projects = await store.list();
      expect(projects).toHaveLength(1);
      expect(projects[0].name).toBe(sample.name);
    });

    it("Esc 关闭重命名对话框并把焦点还给菜单按钮", async () => {
      const { container, store, sample, trigger } = await openMenuItem("重命名");
      pressEscape(document.activeElement!);

      expect(container.querySelector('[role="dialog"]')).toBeNull();
      expect(document.activeElement).toBe(trigger);
      expect((await store.list())[0].name).toBe(sample.name);
    });

    it("重命名对话框把 Tab 圈在面板内", async () => {
      const { container, dialog } = await openMenuItem("重命名");
      const panel = dialog.querySelector<HTMLElement>(".workbench-dialog__panel")!;
      const input = dialog.querySelector<HTMLInputElement>('input[aria-label="项目名称"]')!;
      const submit = buttonByLabel(dialog, "保存");
      expect(panel.contains(document.activeElement)).toBe(true);

      // 末尾再按 Tab 回到开头，不会走到对话框背后的新建/导入按钮上。
      submit.focus();
      pressTab(submit);
      expect(document.activeElement).toBe(input);

      pressTab(input, true);
      expect(document.activeElement).toBe(submit);

      // 焦点被别的方式挪到背后（比如点了遮罩）时，下一次 Tab 也会收回面板。
      const outside = container.querySelector<HTMLButtonElement>('[aria-label="新建项目"]')!;
      outside.focus();
      pressTab(outside);
      expect(panel.contains(document.activeElement)).toBe(true);
    });

    it("删除确认框把 Tab 圈在面板内，默认焦点仍在取消上", async () => {
      const { dialog } = await openMenuItem("删除");
      const panel = dialog.querySelector<HTMLElement>(".workbench-dialog__panel")!;
      const cancel = buttonByLabel(dialog, "取消");
      const remove = buttonByLabel(dialog, "删除");
      expect(document.activeElement).toBe(cancel);

      remove.focus();
      pressTab(remove);
      expect(document.activeElement).toBe(cancel);

      pressTab(cancel, true);
      expect(document.activeElement).toBe(remove);
      expect(panel.contains(document.activeElement)).toBe(true);
    });

    it("点击遮罩关闭重命名对话框", async () => {
      const { container, store, sample, trigger, dialog } = await openMenuItem("重命名");
      click(dialog.querySelector(".workbench-dialog__backdrop")!);

      expect(container.querySelector('[role="dialog"]')).toBeNull();
      expect(document.activeElement).toBe(trigger);
      expect((await store.list())[0].name).toBe(sample.name);
    });

    it("删除确认框明示不可恢复，确认后移除项目", async () => {
      const { container, store, sample, dialog } = await openMenuItem("删除");
      expect(dialog.textContent).toContain(sample.name);
      const hint = document.getElementById(dialog.getAttribute("aria-describedby")!);
      expect(hint?.textContent).toContain("删除后不可恢复");
      // 默认焦点落在「取消」，回车不会误删。
      expect(document.activeElement).toBe(buttonByLabel(dialog, "取消"));

      click(buttonByLabel(dialog, "删除"));
      expect(container.querySelector('[role="dialog"]')).toBeNull();
      await vi.waitFor(async () => expect(await store.list()).toHaveLength(0));
    });

    it("取消删除保留项目并把焦点还给菜单按钮", async () => {
      const { container, store, sample, trigger, dialog } = await openMenuItem("删除");
      click(buttonByLabel(dialog, "取消"));

      expect(container.querySelector('[role="dialog"]')).toBeNull();
      expect(document.activeElement).toBe(trigger);
      const projects = await store.list();
      expect(projects).toHaveLength(1);
      expect(projects[0].id).toBe(sample.id);
    });

    it("Esc 关闭删除确认框并把焦点还给菜单按钮", async () => {
      const { container, store, trigger } = await openMenuItem("删除");
      pressEscape(document.activeElement!);

      expect(container.querySelector('[role="dialog"]')).toBeNull();
      expect(document.activeElement).toBe(trigger);
      expect(await store.list()).toHaveLength(1);
    });
  });

  it("retries seeding after a failed seed", async () => {
    const store = createMemoryProjectStore();
    const putSpy = vi.spyOn(store, "put").mockRejectedValueOnce(new Error("quota"));
    const first = renderWorkbench(store);
    // 首次播种失败 → 错误横幅,store 仍为空
    await vi.waitFor(() => expect(first.container.querySelector(".workbench-error")?.textContent).toContain("初始化项目失败"));
    expect(await store.list()).toHaveLength(0);

    putSpy.mockRestore();
    // 重新进入工作台(重新挂载)自动重试播种
    const second = renderWorkbench(store);
    await vi.waitFor(() => expect(second.container.textContent).toContain("示例：2026届毕业去向"));
    expect(await store.list()).toHaveLength(1);
  });
});
