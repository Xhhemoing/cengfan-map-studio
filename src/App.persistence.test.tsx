// Split from src/App.test.tsx: browser persistence boundaries (draft/mirror
// authority, explicit save, pagehide, no background timers).
// Helpers: src/test-utils/app-harness.tsx.
import { describe, expect, it, vi } from "vitest";
import { createProjectDocument, serializeProjectDocument } from "./lib/project-document";
import { sampleStudents } from "./lib/project-data";
import { createProjectPackage } from "./lib/project-package";
import {
  changeInput,
  click,
  installAppTestHarness,
  leaveFocusedWorkspace,
  openPeopleData,
  renderApp,
  saveWorkspaceMirror,
} from "./test-utils/app-harness";

installAppTestHarness();

describe("App browser persistence boundaries", () => {
  it("does not write a large project snapshot at the edit commit boundary", () => {
    const container = renderApp();
    window.localStorage.removeItem("cengfan-map-studio:draft");
    openPeopleData(container);
    click(container.querySelector<HTMLButtonElement>('button[aria-label="编辑 林舟"]')!);
    expect(container.querySelector('[data-student-row="student-1"]')?.getAttribute("data-editing")).toBe("true");
    changeInput(container.querySelector<HTMLInputElement>('input[aria-label="编辑学生名称"]')!, "内存林舟");
    click(container.querySelector<HTMLButtonElement>('button[aria-label="保存 林舟"]')!);

    expect(window.localStorage.getItem("cengfan-map-studio:draft")).toBeNull();
    leaveFocusedWorkspace(container);
    expect(container.textContent).toContain("有未保存修改");
  });

  it("does not register background persistence timers", () => {
    const intervals = vi.spyOn(window, "setInterval");
    const container = renderApp();

    expect(container.textContent).toContain("仅点击强制保存时覆盖本地数据");
    expect(intervals).not.toHaveBeenCalled();
  });

  it("keeps a browser draft authoritative when a server workspace also exists", async () => {
    const localProject = createProjectDocument({
      students: [{ ...sampleStudents[0], name: "浏览器草稿" }],
      templateId: "original",
      dataView: "province",
    });
    saveWorkspaceMirror(localProject);
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

  it("does not overwrite browser storage when the page is hidden", () => {
    const container = renderApp();
    openPeopleData(container);
    click(container.querySelector<HTMLButtonElement>('button[aria-label="编辑 林舟"]')!);
    changeInput(container.querySelector<HTMLInputElement>('input[aria-label="编辑学生名称"]')!, "刷新前林舟");
    click(container.querySelector<HTMLButtonElement>('button[aria-label="保存 林舟"]')!);

    window.dispatchEvent(new Event("pagehide"));

    expect(window.localStorage.getItem("cengfan-map-studio:draft")).toBeNull();
  });
});
