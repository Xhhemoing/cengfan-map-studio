import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createRoot, type Root } from "react-dom/client";
import { flushSync } from "react-dom";
import { StudioMuiProvider } from "./StudioMuiProvider";
import { StudioLayoutTemplate, type StudioLayoutTemplateProps } from "./StudioLayoutTemplate";

const mounted: Array<{ root: Root; container: HTMLDivElement }> = [];

function renderTemplate(overrides: Partial<StudioLayoutTemplateProps> = {}) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  mounted.push({ root, container });
  const opener = document.createElement("button");
  document.body.append(opener);

  const render = (extra: Partial<StudioLayoutTemplateProps> = {}) => {
    const props: StudioLayoutTemplateProps = {
      theme: "light",
      skin: "atelier",
      stage: "content",
      assistantEntry: <button type="button">AI</button>,
      projectActions: <button type="button">导出</button>,
      workflowNav: <nav aria-label="制作步骤" />,
      leftRail: <div>左栏</div>,
      rightRail: <div>右栏</div>,
      rightRailLabel: "内容对象属性",
      drawerOpen: false,
      onDrawerClose: vi.fn(),
      children: <div>画布</div>,
      ...overrides,
      ...extra,
    };
    flushSync(() => root.render(<StudioMuiProvider><StudioLayoutTemplate {...props} /></StudioMuiProvider>));
  };

  render();
  return { container, opener, render };
}

afterEach(() => {
  mounted.splice(0).forEach(({ root, container }) => {
    flushSync(() => root.unmount());
    container.remove();
  });
  document.body.innerHTML = "";
});

describe("StudioLayoutTemplate", () => {
  it("renders the status slot inside the shell and omits it when unused", () => {
    const { container, render } = renderTemplate({
      status: <p className="probe-status" role="status">已刷新展示框位置</p>,
    });

    const shell = container.querySelector(".app-shell")!;
    expect(shell.querySelector(".probe-status")?.textContent).toBe("已刷新展示框位置");

    render({ status: undefined });
    expect(container.querySelector(".probe-status")).toBeNull();
    expect(container.querySelector(".app-shell")).not.toBeNull();
  });

  it("hands the drawer an element to restore focus to on close", async () => {
    const { opener, render } = renderTemplate({ drawerReturnFocusTo: null });

    render({ drawerOpen: true, drawerReturnFocusTo: opener });
    expect(document.querySelector(".studio-assistant-drawer")).not.toBeNull();

    render({ drawerOpen: false, drawerReturnFocusTo: opener });
    await act(async () => {});
    expect(document.activeElement).toBe(opener);
  });
});
