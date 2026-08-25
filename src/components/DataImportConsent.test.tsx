import { afterEach, describe, expect, it, vi } from "vitest";
import { useState, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { flushSync } from "react-dom";
import { AiUploadConsentDialog, useAiUploadConsent, type AiUploadSource } from "./DataImportConsent";
import { AI_PARSE_CONSENT_STORAGE_KEY } from "../lib/use-studio-preferences";

let roots: Array<{ root: Root; container: HTMLElement }> = [];

function mount(element: ReactElement): HTMLElement {
  const container = document.createElement("div");
  // 焦点行为依赖真实文档树，容器必须挂到 body 上。
  document.body.appendChild(container);
  const root = createRoot(container);
  roots.push({ root, container });
  flushSync(() => root.render(element));
  return container;
}

afterEach(() => {
  roots.forEach(({ root, container }) => {
    root.unmount();
    container.remove();
  });
  roots = [];
  window.localStorage.clear();
  vi.restoreAllMocks();
});

function click(element: Element): void {
  flushSync(() => element.dispatchEvent(new MouseEvent("click", { bubbles: true })));
}

function press(target: Element, key: string): void {
  flushSync(() => target.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true })));
}

/** 复刻导入面板的用法：点按钮发起询问，同意与否决定粘贴原文是否出境。 */
function ConsentHarness({ onSettled, source = "paste" }: { onSettled: (granted: boolean) => void; source?: AiUploadSource }) {
  const gate = useAiUploadConsent(vi.fn());
  const [asked, setAsked] = useState(false);
  return (
    <div>
      <button
        type="button"
        onClick={() => {
          setAsked(true);
          void gate.requestConsent(source).then(onSettled);
        }}
      >
        一键识别并导入
      </button>
      {asked && <span>已发起</span>}
      <AiUploadConsentDialog gate={gate} />
    </div>
  );
}

function ask(container: HTMLElement) {
  const trigger = Array.from(container.querySelectorAll("button")).find((button) =>
    button.textContent?.includes("一键识别并导入"),
  )!;
  trigger.focus();
  click(trigger);
  const dialog = container.querySelector<HTMLElement>(".ai-consent")!;
  return { trigger, dialog };
}

async function settle(): Promise<void> {
  await Promise.resolve();
  await Promise.resolve();
}

describe("AiUploadConsentDialog 焦点与键盘出口", () => {
  it("询问出现时把焦点收到面板上", () => {
    const container = mount(<ConsentHarness onSettled={vi.fn()} />);
    const { dialog } = ask(container);

    expect(dialog).not.toBeNull();
    expect(dialog.getAttribute("role")).toBe("dialog");
    expect(dialog.tabIndex).toBe(-1);
    expect(document.activeElement).toBe(dialog);
  });

  it("Esc 等同「仅用本地识别」：原文不出本机", async () => {
    const onSettled = vi.fn();
    const container = mount(<ConsentHarness onSettled={onSettled} />);
    const { dialog } = ask(container);

    press(dialog, "Escape");
    await settle();

    expect(onSettled).toHaveBeenCalledWith(false);
    expect(container.querySelector(".ai-consent")).toBeNull();
    // 没勾「记住」，下次仍要再问一遍。
    expect(window.localStorage.getItem(AI_PARSE_CONSENT_STORAGE_KEY)).toBeNull();
  });

  it("Esc 不冒泡给文档级监听", () => {
    const container = mount(<ConsentHarness onSettled={vi.fn()} />);
    const { dialog } = ask(container);
    const documentListener = vi.fn();
    document.addEventListener("keydown", documentListener);

    press(dialog, "Escape");

    expect(documentListener).not.toHaveBeenCalled();
    document.removeEventListener("keydown", documentListener);
  });

  it("Esc 前勾了「记住我的选择」时记下的是拒绝", async () => {
    const onSettled = vi.fn();
    const container = mount(<ConsentHarness onSettled={onSettled} />);
    const { dialog } = ask(container);

    click(dialog.querySelector<HTMLInputElement>('input[aria-label="记住我的选择"]')!);
    press(container.querySelector<HTMLElement>(".ai-consent")!, "Escape");
    await settle();

    expect(onSettled).toHaveBeenCalledWith(false);
    expect(window.localStorage.getItem(AI_PARSE_CONSENT_STORAGE_KEY)).toBe("denied");
  });

  it("点「同意并发送」仍然按原样放行", async () => {
    const onSettled = vi.fn();
    const container = mount(<ConsentHarness onSettled={onSettled} />);
    const { dialog } = ask(container);

    click(dialog.querySelector<HTMLButtonElement>('button[aria-label="同意并发送"]')!);
    await settle();

    expect(onSettled).toHaveBeenCalledWith(true);
    expect(container.querySelector(".ai-consent")).toBeNull();
  });
});
