// locateLayoutIssue 的接线：把体检问题随附的 targets 传给 resolveLayoutIssueSelection，
// 使定位按 targets 顺序取对象，而不是仅拆拼接 id（分组键含 ":" 时会认错）。
import { createElement } from "react";
import { flushSync } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createProjectDocument } from "../lib/project-document";
import { useStudioNavigation, type StudioNavigation, type UseStudioNavigationOptions } from "./use-studio-navigation";

const roots: Array<{ root: Root; container: HTMLDivElement }> = [];

/** 渲染一个只调用 hook 的空组件，拿到 hook 返回值与传入的 mock 回调。 */
function renderNavigation() {
  let navigation: StudioNavigation | null = null;
  function Harness({ options }: { options: UseStudioNavigationOptions }) {
    navigation = useStudioNavigation(options);
    return null;
  }
  const options: UseStudioNavigationOptions = {
    // 默认「original」模板自带 text-note 与 text-title 两个文本元素。
    project: createProjectDocument({ students: [], templateId: "original", dataView: "province" }),
    sessionStage: "content",
    setSelection: vi.fn(),
    setSelectedStudentId: vi.fn(),
    onOpenCollaborationPanel: vi.fn(),
    onExportPng: vi.fn(),
  };
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  roots.push({ root, container });
  flushSync(() => root.render(createElement(Harness, { options })));
  return { navigation: navigation!, options };
}

afterEach(() => {
  roots.splice(0).forEach(({ root, container }) => {
    flushSync(() => root.unmount());
    container.remove();
  });
});

describe("useStudioNavigation locateLayoutIssue", () => {
  it("passes issue.targets through, so the targets order decides the selection", () => {
    const { navigation, options } = renderNavigation();
    // 拆 id 片段会先命中 text-note；targets 指明真正要定位的是 text-title。
    navigation.locateLayoutIssue({ id: "text-note:text-title", targets: ["text-title", "text-note"] });
    expect(options.setSelection).toHaveBeenCalledTimes(1);
    expect(options.setSelection).toHaveBeenCalledWith({ type: "text", id: "text-title" });
  });

  it("still resolves from id fragments when the issue carries no targets", () => {
    const { navigation, options } = renderNavigation();
    navigation.locateLayoutIssue({ id: "text-note:text-title" });
    expect(options.setSelection).toHaveBeenCalledWith({ type: "text", id: "text-note" });
  });

  it("keeps the current selection when neither targets nor id resolve", () => {
    const { navigation, options } = renderNavigation();
    navigation.locateLayoutIssue({ id: "connector-未知:未知", targets: ["未知"] });
    expect(options.setSelection).not.toHaveBeenCalled();
  });
});
