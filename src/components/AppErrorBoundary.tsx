import { Component, type ErrorInfo, type ReactNode } from "react";
import { MapPinned } from "lucide-react";

/**
 * Last-resort error boundary: any uncaught render error shows a recoverable
 * screen instead of a blank page. Recovery actions: re-render the tree or go
 * back to the project list.
 */
export class AppErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("AppErrorBoundary caught:", error, info.componentStack);
  }

  render(): ReactNode {
    if (!this.state.failed) return this.props.children;
    return (
      <main className="workbench-shell">
        <section className="workbench-error workbench-error--recover" role="alert">
          <span className="workbench-brand-mark"><MapPinned size={22} /></span>
          <strong>界面加载出错</strong>
          <p>可能是本地数据或网络问题导致的临时故障，你的工程内容不会被清除。</p>
          <div className="workbench-error-actions">
            <button
              type="button"
              className="primary-button"
              aria-label="重新加载界面"
              onClick={() => this.setState({ failed: false })}
            >
              重新加载
            </button>
            <button
              type="button"
              className="secondary-button"
              aria-label="返回项目列表"
              onClick={() => {
                window.location.hash = "#/";
                window.location.reload();
              }}
            >
              返回项目列表
            </button>
          </div>
        </section>
      </main>
    );
  }
}
