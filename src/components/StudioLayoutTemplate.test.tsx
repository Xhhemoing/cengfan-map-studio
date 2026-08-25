// 新五阶段壳的操作回执槽位：`statusMessage` 必须落在一条可见的 live region 里。
// legacy 壳早就有这条（LegacyEditorInspector 的 panel-note），新壳此前把它吞掉了。
import { createRoot, type Root } from "react-dom/client";
import { flushSync } from "react-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { StudioLayoutTemplate, type StudioLayoutTemplateProps } from "./StudioLayoutTemplate";

const roots: Array<{ root: Root; container: HTMLDivElement }> = [];

afterEach(() => {
  roots.splice(0).forEach(({ root, container }) => {
    flushSync(() => root.unmount());
    container.remove();
  });
});

function renderTemplate(patch: Partial<StudioLayoutTemplateProps> = {}): HTMLDivElement {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  roots.push({ root, container });
  flushSync(() => root.render(
    <StudioLayoutTemplate
      theme="light"
      skin="atelier"
      stage="data"
      assistantEntry={null}
      projectActions={null}
      workflowNav={null}
      leftRail={<p>左栏</p>}
      rightRail={<p>右栏</p>}
      rightRailLabel="数据质量"
      drawerOpen={false}
      onDrawerClose={() => {}}
      {...patch}
    >
      <p>画布</p>
    </StudioLayoutTemplate>,
  ));
  return container;
}

describe("StudioLayoutTemplate status slot", () => {
  it("announces an operation result through a visible live region", () => {
    const container = renderTemplate({ statusMessage: "强制保存完成：全部数据已覆盖到浏览器本地" });
    const status = container.querySelector<HTMLElement>(".studio-status-bar");

    expect(status?.getAttribute("role")).toBe("status");
    expect(status?.getAttribute("aria-live")).toBe("polite");
    expect(status?.textContent).toContain("强制保存完成");
  });

  it("keeps the live region mounted and empty so a later message is announced", () => {
    const container = renderTemplate();
    const status = container.querySelector<HTMLElement>(".studio-status-bar");

    expect(status).not.toBeNull();
    expect(status?.textContent).toBe("");
  });

  it("lets the user dismiss a result instead of leaving it on screen forever", () => {
    const onDismissStatusMessage = vi.fn();
    const container = renderTemplate({ statusMessage: "已复制环境信息", onDismissStatusMessage });

    flushSync(() => container.querySelector<HTMLButtonElement>('button[aria-label="关闭操作结果提示"]')!.click());
    expect(onDismissStatusMessage).toHaveBeenCalledTimes(1);
  });
});
