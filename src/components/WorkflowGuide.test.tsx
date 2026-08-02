import { afterEach, describe, expect, it, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { flushSync } from "react-dom";
import { createProjectDocument } from "../lib/project-document";
import type { Student } from "../lib/project-data";
import { computeWorkflowProgress } from "../lib/workflow-progress";
import { WorkflowGuide } from "./WorkflowGuide";

const roots: Array<{ root: Root; container: HTMLDivElement }> = [];

function student(overrides: Partial<Student> = {}): Student {
  return {
    id: "s-1",
    name: "测试同学",
    university: "北京大学",
    city: "北京市",
    visibility: true,
    ...overrides,
  };
}

function renderGuide(props: Partial<Parameters<typeof WorkflowGuide>[0]> = {}) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  const onSelectStep = vi.fn();
  const onChangeDataView = vi.fn();
  const onOpenGlobalSettings = vi.fn();
  const onArrangeCards = vi.fn();
  const onApplyTemplate = vi.fn();
  const onApplyCustomTemplate = vi.fn();
  const onSaveTemplate = vi.fn();
  const onExportPng = vi.fn();
  const onExportSvg = vi.fn();
  const onExportProject = vi.fn();
  const onSaveLocal = vi.fn();
  const onOpenAssets = vi.fn();
  const onFocusStudent = vi.fn();
  flushSync(() => {
    root.render(
      <WorkflowGuide
        progress={computeWorkflowProgress(createProjectDocument({ students: [student()], templateId: "original", dataView: "province" }))}
        activeStep="roster"
        dataView="province"
        dataViewLabel="省份卡片"
        selectionDescription="未选择"
        templates={[
          { id: "original", name: "原始地图" },
          { id: "cartoon", name: "卡通画风" },
        ]}
        currentTemplateId="original"
        customTemplates={[{ id: "ct-1", name: "我的版式", scope: "visual" }]}
        exportWarnings={{ unresolvedStudents: [], hiddenStudents: [] }}
        onSelectStep={onSelectStep}
        onChangeDataView={onChangeDataView}
        onOpenGlobalSettings={onOpenGlobalSettings}
        onArrangeCards={onArrangeCards}
        onApplyTemplate={onApplyTemplate}
        onApplyCustomTemplate={onApplyCustomTemplate}
        onSaveTemplate={onSaveTemplate}
        onExportPng={onExportPng}
        onExportSvg={onExportSvg}
        onExportProject={onExportProject}
        onSaveLocal={onSaveLocal}
        onOpenAssets={onOpenAssets}
        onFocusStudent={onFocusStudent}
        {...props}
      />,
    );
  });
  roots.push({ root, container });
  return { container, onSelectStep, onChangeDataView, onOpenGlobalSettings, onArrangeCards, onApplyTemplate, onApplyCustomTemplate, onSaveTemplate, onExportPng, onExportSvg, onExportProject, onSaveLocal, onOpenAssets, onFocusStudent };
}

function click(element: Element): void {
  flushSync(() => element.dispatchEvent(new MouseEvent("click", { bubbles: true })));
}

function clickBar(container: HTMLElement): void {
  click(container.querySelector(".workflow-guide__bar")!);
}

afterEach(() => {
  roots.splice(0).forEach(({ root, container }) => {
    flushSync(() => root.unmount());
    container.remove();
  });
});

