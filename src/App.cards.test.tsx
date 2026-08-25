// Split from src/App.test.tsx: display-frame/block style controls (canonical
// scene state, connectors, grouping, frozen positions, reference styles).
// Helpers: src/test-utils/app-harness.tsx.
import { flushSync } from "react-dom";
import { describe, expect, it, vi } from "vitest";
import { createProjectDocument, serializeProjectDocument } from "./lib/project-document";
import { sampleStudents } from "./lib/project-data";
import { WORKSPACE_SESSION_STORAGE_KEY } from "./lib/workspace-session";
import {
  changeInput,
  changeSelect,
  click,
  closeGlobalSettings,
  installAppTestHarness,
  openGlobalSettingsSection,
  renderApp,
  renderPublicApp,
  saveWorkspaceMirror,
  workflowStage,
} from "./test-utils/app-harness";

installAppTestHarness();

describe("App display frame and block styles", () => {
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
    saveWorkspaceMirror(project);
    const container = renderApp(false);
    openGlobalSettingsSection(container, "cards");

    expect(container.querySelector<HTMLSelectElement>("#cards-template")?.value).toBe("standard");
    expect(container.querySelector<HTMLInputElement>("#cards-compact-layout")?.checked).toBe(true);
    expect(container.querySelector<HTMLInputElement>("#cards-background")?.value).toBe(project.cards.background);
  });

  it("applies connector formatting from the block style panel to the live poster", () => {
    const container = renderApp();
    openGlobalSettingsSection(container, "cards");

    changeSelect(container.querySelector<HTMLSelectElement>("#cards-connector-style")!, "straight");
    changeSelect(container.querySelector<HTMLSelectElement>("#cards-connector-dash")!, "solid");
    closeGlobalSettings(container);
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

    closeGlobalSettings(container);
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
    saveWorkspaceMirror(project);
    const container = renderApp(false);
    openGlobalSettingsSection(container, "cards");

    changeSelect(container.querySelector<HTMLSelectElement>("#cards-grouping")!, "city");
    closeGlobalSettings(container);

    expect(container.querySelectorAll("[data-destination-card]")).toHaveLength(2);
  });

  it("keeps display-frame card positions stable after a map update until explicitly refreshed", () => {
    const project = createProjectDocument({ students: sampleStudents, templateId: "original", dataView: "province" });
    project.cards = { ...project.cards, positions: { 北京市: { x: 1110, y: 700 } } };
    window.localStorage.setItem("cengfan-map-studio:draft", serializeProjectDocument(project));
    window.localStorage.setItem(WORKSPACE_SESSION_STORAGE_KEY, JSON.stringify({ stage: "map", savedAt: "2026-08-04T00:00:00.000Z" }));
    const container = renderPublicApp({ clearStorage: false });
    const initialTransform = container.querySelector('[data-destination-card="北京市"]')?.getAttribute("transform");

    changeInput(container.querySelector<HTMLInputElement>("#map-x")!, "900");
    container.querySelector<HTMLInputElement>("#map-x")?.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));

    expect(container.querySelector('[data-destination-card="北京市"]')?.getAttribute("transform")).toBe(initialTransform);
    click(workflowStage(container, "展示框样式"));
    expect(container.querySelector('button[aria-label="刷新展示框位置"]')).not.toBeNull();
    expect(container.querySelector('button[aria-label="一键智能排版"]')).toBeNull();
  });

  it("freezes automatic display-frame positions during a map edit and keeps them when refresh is cancelled", () => {
    const project = createProjectDocument({ students: sampleStudents, templateId: "original", dataView: "province" });
    window.localStorage.setItem("cengfan-map-studio:draft", serializeProjectDocument(project));
    window.localStorage.setItem(WORKSPACE_SESSION_STORAGE_KEY, JSON.stringify({ stage: "map", savedAt: "2026-08-04T00:00:00.000Z" }));
    const container = renderPublicApp({ clearStorage: false });
    const initialTransform = container.querySelector('[data-destination-card="北京市"]')?.getAttribute("transform");

    changeInput(container.querySelector<HTMLInputElement>("#map-x")!, "900");
    container.querySelector<HTMLInputElement>("#map-x")?.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
    expect(container.querySelector('[data-destination-card="北京市"]')?.getAttribute("transform")).toBe(initialTransform);

    click(workflowStage(container, "展示框样式"));
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    click(container.querySelector<HTMLButtonElement>('button[aria-label="刷新展示框位置"]')!);

    expect(confirm).toHaveBeenCalledTimes(1);
    click(workflowStage(container, "内容与排版"));
    expect(container.querySelector('[data-destination-card="北京市"]')?.getAttribute("transform")).toBe(initialTransform);
  });

  it("applies a reference card style through the real poster renderer", () => {
    const container = renderApp();
    click(workflowStage(container, "展示框样式"));
    const option = Array.from(container.querySelectorAll<HTMLButtonElement>(".reference-card-style-option"))
      .find((button) => button.textContent?.includes("校徽开放名单"));

    expect(option).not.toBeUndefined();
    click(option!);
    click(workflowStage(container, "内容与排版"));
    expect(container.querySelector('[data-card-presentation="emblem-list"]')).not.toBeNull();
    expect(container.textContent).toContain("林舟");
  });
});
