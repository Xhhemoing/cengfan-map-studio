// 状态条的直接契约：两个 region 常驻、失败/成功分流、空态不留空白文本节点。
// App 分片 pin(src/App.shell-layout.test.tsx)从五阶段外壳那一侧盯同一份 DOM。
import { createRoot, type Root } from "react-dom/client";
import { flushSync } from "react-dom";
import { afterEach, describe, expect, it } from "vitest";
import { StatusStrip } from "./StatusStrip";

const roots: Array<{ root: Root; container: HTMLDivElement }> = [];

afterEach(() => {
  roots.splice(0).forEach(({ root, container }) => {
    flushSync(() => root.unmount());
    container.remove();
  });
});

function mount(message?: string): { container: HTMLDivElement; rerender: (next?: string) => void } {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  roots.push({ root, container });
  flushSync(() => root.render(<StatusStrip message={message} />));
  return { container, rerender: (next?: string) => flushSync(() => root.render(<StatusStrip message={next} />)) };
}

describe("StatusStrip", () => {
  it("mounts both regions before there is anything to say", () => {
    const { container } = mount();

    expect(container.querySelectorAll('[role="status"][aria-live="polite"]')).toHaveLength(1);
    expect(container.querySelectorAll('[role="alert"][aria-live="assertive"]')).toHaveLength(1);
  });

  it("keeps an empty region empty so the collapse rule can hide it", () => {
    const { container } = mount("");

    // 空白文本节点会让 .data-message:empty 的收起规则失效，露出空的绿/红框。
    for (const region of container.querySelectorAll(".data-message")) {
      expect(region.childNodes).toHaveLength(0);
      expect(region.matches(":empty")).toBe(true);
    }
  });

  it("routes success and progress messages to the polite region", () => {
    const { container } = mount("已从本地完整镜像恢复工作区");

    expect(container.querySelector('[role="status"]')?.textContent).toBe("已从本地完整镜像恢复工作区");
    expect(container.querySelector('[role="alert"]')?.textContent).toBe("");
  });

  it("routes blocking messages to the assertive region", () => {
    const { container } = mount("工程包导入失败");

    expect(container.querySelector('[role="alert"]')?.textContent).toBe("工程包导入失败");
    expect(container.querySelector('[role="status"]')?.textContent).toBe("");
  });

  it("reuses the same region nodes when the message changes channel", () => {
    const { container, rerender } = mount("模板已保存");
    const status = container.querySelector('[role="status"]')!;
    const alert = container.querySelector('[role="alert"]')!;

    rerender("字体上传失败");

    expect(container.querySelector('[role="status"]')).toBe(status);
    expect(container.querySelector('[role="alert"]')).toBe(alert);
    expect(alert.textContent).toBe("字体上传失败");
    expect(status.textContent).toBe("");
  });
});
