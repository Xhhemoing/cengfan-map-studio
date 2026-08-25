import { afterEach, describe, expect, it, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { flushSync } from "react-dom";
import { DataWorkspaceDraftForm } from "./data-workspace-draft-form";
import { createEmptyStudentDraft } from "../lib/data-workspace";

const roots: Array<{ root: Root; container: HTMLDivElement }> = [];

function renderForm() {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  roots.push({ root, container });
  const props = {
    draft: createEmptyStudentDraft(),
    onChangeDraft: vi.fn(),
    onAddStudent: vi.fn(),
    collapsible: true,
    expanded: true,
    onToggleExpanded: vi.fn(),
  };
  flushSync(() => root.render(<DataWorkspaceDraftForm {...props} />));
  return { container, props };
}

afterEach(() => {
  roots.splice(0).forEach(({ root, container }) => {
    flushSync(() => root.unmount());
    container.remove();
  });
  vi.restoreAllMocks();
});

describe("DataWorkspaceDraftForm", () => {
  it("hides every decorative lucide icon from assistive technology", () => {
    const { container } = renderForm();
    const icons = [...container.querySelectorAll("svg")];
    // 折叠开关 Plus + 「新增学生」提交按钮 Plus。
    expect(icons.length).toBe(2);
    for (const icon of icons) {
      expect(icon.getAttribute("aria-hidden"), `svg inside "${icon.closest("button")?.textContent?.trim()}"`).toBe("true");
    }
  });

  it("keeps the submit button's accessible name and callback intact", () => {
    const { container, props } = renderForm();
    const submit = [...container.querySelectorAll<HTMLButtonElement>("button.action-button")]
      .find((button) => button.textContent?.includes("新增学生"));
    expect(submit).not.toBeUndefined();
    expect(submit!.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");

    flushSync(() => submit!.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(props.onAddStudent).toHaveBeenCalledTimes(1);
  });
});
