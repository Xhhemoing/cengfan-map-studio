import { flushSync } from "react-dom";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { installProjectWorkbenchTestHarness, mountElement } from "./project-workbench-test-harness";
import { ClipboardButton } from "./ClipboardButton";

installProjectWorkbenchTestHarness();

describe("ClipboardButton", () => {
  it("does not announce an old copy as success for newly generated text", async () => {
    let resolve!: () => void;
    const writeText = vi.fn(() => new Promise<void>((done) => { resolve = done; }));
    vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText } });
    function Harness() {
      const [text, setText] = useState("first-fictional-invitation");
      return <><ClipboardButton text={text} label="复制邀请凭证" /><button type="button" onClick={() => setText("new-fictional-invitation")}>生成新邀请</button></>;
    }
    const container = mountElement(<Harness />);
    flushSync(() => container.querySelector<HTMLButtonElement>('[aria-label="复制邀请凭证"]')!.click());
    flushSync(() => container.querySelectorAll<HTMLButtonElement>("button")[1]!.click());
    resolve();
    await vi.waitFor(() => expect(container.querySelector<HTMLButtonElement>('[aria-label="复制邀请凭证"]')!.disabled).toBe(false));
    expect(writeText).toHaveBeenCalledTimes(1);
    expect(container.querySelector('[role="status"]')).toBeNull();
    flushSync(() => container.querySelector<HTMLButtonElement>('[aria-label="复制邀请凭证"]')!.click());
    resolve();
    await vi.waitFor(() => expect(container.querySelector('[role="status"]')?.textContent).toBe("已复制"));
    expect(writeText).toHaveBeenLastCalledWith("new-fictional-invitation");
  });
  it("waits for clipboard success and prevents duplicate writes", async () => {
    let resolve!: () => void;
    const writeText = vi.fn(() => new Promise<void>((done) => { resolve = done; }));
    vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText } });
    const container = mountElement(<ClipboardButton text="test-room" label="复制房间码" iconOnly />);
    const button = container.querySelector("button")!;
    flushSync(() => button.click());
    flushSync(() => button.click());
    expect(writeText).toHaveBeenCalledTimes(1);
    expect(container.querySelector('[role="status"]')).toBeNull();
    resolve();
    await vi.waitFor(() => expect(container.querySelector('[role="status"]')?.textContent).toBe("已复制"));
  });

  it("offers manual copying when unavailable without exposing credential contents", async () => {
    vi.stubGlobal("navigator", { ...navigator, clipboard: undefined });
    const container = mountElement(<ClipboardButton text="private-invitation" label="复制邀请凭证" />);
    flushSync(() => container.querySelector("button")!.click());
    await vi.waitFor(() => expect(container.querySelector('[role="alert"]')?.textContent).toContain("手动选择"));
    expect(container.textContent).not.toContain("private-invitation");
  });
});
