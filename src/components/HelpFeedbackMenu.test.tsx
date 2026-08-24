import { flushSync } from "react-dom";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";
import { HelpFeedbackMenu } from "./HelpFeedbackMenu";
import { formatEnvironmentForIssue, type ClientEnvironment } from "../lib/feedback-links";

const environment: ClientEnvironment = { os: "Windows 10/11", browser: "Chrome 128", runtime: "本机 npm run dev" };
const roots: Array<{ root: Root; container: HTMLDivElement }> = [];

afterEach(() => {
  roots.splice(0).forEach(({ root, container }) => {
    flushSync(() => root.unmount());
    container.remove();
  });
});

function renderMenu(props: Partial<Parameters<typeof HelpFeedbackMenu>[0]> = {}) {
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  roots.push({ root, container });
  flushSync(() => root.render(<HelpFeedbackMenu environment={environment} {...props} />));
  return container;
}

function links(container: HTMLElement) {
  return Array.from(container.querySelectorAll("a"));
}

describe("HelpFeedbackMenu", () => {
  it("offers the four feedback and help destinations behind one disclosure", () => {
    const container = renderMenu();

    const summary = container.querySelectorAll('summary[aria-label="帮助与反馈"]');
    expect(summary).toHaveLength(1);
    const labels = links(container).map((anchor) => anchor.textContent?.trim());
    expect(labels).toContain("使用意见");
    expect(labels).toContain("遇到问题");
    expect(labels).toContain("功能建议");
    expect(labels).toContain("用户指南");
  });

  it("opens every destination in a new tab without leaking the opener", () => {
    const container = renderMenu();

    const anchors = links(container);
    expect(anchors.length).toBeGreaterThanOrEqual(4);
    for (const anchor of anchors) {
      expect(anchor.getAttribute("target")).toBe("_blank");
      expect(anchor.getAttribute("rel")).toContain("noopener");
      expect(anchor.getAttribute("rel")).toContain("noreferrer");
      expect(anchor.getAttribute("aria-label")).toContain("新窗口打开");
    }
  });

  it("prefills only the coarse environment on the bug report link", () => {
    const container = renderMenu();

    const bug = links(container).find((anchor) => anchor.textContent?.trim() === "遇到问题")!;
    const url = new URL(bug.href);
    expect(url.searchParams.get("template")).toBe("bug.yml");
    expect(url.searchParams.get("env")).toBe("Windows 10/11 + Chrome 128");
    expect(url.searchParams.get("where")).toBe("本机 npm run dev");

    const guide = links(container).find((anchor) => anchor.textContent?.trim() === "用户指南")!;
    expect(new URL(guide.href).search).toBe("");
  });

  it("keeps roster, project and room data out of every rendered href", () => {
    const container = renderMenu();

    for (const anchor of links(container)) {
      expect(anchor.href).toMatch(/^https:\/\/github\.com\/Xhhemoing\/cengfan-map-studio\//);
      expect(anchor.href).not.toMatch(/林舟|北京大学|students|roster|roomId|room=|token|cengfan-project/i);
      // 工程 JSON 一旦被塞进 query 就会带上编码后的花括号与引号
      expect(anchor.href).not.toMatch(/%7B|%22|%5B/i);
      expect(anchor.href.length).toBeLessThanOrEqual(512);
    }
  });

  it("only links out — it never uploads anything", () => {
    const container = renderMenu();

    expect(container.querySelector("form")).toBeNull();
    expect(container.querySelector("textarea")).toBeNull();
    expect(container.querySelector('input[type="file"]')).toBeNull();
    expect(container.textContent).toContain("只会带上系统与浏览器版本，不会上传名单或工程内容。");
  });

  it("copies the environment line so it can be pasted into fields GitHub cannot prefill", () => {
    const writeText = vi.fn((_text: string) => Promise.resolve());
    vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText } });
    const onCopyEnvironment = vi.fn();
    const container = renderMenu({ onCopyEnvironment });

    const copyButton = container.querySelector<HTMLButtonElement>('button[aria-label="复制环境信息"]')!;
    // 图标按钮：可访问名走 aria-label / title，可见文案留给宿主菜单，避免按文本查找的调用方误命中。
    expect(copyButton.textContent?.trim()).toBe("");
    expect(copyButton.getAttribute("title")).toBe("复制环境信息");
    flushSync(() => copyButton.dispatchEvent(new MouseEvent("click", { bubbles: true })));

    const copied = writeText.mock.calls[0]?.[0];
    expect(copied).toBe(formatEnvironmentForIssue(environment));
    expect(copied).not.toContain("http");
    expect(copied).not.toContain("?");
    expect(onCopyEnvironment).toHaveBeenCalledWith(copied);
    vi.unstubAllGlobals();
  });

  it("marks the workbench placement without changing the markup contract", () => {
    const container = renderMenu({ variant: "workbench" });

    const menu = container.querySelector(".help-menu")!;
    expect(menu.classList.contains("help-menu--workbench")).toBe(true);
    expect(container.querySelector('summary[aria-label="帮助与反馈"]')).not.toBeNull();
  });

  it("does not introduce a live region (deferred to a later change)", () => {
    const container = renderMenu();

    expect(container.querySelector("[aria-live]")).toBeNull();
  });
});
