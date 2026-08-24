import { StrictMode, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { flushSync } from "react-dom";
import { WorkflowPrototype } from "./components/WorkflowPrototype";
import { StudioMuiProvider } from "./components/StudioMuiProvider";
import { AppErrorBoundary } from "./components/AppErrorBoundary";
import { ProjectRoute, WorkbenchRoute } from "./components/StudioRoutes";
import { editorProjectStore } from "./lib/editor-project-store";
import "./styles.css";

/** 工作台路由沿用的旧名字,指向同一个共享实例。 */
export const workbenchStore = editorProjectStore;

function projectIdFromHash(hash: string): string | null {
  const match = hash.match(/^#\/project\/([A-Za-z0-9-]+)$/);
  return match?.[1] ?? null;
}

let root: Root | null = null;
let hashListener: (() => void) | null = null;

function renderView(container: HTMLElement, view: ReactElement) {
  // 容器内容被 React 之外的方式清空(如测试清理)后,复用旧 root 会静默渲染为空;
  // 此时重建 root,保证同一 container 重复 render 依然可靠。
  if (root && container.childNodes.length === 0) {
    try {
      root.unmount();
    } catch {
      // 旧树 DOM 已被外部清空,卸载失败可忽略。
    }
    root = null;
  }
  if (!root) root = createRoot(container);
  const activeRoot: Root = root; // const 捕获,避免闭包内 TS18047 窄化丢失
  // 崩溃边界必须拿到共享 store:自建实例看不到降级会话留在内存里的项目,导出通道会空手而归。
  flushSync(() => activeRoot.render(
    <StrictMode>
      <StudioMuiProvider>
        <AppErrorBoundary projectStore={editorProjectStore}>{view}</AppErrorBoundary>
      </StudioMuiProvider>
    </StrictMode>,
  ));
}

export function renderApp(container: HTMLElement): void {
  const render = () => {
    if (window.location.pathname === "/prototype") {
      renderView(container, <WorkflowPrototype />);
      return;
    }
    const projectId = projectIdFromHash(window.location.hash);
    if (projectId) {
      renderView(container, <ProjectRoute projectId={projectId} />);
      return;
    }
    renderView(container, <WorkbenchRoute />);
  };
  if (hashListener) window.removeEventListener("hashchange", hashListener); // 重复调用 renderApp 只保留一个监听器
  hashListener = render;
  render();
  window.addEventListener("hashchange", render);
}

export function unmountApp(): void {
  if (hashListener) {
    window.removeEventListener("hashchange", hashListener);
    hashListener = null;
  }
  const activeRoot = root; // const 捕获,避免闭包内 TS18047 窄化丢失
  if (activeRoot) {
    flushSync(() => activeRoot.unmount());
    root = null;
  }
}

const container = document.getElementById("root");
if (container) renderApp(container);
