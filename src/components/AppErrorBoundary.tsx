import { Component, type ErrorInfo, type ReactNode } from "react";
import { MapPinned } from "lucide-react";
import {
  createSafeLocalStorageMirror,
  loadBrowserWorkspaceMirror,
  type SyncWorkspaceStore,
} from "../lib/browser-workspace-store";
import { downloadProjectPackage, type ProjectPackage } from "../lib/project-package";

type BackupOutcome =
  | "exported"
  | "mirror-empty"
  | "mirror-corrupt"
  | "mirror-unreadable"
  | "download-failed";

export interface AppErrorBoundaryProps {
  children: ReactNode;
  /** 覆盖工作区镜像来源，默认读取 localStorage 镜像。 */
  mirror?: SyncWorkspaceStore;
  /** 覆盖下载通道，默认走工程包下载助手。 */
  downloadPack?: (pack: ProjectPackage, filename?: string) => void;
}

interface CrashDetail {
  message: string;
  componentStack: string | null;
}

interface BackupNote {
  tone: "ok" | "error";
  message: string;
}

interface AppErrorBoundaryState {
  failed: boolean;
  backup: BackupNote | null;
}

function errorMessage(reason: unknown): string {
  return reason instanceof Error ? reason.message : String(reason);
}

/**
 * Last-resort error boundary: any uncaught render error shows a recoverable
 * screen instead of a blank page. Recovery actions: re-render the tree, go back
 * to the project list, or export the local workspace mirror as a project
 * package so a crash-looping editor never traps the user's work.
 */
export class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = { failed: false, backup: null };

  private crash: CrashDetail | null = null;

  static getDerivedStateFromError(): Pick<AppErrorBoundaryState, "failed"> {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    this.crash = { message: error.message, componentStack: info.componentStack ?? null };
    console.error("AppErrorBoundary caught:", error, info.componentStack);
  }

  private finishBackup(
    outcome: BackupOutcome,
    message: string,
    detail: Record<string, unknown> = {},
  ): void {
    const record = {
      scope: "AppErrorBoundary",
      action: "export-backup",
      outcome,
      at: new Date().toISOString(),
      crash: this.crash,
      ...detail,
    };
    if (outcome === "exported") console.info("AppErrorBoundary 备份导出:", record);
    else console.error("AppErrorBoundary 备份导出失败:", record);
    this.setState({ backup: { tone: outcome === "exported" ? "ok" : "error", message } });
  }

  private exportBackup = (): void => {
    const mirror = this.props.mirror ?? createSafeLocalStorageMirror();
    const download = this.props.downloadPack ?? downloadProjectPackage;
    let raw: string | null;
    try {
      raw = mirror.get();
    } catch (reason) {
      this.finishBackup("mirror-unreadable", `读取本地工作区失败：${errorMessage(reason)}`, {
        error: errorMessage(reason),
      });
      return;
    }
    if (!raw) {
      this.finishBackup("mirror-empty", "没有找到本地工作区备份，这台设备上还没有保存过工程内容。");
      return;
    }
    const pack = loadBrowserWorkspaceMirror(mirror);
    if (!pack) {
      this.finishBackup("mirror-corrupt", "本地工作区备份已损坏，无法导出，请保留此页面并反馈控制台中的诊断信息。", {
        mirrorBytes: raw.length,
        mirrorHead: raw.slice(0, 120),
      });
      return;
    }
    const detail = {
      mirrorBytes: raw.length,
      packageVersion: pack.version,
      exportedAt: pack.exportedAt,
      students: pack.project.students.length,
      assets: pack.assets.length,
      fonts: pack.fonts.length,
    };
    try {
      download(pack, `cengfan-recovery-${pack.exportedAt.slice(0, 10)}.json`);
    } catch (reason) {
      this.finishBackup("download-failed", `导出工程备份失败：${errorMessage(reason)}`, {
        ...detail,
        error: errorMessage(reason),
      });
      return;
    }
    this.finishBackup("exported", "已导出工程备份文件，可在恢复后通过「导入工程」重新载入。", detail);
  };

  render(): ReactNode {
    if (!this.state.failed) return this.props.children;
    const { backup } = this.state;
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
              onClick={() => this.setState({ failed: false, backup: null })}
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
            <button
              type="button"
              className="secondary-button"
              aria-label="导出工程备份"
              onClick={this.exportBackup}
            >
              导出工程备份
            </button>
          </div>
          {backup ? <p role="status" data-tone={backup.tone}>{backup.message}</p> : null}
        </section>
      </main>
    );
  }
}
