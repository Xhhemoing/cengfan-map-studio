import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { describe, expect, it, vi } from "vitest";
import { Palette, Users } from "lucide-react";
import { ActionButton, CompactButton, IconButton, PanelHeader, PanelSection, SegmentedNav, ToolbarGroup, WorkspaceNav } from "./StudioUi";

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
        <WorkspaceNav
          activeId="data"
          items={[
            { id: "data", label: "数据", icon: Users },
            { id: "design", label: "设计", icon: Palette },
          ]}
          onChange={onClick}
        />
        <SegmentedNav
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
    expect(Array.from(container.querySelectorAll(".workspace-nav button")).map((button) => button.textContent)).toEqual(["数据", "设计"]);
    expect(container.querySelector('.workspace-nav button[aria-current="page"]')?.textContent).toBe("数据");
    // Only the active workspace carries aria-current; buttons must not use aria-selected.
    expect(container.querySelectorAll('.workspace-nav button[aria-current="page"]')).toHaveLength(1);
    expect(container.querySelector(".workspace-nav button[aria-selected]")).toBeNull();
    expect(container.querySelector('.segmented-nav button[aria-pressed="true"]')?.textContent).toBe("卡片");
    const action = container.querySelector<HTMLButtonElement>(".wide-button")!;
    flushSync(() => action.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(onClick).toHaveBeenCalledOnce();

    flushSync(() => root.unmount());
  });

  it("keeps icon slots decorative even when a call site omits aria-hidden", () => {
    const container = document.createElement("div");
    const root = createRoot(container);

    flushSync(() => root.render(
      <>
        <IconButton label="重置画布" icon={<Palette size={15} />} onClick={vi.fn()} />
        <CompactButton icon={<Users size={14} />} onClick={vi.fn()}>添加老师</CompactButton>
      </>,
    ));

    // The button name comes from label/text; the raw icon element must be
    // hidden centrally so no icon button ever exposes an unnamed graphic.
    expect(container.querySelector(".icon-button svg")?.getAttribute("aria-hidden")).toBe("true");
    expect(container.querySelector(".compact-button svg")?.getAttribute("aria-hidden")).toBe("true");
    expect(container.querySelector(".icon-button")?.getAttribute("aria-label")).toBe("重置画布");
    expect(container.querySelector(".compact-button")?.textContent).toContain("添加老师");

    flushSync(() => root.unmount());
  });
});
