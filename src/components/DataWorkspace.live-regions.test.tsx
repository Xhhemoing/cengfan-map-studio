// 按域保留：导入结果的两个常驻 live region——status 播报成功、alert 播报阻断，
// 空闲时都留在无障碍树里且保持 CSS :empty。
// 共享挂载/交互装置见 src/components/data-workspace-test-harness.tsx。
import { flushSync } from "react-dom";
import { describe, expect, it, vi } from "vitest";
import type { ParseDataResult } from "../lib/ai-client";
import {
  installDataWorkspaceTestHarness,
  renderWorkspace,
  settle,
  click,
  changeInput,
  grantAiUpload,
} from "./data-workspace-test-harness";

installDataWorkspaceTestHarness();

describe("DataWorkspace import live regions", () => {
  it("announces import results in a live region that stays mounted while empty", async () => {
    const container = renderWorkspace();

    const region = container.querySelector('[role="status"].data-message');
    expect(region).not.toBeNull();
    expect(region!.getAttribute("aria-live")).toBe("polite");
    expect(region!.getAttribute("aria-atomic")).toBe("true");
    expect(region!.textContent).toBe("");
    expect(container.querySelectorAll('[role="status"]').length).toBe(1);

    click(container.querySelector<HTMLButtonElement>('button[aria-label="下载学生数据 XLSX 模板"]')!);
    await vi.waitFor(() => {
      flushSync(() => {});
      expect(region!.textContent).toContain("已下载学生数据导入模板");
    });

    // 同一个节点被复用，说明 region 没有随消息一起挂载/卸载
    expect(container.querySelector('[role="status"].data-message')).toBe(region);
  });

  it("keeps the replace summary inside the same live region as the import message", async () => {
    const requestAiParse = vi.fn(async (): Promise<ParseDataResult> => ({
      provider: "local-fallback",
      candidates: [{ name: "苏禾", university: "浙江大学", city: "杭州", sourceLine: 1, rawLine: "苏禾 浙江大学 杭州" }],
      unparsed: [],
    }));
    const container = renderWorkspace({ requestAiParse, confirmReplace: () => true });
    const region = container.querySelector('[role="status"].data-message')!;

    changeInput(container.querySelector("textarea")!, "苏禾 浙江大学 杭州");
    click(container.querySelector<HTMLButtonElement>('button[aria-label="智能识别名单"]')!);
    grantAiUpload(container);
    await settle();
    click(Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.includes("替换全部"))!);

    expect(region.textContent).toContain("当前 1 条");
    expect(region.textContent).toContain("已替换 1 条学生数据");
    expect(container.querySelector('[role="status"].data-message')).toBe(region);
  });

  it("routes failure messages to an always-mounted role=alert region", () => {
    const container = renderWorkspace();

    const alertRegion = container.querySelector('[role="alert"].data-message');
    expect(alertRegion).not.toBeNull();
    expect(alertRegion!.getAttribute("aria-live")).toBe("assertive");
    expect(alertRegion!.getAttribute("aria-atomic")).toBe("true");
    expect(alertRegion!.textContent).toBe("");
    expect(container.querySelectorAll('[role="alert"]').length).toBe(1);

    // 空名单直接点“一键识别并导入”：阻断消息进 alert，status 保持安静
    click(Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.includes("一键识别并导入"))!);
    expect(alertRegion!.textContent).toContain("请先粘贴名单");
    expect(container.querySelector('[role="status"].data-message')!.textContent).toBe("");

    // 同一个节点被复用，说明 alert region 没有随消息一起挂载/卸载
    expect(container.querySelector('[role="alert"].data-message')).toBe(alertRegion);
  });

  it("empties the alert region when a later success message arrives", async () => {
    const container = renderWorkspace();
    const alertRegion = container.querySelector('[role="alert"].data-message')!;
    const statusRegion = container.querySelector('[role="status"].data-message')!;

    click(Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.includes("一键识别并导入"))!);
    expect(alertRegion.textContent).toContain("请先粘贴名单");

    click(container.querySelector<HTMLButtonElement>('button[aria-label="下载学生数据 XLSX 模板"]')!);
    await vi.waitFor(() => {
      flushSync(() => {});
      expect(statusRegion.textContent).toContain("已下载学生数据导入模板");
    });

    expect(alertRegion.textContent).toBe("");
    expect(container.querySelector('[role="alert"].data-message')).toBe(alertRegion);
  });

  it("leaves both live regions CSS-:empty while idle so the collapse rule applies", async () => {
    const container = renderWorkspace();
    const statusRegion = container.querySelector('[role="status"].data-message')!;
    const alertRegion = container.querySelector('[role="alert"].data-message')!;

    // 空白文本节点会让 .data-message:empty 的收起规则失效，露出空的绿/红框
    expect(statusRegion.matches(":empty")).toBe(true);
    expect(alertRegion.matches(":empty")).toBe(true);
    expect(statusRegion.childNodes.length).toBe(0);
    expect(alertRegion.childNodes.length).toBe(0);

    click(Array.from(container.querySelectorAll("button")).find((button) => button.textContent?.includes("一键识别并导入"))!);
    expect(alertRegion.matches(":empty")).toBe(false);
    expect(statusRegion.matches(":empty")).toBe(true);

    click(container.querySelector<HTMLButtonElement>('button[aria-label="下载学生数据 XLSX 模板"]')!);
    await vi.waitFor(() => {
      flushSync(() => {});
      expect(statusRegion.textContent).toContain("已下载学生数据导入模板");
    });

    expect(statusRegion.matches(":empty")).toBe(false);
    expect(alertRegion.matches(":empty")).toBe(true);
  });
});