describe("WorkflowGuide", () => {
  it("shows a compact status bar with the active step and status dots", () => {
    const { container } = renderGuide();

    const bar = container.querySelector(".workflow-guide__bar");
    expect(bar?.textContent).toContain("准备名单");
    expect(bar?.textContent).toContain("1/5");
    expect(container.querySelectorAll(".workflow-guide__dot")).toHaveLength(5);
    expect(container.querySelector(".workflow-guide__dot")?.getAttribute("data-status")).toBe("ready");
  });

  it("keeps the detailed panel collapsed until the status bar is opened", () => {
    const { container } = renderGuide();

    expect(container.querySelector(".workflow-nav")).toBeNull();
    clickBar(container);
    expect(container.querySelector(".workflow-nav")).not.toBeNull();
    clickBar(container);
    expect(container.querySelector(".workflow-nav")).toBeNull();
  });

  it("renders all five workflow steps with the active step marked", () => {
    const { container } = renderGuide();
    clickBar(container);

    const buttons = Array.from(container.querySelectorAll(".workflow-nav button"));
    const texts = buttons.map((button) => button.textContent ?? "");
    for (const title of ["准备名单", "地图呈现", "全局布局", "局部调整", "检查导出"]) {
      expect(texts.some((text) => text.includes(title))).toBe(true);
    }
    const active = buttons.find((button) => button.getAttribute("aria-current") === "step");
    expect(active?.textContent).toContain("准备名单");
  });

  it("clicking a step reports its id", () => {
    const { container, onSelectStep } = renderGuide();
    clickBar(container);

    const button = Array.from(container.querySelectorAll(".workflow-nav button"))
      .find((item) => item.textContent?.includes("检查导出"))!;
    click(button);

    expect(onSelectStep).toHaveBeenCalledWith("export");
  });

  it("shows warning badge and unmatched count for a roster with unresolved cities", () => {
    const progress = computeWorkflowProgress(
      createProjectDocument({ students: [student({ city: "不存在的城市", province: undefined })], templateId: "original", dataView: "province" }),
    );
    const { container } = renderGuide({ progress });
    clickBar(container);

    const roster = Array.from(container.querySelectorAll(".workflow-nav button"))
      .find((item) => item.textContent?.includes("准备名单"))!;
    expect(roster.querySelector(".workflow-nav__badge")?.getAttribute("data-status")).toBe("warning");
    expect(roster.textContent).toContain("1 个城市未匹配");
  });

  it("expands the presentation step with a data view selector that reports changes", () => {
    const { container, onChangeDataView } = renderGuide({ activeStep: "presentation" });
    clickBar(container);

    expect(container.querySelector('[role="group"][aria-label="地图呈现方式"]')).not.toBeNull();
    const heat = Array.from(container.querySelectorAll("button"))
      .find((item) => item.textContent?.trim() === "人数热力")!;
    click(heat);

    expect(onChangeDataView).toHaveBeenCalledWith("heat");
  });

  it("expands the layout step with section shortcuts and one-click arrangement", () => {
    const { container, onOpenGlobalSettings, onArrangeCards } = renderGuide({ activeStep: "layout" });
    clickBar(container);

    click(Array.from(container.querySelectorAll(".workflow-step-panel button"))
      .find((item) => item.textContent?.trim() === "画布")!);
    expect(onOpenGlobalSettings).toHaveBeenCalledWith("canvas");

    click(Array.from(container.querySelectorAll(".workflow-step-panel button"))
      .find((item) => item.textContent?.includes("一键智能排版"))!);
    expect(onArrangeCards).toHaveBeenCalledTimes(1);
  });

  it("expands the layout step with template selection and save", () => {
    const { container, onApplyTemplate, onApplyCustomTemplate, onSaveTemplate } = renderGuide({ activeStep: "layout" });
    clickBar(container);

    const templateButtons = Array.from(container.querySelectorAll(".workflow-template-grid button"));
    expect(templateButtons.map((button) => button.textContent?.trim())).toEqual(["原始地图", "卡通画风"]);
    expect(templateButtons[0]?.className).toContain("selected");

    click(templateButtons[1]!);
    expect(onApplyTemplate).toHaveBeenCalledWith("cartoon");

    const customButton = Array.from(container.querySelectorAll(".workflow-custom-templates button"))
      .find((item) => item.textContent?.includes("我的版式"))!;
    click(customButton);
    expect(onApplyCustomTemplate).toHaveBeenCalledWith({ id: "ct-1", name: "我的版式", scope: "visual" });

    click(Array.from(container.querySelectorAll(".workflow-step-panel button"))
      .find((item) => item.textContent?.includes("保存当前整体模板"))!);
    expect(onSaveTemplate).toHaveBeenCalledTimes(1);
  });

  it("expands the local step with the asset library entry", () => {
    const { container, onOpenAssets } = renderGuide({ activeStep: "local" });
    clickBar(container);

    click(Array.from(container.querySelectorAll(".workflow-step-panel button"))
      .find((item) => item.textContent?.includes("打开素材库"))!);

    expect(onOpenAssets).toHaveBeenCalled();
  });

  it("shows a roster summary with international and unresolved counts", () => {
    const progress = computeWorkflowProgress(
      createProjectDocument({
        students: [
          student(),
          student({ id: "s-2", name: "海外同学", city: "纽约", locationScope: "international" }),
          student({ id: "s-3", name: "未匹配同学", city: "不存在的城市", province: undefined }),
        ],
        templateId: "original",
        dataView: "province",
      }),
    );
    const { container } = renderGuide({ activeStep: "roster", progress });
    clickBar(container);

    const panel = container.querySelector('[aria-label="准备名单"]');
    expect(panel?.textContent).toContain("3 条记录");
    expect(panel?.textContent).toContain("1 个海外");
    expect(panel?.textContent).toContain("1 个未匹配");
  });

  it("lists unresolved and hidden students in the export step with focus actions", () => {
    const { container, onFocusStudent } = renderGuide({
      activeStep: "export",
      exportWarnings: {
        unresolvedStudents: [{ id: "s-2", name: "未匹配同学", city: "不存在的城市" }],
        hiddenStudents: [{ id: "s-4", name: "隐藏同学" }],
      },
    });
    clickBar(container);

    const unresolved = container.querySelector('[aria-label="未匹配城市"]');
    expect(unresolved?.textContent).toContain("未匹配同学 · 不存在的城市");
    const hidden = container.querySelector('[aria-label="隐藏名单"]');
    expect(hidden?.textContent).toContain("隐藏同学");

    click(unresolved!.querySelector("button")!);
    expect(onFocusStudent).toHaveBeenCalledWith("s-2");
  });

  it("expands the export step with png/svg/project/save actions", () => {
    const { container, onExportPng, onExportSvg, onExportProject, onSaveLocal } = renderGuide({ activeStep: "export" });
    clickBar(container);

    click(Array.from(container.querySelectorAll("button")).find((item) => item.textContent?.includes("导出 PNG"))!);
    click(Array.from(container.querySelectorAll("button")).find((item) => item.textContent?.includes("导出 SVG"))!);
    click(Array.from(container.querySelectorAll("button")).find((item) => item.textContent?.includes("导出工程"))!);
    click(Array.from(container.querySelectorAll("button")).find((item) => item.textContent?.includes("保存到本机"))!);

    expect(onExportPng).toHaveBeenCalledTimes(1);
    expect(onExportSvg).toHaveBeenCalledTimes(1);
    expect(onExportProject).toHaveBeenCalledTimes(1);
    expect(onSaveLocal).toHaveBeenCalledTimes(1);
  });

  it("opens with the panel expanded in fullscreen variant", () => {
    const { container } = renderGuide({ variant: "fullscreen" });

    expect(container.querySelector(".workflow-nav")).not.toBeNull();
  });

  it("shows linked global settings sections under the layout step in fullscreen with the active one highlighted", () => {
    const { container, onOpenGlobalSettings } = renderGuide({
      variant: "fullscreen",
      activeStep: "layout",
      globalSections: [
        { id: "canvas", label: "画布设置" },
        { id: "map", label: "地图展示框" },
        { id: "cards", label: "数据板块" },
        { id: "guests", label: "辅助板块" },
        { id: "typography", label: "字体排版" },
      ],
      activeSection: "map",
    });

    const links = Array.from(container.querySelectorAll(".workflow-guide__section-link"));
    expect(links.map((link) => link.textContent?.trim())).toEqual([
      "画布设置",
      "地图展示框",
      "数据板块",
      "辅助板块",
      "字体排版",
    ]);
    const mapLink = links.find((link) => link.textContent?.includes("地图展示框"))!;
    expect(mapLink.className).toContain("is-active");

    click(mapLink);
    expect(onOpenGlobalSettings).toHaveBeenCalledWith("map");
  });

  it("keeps the layout section links out of the topbar variant", () => {
    const { container } = renderGuide({
      activeStep: "layout",
      globalSections: [
        { id: "canvas", label: "画布设置" },
        { id: "map", label: "地图展示框" },
        { id: "cards", label: "数据板块" },
        { id: "guests", label: "辅助板块" },
        { id: "typography", label: "字体排版" },
      ],
      activeSection: "canvas",
    });
    clickBar(container);

    expect(container.querySelector(".workflow-guide__section-link")).toBeNull();
  });
});
