import { createRoot } from "react-dom/client";
import { flushSync } from "react-dom";
import { describe, expect, it, vi } from "vitest";
import { Check, Trash2 } from "lucide-react";
import { ActionGroup, CompactButton, IconButton, SegmentedControl, ToolbarButton } from "./StudioUi";

describe("StudioUi compact controls", () => {
  it("keeps icon actions labelled and exposes tooltip text", () => {
    const container = document.createElement("div");
    const root = createRoot(container);
    const onClick = vi.fn();

    flushSync(() => root.render(
      <ActionGroup label="学生操作">
        <IconButton label="删除学生" icon={<Trash2 size={14} />} onClick={onClick} variant="danger" />
        <ToolbarButton label="保存编辑" icon={<Check size={14} />} onClick={onClick} />
        <CompactButton onClick={onClick} variant="secondary">取消</CompactButton>
      </ActionGroup>,
    ));

    const icon = container.querySelector<HTMLButtonElement>("button[aria-label='删除学生']");
    expect(icon?.title).toBe("删除学生");
    expect(icon?.className).toContain("icon-button");
    expect(icon?.className).toContain("icon-button--danger");
    expect(container.querySelector(".action-group")?.getAttribute("aria-label")).toBe("学生操作");
    expect(container.querySelector(".compact-button--secondary")).not.toBeNull();

    flushSync(() => icon?.dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(onClick).toHaveBeenCalledOnce();
    flushSync(() => root.unmount());
  });

  it("renders a compact segmented control with one pressed option", () => {
    const container = document.createElement("div");
    const root = createRoot(container);
    const onChange = vi.fn();

    flushSync(() => root.render(
      <SegmentedControl
        label="地图呈现方式"
        activeId="province"
        items={[{ id: "pins", label: "图钉" }, { id: "province", label: "省份" }]}
        onChange={onChange}
      />,
    ));

    expect(container.querySelectorAll(".segmented-control button")).toHaveLength(2);
    expect(container.querySelectorAll(".segmented-control button[aria-pressed='true']")).toHaveLength(1);
    expect(container.querySelector(".segmented-control button[aria-pressed='true']")?.textContent).toBe("省份");
    flushSync(() => container.querySelectorAll("button")[0].dispatchEvent(new MouseEvent("click", { bubbles: true })));
    expect(onChange).toHaveBeenCalledWith("pins");
    flushSync(() => root.unmount());
  });
});
