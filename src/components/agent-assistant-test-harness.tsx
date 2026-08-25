// 仅供 AgentAssistant 测试使用的共享装置：从 src/components/AgentAssistant.test.tsx
// 原样搬出的挂载/交互助手，加上集中化的 fetch 替身，供按域拆分后的
// src/components/AgentAssistant.*.test.tsx 共用。
import { StrictMode, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { flushSync } from "react-dom";
import { afterEach, vi, type Mock } from "vitest";
import { AgentAssistant, AssistantConversationProvider } from "./AgentAssistant";
import { createProjectDocument, type ProjectDocument } from "../lib/project-document";

interface MountedRoot {
  root: Root;
  container: HTMLElement;
}

/**
 * 每个挂过的根都登记在这里，由 {@link installAgentAssistantTestHarness} 的 afterEach 兜底卸载：
 * 助手挂着在途 fetch、AbortController 与防抖持久化，断言一旦在内联 `root.unmount()` 之前抛出，
 * 这个根就会带着这些资源跑完剩下的用例（setupFiles 的 leaked-root 守卫只报告缺网，不代替这张网）。
 */
const mounted: MountedRoot[] = [];

function unmountEntry(entry: MountedRoot): void {
  const index = mounted.indexOf(entry);
  if (index < 0) return;
  mounted.splice(index, 1);
  flushSync(() => entry.root.unmount());
  entry.container.remove();
}

/**
 * 挂载任意助手树并登记根。返回的 `root.unmount()` 会顺带注销登记，所以用例里保留的内联卸载
 * 与兜底 drain 不会互相重复卸载同一个根。
 */
export function mountAssistant(element: ReactElement): { container: HTMLElement; root: Root } {
  const container = document.createElement("div");
  const root = createRoot(container);
  const entry: MountedRoot = { root, container };
  mounted.push(entry);
  flushSync(() => root.render(element));
  return {
    container,
    root: {
      render: (next: ReactElement) => root.render(next),
      unmount: () => unmountEntry(entry),
    },
  };
}

export function assistantProject(overrides: Partial<Parameters<typeof createProjectDocument>[0]> = {}): ProjectDocument {
  return createProjectDocument({ students: [], templateId: "original", dataView: "province", ...overrides });
}

export function renderAssistant(project: ProjectDocument, onCommit = vi.fn(), clearStorage = true, strict = false) {
  if (clearStorage) window.localStorage.clear();
  const assistant = <AssistantConversationProvider><AgentAssistant project={project} assets={[]} onCommit={onCommit} /></AssistantConversationProvider>;
  const { container, root } = mountAssistant(strict ? <StrictMode>{assistant}</StrictMode> : assistant);
  return { container, root, onCommit };
}

export function response(body: unknown) {
  return { ok: true, status: 200, json: async () => body };
}

/**
 * 传输替身的唯一入口：用例只描述响应脚本，装桩和恢复都归装置管，不再各自 `vi.stubGlobal("fetch", ...)`。
 */
export function installFetch(mock: Mock): Mock {
  vi.stubGlobal("fetch", mock);
  return mock;
}

/** 依次返回若干个 200 JSON 响应的 fetch 替身，覆盖绝大多数用例的脚本。 */
export function installResponses(...bodies: unknown[]): Mock {
  const mock = vi.fn();
  for (const body of bodies) mock.mockResolvedValueOnce(response(body));
  return installFetch(mock);
}

export function openAssistant(container: HTMLElement) {
  flushSync(() => container.querySelector<HTMLButtonElement>('.agent-assistant-launcher')?.click());
}

export function setMessage(container: HTMLElement, value: string) {
  const textarea = container.querySelector<HTMLTextAreaElement>("textarea");
  if (!textarea) throw new Error("assistant textarea missing");
  flushSync(() => {
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")?.set;
    setter?.call(textarea, value);
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

export function clickText(container: HTMLElement, text: string) {
  const button = Array.from(container.querySelectorAll<HTMLButtonElement>("button")).find((candidate) => candidate.textContent?.includes(text));
  if (!button) throw new Error(`button missing: ${text}; text=${container.textContent}`);
  flushSync(() => button.click());
}

/** 第 n 次 fetch 调用的请求体，续跑用例用它检查发回去的历史。 */
export function requestBody(fetchMock: Mock, index: number) {
  return JSON.parse(String((fetchMock.mock.calls[index] as unknown[])[1] && ((fetchMock.mock.calls[index] as unknown[])[1] as RequestInit).body));
}

/**
 * 注册每个用例文件都依赖的文件级 afterEach：先卸载登记过的根（卸载会中止在途请求、取消防抖
 * 持久化，这一步仍然需要用例装好的 fetch），再把定时器、全局桩与 fetch 恢复原状，最后清掉
 * 会话存储，让下一个用例从空白开始。
 */
export function installAgentAssistantTestHarness(): void {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    for (const entry of [...mounted]) unmountEntry(entry);
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    globalThis.fetch = originalFetch;
    window.localStorage.clear();
  });
}
