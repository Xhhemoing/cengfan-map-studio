import { afterEach, describe, expect, it, vi } from "vitest";
import { AgentAssistant, AssistantConversationProvider } from "./AgentAssistant";
import { assistantProject, clickText, installAgentAssistantTestHarness, mountAssistant, setMessage } from "./agent-assistant-test-harness";

installAgentAssistantTestHarness();
afterEach(() => vi.unstubAllEnvs());
describe("assistant capability experience", () => {
  it("never posts AI requests on Pages and keeps real local tools available", async () => {
    vi.stubEnv("VITE_PUBLIC_DEMO", "1");
    const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
    const layout = vi.fn(); const diagnose = vi.fn();
    const { container, root } = mountAssistant(<AssistantConversationProvider><AgentAssistant presentation="docked" project={assistantProject()} assets={[]} onCommit={vi.fn()} onLocalLayout={layout} onLocalDiagnose={diagnose} /></AssistantConversationProvider>);
    await vi.waitFor(() => expect(container.querySelector('[aria-label="描述 AI 修改需求"]')).not.toBeNull());
    expect(container.textContent).toContain("静态站点");
    setMessage(container, "重新排版");
    const plan = container.querySelector<HTMLButtonElement>('[aria-label="开始规划"]')!;
    expect(plan.disabled).toBe(true);
    clickText(container, "本地智能排版"); clickText(container, "本地排版体检");
    expect(layout).toHaveBeenCalledTimes(1); expect(diagnose).toHaveBeenCalledTimes(1);
    expect(fetch).not.toHaveBeenCalled();
    root.unmount();
  });
  it("reports a failed health check before allowing another remote plan", async () => {
    vi.stubEnv("VITE_PUBLIC_DEMO", "0");
    const fetch = vi.fn().mockResolvedValue({ ok: false, status: 405 }); vi.stubGlobal("fetch", fetch);
    const { container, root } = mountAssistant(<AssistantConversationProvider><AgentAssistant presentation="docked" project={assistantProject()} assets={[]} onCommit={vi.fn()} /></AssistantConversationProvider>);
    await vi.waitFor(() => expect(container.querySelector('[aria-label="描述 AI 修改需求"]')).not.toBeNull());
    clickText(container, "检测 AI 服务");
    await vi.waitFor(() => expect(container.textContent).toContain("HTTP 405"));
    setMessage(container, "改成红色");
    expect(container.querySelector<HTMLButtonElement>('[aria-label="开始规划"]')!.disabled).toBe(true);
    expect(fetch).toHaveBeenCalledTimes(1);
    root.unmount();
  });
});
