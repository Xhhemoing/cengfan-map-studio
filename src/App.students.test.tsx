// Split from src/App.test.tsx: student data center editing, row/marker
// linkage and pasted-text import. Helpers: src/test-utils/app-harness.tsx.
import { describe, expect, it, vi } from "vitest";
import { createProjectDocument, serializeProjectDocument } from "./lib/project-document";
import { sampleStudents } from "./lib/project-data";
import {
  changeInput,
  changeSelect,
  click,
  installAppTestHarness,
  leaveFocusedWorkspace,
  openPeopleData,
  openRailAdvancedTab,
  renderApp,
} from "./test-utils/app-harness";

installAppTestHarness();

describe("App student data editing", () => {
  it("opens the rebuilt student data center from fullscreen data settings and exposes map expressions", async () => {
    const container = renderApp();
    const { act } = await import("react");
    openRailAdvancedTab(container);
    click(container.querySelector<HTMLButtonElement>('button[aria-label="打开全局设置"]')!);
    // GlobalSettingsScreen is lazy: flush the module-resolution microtask before
    // clicking a tab inside it.
    await act(async () => {});
    click(container.querySelector<HTMLButtonElement>('[role="tab"][aria-controls="global-settings-cards"]')!);

    expect(container.textContent).toContain("学生数据中心");
    expect(container.querySelector(".student-table")).not.toBeNull();
    expect(container.textContent).toContain("地图呈现方式");
    click(container.querySelector<HTMLButtonElement>('button[aria-label="切换为地图图钉"]')!);
    leaveFocusedWorkspace(container);
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
    leaveFocusedWorkspace(container);
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
    leaveFocusedWorkspace(container);
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
    leaveFocusedWorkspace(container);
    expect(container.querySelector('[data-destination-card]')?.textContent).toContain("兼容林舟");
    vi.unstubAllGlobals();
  });

  it("applies an edited city to the map destination card", () => {
    const container = renderApp();
    openPeopleData(container);
    click(container.querySelector<HTMLButtonElement>('button[aria-label="编辑 林舟"]')!);
    changeInput(container.querySelector<HTMLInputElement>('input[aria-label="编辑城市"]')!, "杭州市");
    click(container.querySelector<HTMLButtonElement>('button[aria-label="保存 林舟"]')!);
    leaveFocusedWorkspace(container);

    const cards = Array.from(container.querySelectorAll('[data-destination-card]'));
    const card = cards.find((candidate) => candidate.textContent?.includes("林舟"));
    expect(card).not.toBeUndefined();
    expect(card?.getAttribute("data-destination-card")).toBe("浙江省");
  });

  it("links a selected spreadsheet row to its live map marker", () => {
    const container = renderApp();
    openPeopleData(container);

    click(container.querySelector('[data-student-row="student-1"]')!);
    leaveFocusedWorkspace(container);

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
    leaveFocusedWorkspace(container);
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
    leaveFocusedWorkspace(container);
    expect(container.querySelector('[data-destination-card]')?.textContent).toContain("新同学");
  });
});
