import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { describe, expect, it, vi } from "vitest";
import { ActionButton, PanelHeader, PanelSection, SegmentedControl, ToolbarGroup } from "./StudioUi";

describe("StudioUi primitives", () => {
  it("renders reusable editor chrome with stable classes and accessible labels", () => {
    const onClick = vi.fn();
    const container = document.createElement("div");
    const root = createRoot(container);

    flushSync(() => root.render(
      <>
        <ToolbarGroup label="工程保存"><button type="button">保存</button></ToolbarGroup>
        <PanelHeader id="section-title" title="素材库" meta="2 自定义" />
        <PanelSection title="省份外观" meta="北京" data-test-section="province">
          <ActionButton onClick={onClick}>应用</ActionButton>
        </PanelSection>
        <SegmentedControl
          label="设计工具"
          activeId="cards"
          items={[{ id: "templates", label: "模板" }, { id: "cards", label: "卡片" }]}
          onChange={onClick}
        />
      </>,
    ));

    expect(container.querySelector(".topbar-action-group")?.getAttribute("aria-label")).toBe("工程保存");
    expect(container.querySelector("#section-title")?.textContent).toBe("素材库");
    expect(container.querySelector(".panel-heading small")?.textContent).toBe("2 自定义");
    expect(container.querySelector("[data-test-section='province']")?.getAttribute("aria-label")).toBe("省份外观");
    expect(Array.from(container.querySelectorAll(".segmented-control button")).map((button) => button.textContent)).toEqual(["模板", "卡片"]);
    expect(container.querySelector('.segmented-control button[aria-pressed="true"]')?.textContent).toBe("卡片");
    const action = container.querySelector<HTMLButtonElement>(".wide-button")!;
    flushSync(() => action.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(onClick).toHaveBeenCalledOnce();

    flushSync(() => root.unmount());
  });
});
