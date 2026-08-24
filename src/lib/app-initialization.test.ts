import { afterEach, describe, expect, it, vi } from "vitest";
import { DRAFT_KEY } from "./app-constants";
import { loadBrowserState, loadBrowserValue, loadInitialProject } from "./app-initialization";
import { createProjectDocument, serializeProjectDocument } from "./project-document";

afterEach(() => {
  // 先还原被顶掉的 window,再清存储:顺序反过来,SSR 用例之后的每个用例都会连锁失败。
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

describe("loadInitialProject", () => {
  it("restores the force-save draft key before falling back to the sample project", () => {
    const project = createProjectDocument({ students: [], templateId: "original", dataView: "province" });
    project.textElements = project.textElements.map((element) => (
      element.id === "text-title" ? { ...element, color: "#ffffff" } : element
    ));
    window.localStorage.setItem(DRAFT_KEY, serializeProjectDocument(project));

    expect(loadInitialProject().textElements.find((element) => element.id === "text-title")?.color).toBe("#ffffff");
  });

  it("still accepts the legacy editor draft key", () => {
    const project = createProjectDocument({ students: [], templateId: "original", dataView: "province" });
    project.textElements = project.textElements.map((element) => (
      element.id === "text-title" ? { ...element, content: "旧草稿标题" } : element
    ));
    window.localStorage.setItem("editor:draft:v1", serializeProjectDocument(project));

    expect(loadInitialProject().textElements.find((element) => element.id === "text-title")?.content).toBe("旧草稿标题");
  });
});

describe("loadBrowserState", () => {
  // jsdom 里 window 永远在,SSR 那条分支只能靠把全局 window 顶掉才走得到。
  // `typeof undefined_binding` 就是 "undefined",所以 stubGlobal 顶成 undefined 足够。
  it("returns the fallback without calling the loader when there is no window", () => {
    vi.stubGlobal("window", undefined);
    let called = false;

    const value = loadBrowserState(() => {
      called = true;
      return "浏览器读到的值";
    }, "服务端兜底值");

    expect(value).toBe("服务端兜底值");
    expect(called).toBe(false);
  });

  it("still reads through to the loader in the browser", () => {
    expect(loadBrowserState(() => "浏览器读到的值", "服务端兜底值")).toBe("浏览器读到的值");
  });

  it("falls back to the same value when the browser read throws", () => {
    expect(loadBrowserState(() => {
      throw new Error("localStorage 不可读");
    }, "服务端兜底值")).toBe("服务端兜底值");
  });
});

describe("loadBrowserValue", () => {
  it("keeps the fallback when the read throws", () => {
    expect(loadBrowserValue<string | null>(() => {
      throw new Error("localStorage 不可读");
    }, null)).toBeNull();
  });
});
