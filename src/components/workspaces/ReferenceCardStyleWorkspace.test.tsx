import { flushSync } from "react-dom";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createProjectDocument } from "../../lib/project-document";
import { sampleStudents } from "../../lib/project-data";
import type { CardSettings } from "../../lib/scene-document";
import { ReferenceCardStyleRail, ReferenceCardStyleWorkspace } from "./ReferenceCardStyleWorkspace";

const roots: Array<{ root: ReturnType<typeof createRoot>; container: HTMLDivElement }> = [];

afterEach(() => {
  roots.splice(0).forEach(({ root, container }) => {
    flushSync(() => root.unmount());
    container.remove();
  });
});

function click(element: Element | null): void {
  if (!element) throw new Error("element missing");
  flushSync(() => element.dispatchEvent(new MouseEvent("click", { bubbles: true })));
}

/** Shell harness: the center canvas workspace and the right rail side by side. */
function renderStage(cardsOverride: Partial<CardSettings> = {}) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  roots.push({ root, container });
  const project = createProjectDocument({ students: sampleStudents, templateId: "original", dataView: "province" });
  const onPatch = vi.fn();
  const onSelect = vi.fn();
  const onApplyTemplate = vi.fn();
  const onApplyCustomTemplate = vi.fn();
  const onSaveTemplate = vi.fn();
  flushSync(() => root.render(
    <>
      <ReferenceCardStyleWorkspace
        project={project}
        selection={{ type: "canvas" }}
        onSelect={onSelect}
        onMoveCard={vi.fn()}
        onMoveGuests={vi.fn()}
        onCardPositionsResolved={vi.fn()}
      />
      <ReferenceCardStyleRail
        cards={{ ...project.cards, ...cardsOverride }}
        templates={[{ id: "original", name: "原始地图" }, { id: "cartoon", name: "卡通画风" }]}
        currentTemplateId="original"
        customTemplates={[{ id: "custom-1", name: "我的模板", scope: "visual" }]}
        onApplyTemplate={onApplyTemplate}
        onApplyCustomTemplate={onApplyCustomTemplate}
        onSaveTemplate={onSaveTemplate}
        onPatch={onPatch}
        onResetCards={vi.fn()}
      />
    </>,
  ));
  return { container, onPatch, onSelect, onApplyTemplate, onApplyCustomTemplate, onSaveTemplate };
}

describe("ReferenceCardStyleWorkspace", () => {
  it("renders the live poster canvas in the center under the short stage title", () => {
    const { container } = renderStage();

    const main = container.querySelector('main[aria-label="版式"]');
    expect(main).not.toBeNull();
    expect(main?.querySelector("svg.poster")).not.toBeNull();
    expect(main?.querySelector('[aria-label="版式画布"]')).not.toBeNull();
    // 样式格移到右栏，中栏只保留实时画布。
    expect(main?.querySelectorAll(".reference-card-style-option")).toHaveLength(0);
  });

  it("offers the four renderable reference styles in the rail and applies one canonical template", () => {
    const { container, onPatch } = renderStage();

    const rail = container.querySelector('aside[aria-label="版式与展示框样式"]');
    expect(rail).not.toBeNull();
    expect(rail?.querySelectorAll(".reference-card-style-option")).toHaveLength(4);
    const emblemButton = [...rail!.querySelectorAll("button")].find((button) => button.textContent?.includes("校徽开放名单"));
    expect(emblemButton).toBeDefined();
    click(emblemButton!);
    expect(onPatch).toHaveBeenCalledWith(expect.objectContaining({
      templateId: "emblem-list",
      presentation: "emblem-list",
      grouping: "province",
      displayFrame: undefined,
    }));
  });

  it("marks exactly one option as selected once its presentation is applied", () => {
    const { container } = renderStage({ templateId: "city-label", presentation: "city-label" });

    const rail = container.querySelector('aside[aria-label="版式与展示框样式"]')!;
    const selected = rail.querySelectorAll('[data-reference-card-style-selected="true"]');
    expect(selected).toHaveLength(1);
    expect(selected[0]?.getAttribute("data-reference-card-style")).toBe("city-label");
    expect(selected[0]?.className).toContain("is-selected");
    expect(selected[0]?.getAttribute("aria-pressed")).toBe("true");
  });

  it("hosts the whole-poster template picker above the style grid with save support", () => {
    const { container, onApplyTemplate, onApplyCustomTemplate, onSaveTemplate } = renderStage();

    const rail = container.querySelector('aside[aria-label="版式与展示框样式"]')!;
    const picker = rail.querySelector(".template-picker");
    expect(picker).not.toBeNull();
    // TemplatePicker 在样式格与 CardsInspector 之前（右栏顶部）。
    expect(picker!.compareDocumentPosition(rail.querySelector(".reference-card-style-option")!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(rail.querySelector(".property-panel")).not.toBeNull();

    click([...picker!.querySelectorAll(".workflow-template-grid button")].find((button) => button.textContent?.trim() === "卡通画风")!);
    expect(onApplyTemplate).toHaveBeenCalledWith("cartoon");

    click([...picker!.querySelectorAll('[aria-label="我的模板"] button')][0]!);
    expect(onApplyCustomTemplate).toHaveBeenCalledWith({ id: "custom-1", name: "我的模板", scope: "visual" });

    click([...picker!.querySelectorAll("button")].find((button) => button.textContent?.includes("保存当前整体模板"))!);
    expect(onSaveTemplate).toHaveBeenCalledTimes(1);
  });

  it("forwards canvas selection to the shared scene handler", () => {
    const { container, onSelect } = renderStage();

    click(container.querySelector("svg.poster"));
    expect(onSelect).toHaveBeenCalled();
  });
});
