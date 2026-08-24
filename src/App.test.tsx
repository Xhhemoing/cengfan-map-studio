// Core App suite: delivery-issue target resolution plus editor shell modes
// (public/legacy flag) and browser session restore. The remaining App
// integration tests live in the focused src/App.*.test.tsx files and share
// src/test-utils/app-harness.tsx.
import { describe, expect, it } from "vitest";
import { resolveDeliveryIssueLocation } from "./lib/delivery-target";
import { LEGACY_EDITOR_STORAGE_KEY, WORKSPACE_SESSION_STORAGE_KEY } from "./lib/workspace-session";
import {
  click,
  installAppTestHarness,
  renderApp,
  renderLegacyApp,
  renderPublicApp,
} from "./test-utils/app-harness";

installAppTestHarness();

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

describe("App shell modes and session restore", () => {
  it.each([
    ["absent", undefined],
    ["zero", "0"],
    ["true", "true"],
  ] as const)("keeps the public five-stage editor isolated when legacy flag is %s", (_label, flag) => {
    window.localStorage.clear();
    if (flag !== undefined) window.localStorage.setItem(LEGACY_EDITOR_STORAGE_KEY, flag);
    const container = renderPublicApp({ clearStorage: false });

    expect(container.querySelector('main[aria-label="数据与素材工作台"]')).not.toBeNull();
    expect(container.querySelector(".workspace")).toBeNull();
    expect(container.querySelector(".workflow-guide")).toBeNull();
    expect(container.querySelector('button[aria-label="打开AI助手与高级功能"]')).not.toBeNull();
    expect(container.querySelector('.workflow-stage-stepper')).not.toBeNull();
    expect(container.querySelector(".workflow-stepper")).toBeNull();
  });

  it("opens the data workspace by default without the legacy compatibility flag", () => {
    const container = renderPublicApp();

    expect(container.querySelector('main[aria-label="数据与素材工作台"]')).not.toBeNull();
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

  it("restores the latest workspace stage from a valid browser session", () => {
    window.localStorage.setItem(WORKSPACE_SESSION_STORAGE_KEY, JSON.stringify({
      stage: "content",
      selectedProvince: "北京市",
      selectedObject: "cards",
      savedAt: "2026-08-05T10:00:00.000Z",
    }));

    const container = renderApp(false);

    expect(container.querySelector('.workflow-stage-stepper button[aria-current="step"]')?.getAttribute("aria-label")).toBe("内容与排版");
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
});
