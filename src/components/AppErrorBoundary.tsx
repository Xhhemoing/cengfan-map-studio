import { Component, type ErrorInfo, type ReactNode } from "react";
import { MapPinned } from "lucide-react";
import {
  createSafeLocalStorageMirror,
  loadBrowserWorkspaceMirror,
  type SyncWorkspaceStore,
} from "../lib/browser-workspace-store";
import { downloadProjectPackage, type ProjectPackage } from "../lib/project-package";
import { createIndexedDbProjectStore, type ProjectStore } from "../lib/project-store";

type BackupOutcome =
  | "exported"
  | "mirror-empty"
  | "mirror-corrupt"
  | "mirror-unreadable"
  | "download-failed"
  | "store-listed"
  | "store-empty"
  | "store-degraded"
  | "store-unreadable"
  | "project-missing";

const OK_OUTCOMES = new Set<BackupOutcome>(["exported", "store-listed"]);

export interface AppErrorBoundaryProps {
  children: ReactNode;
  /** 覆盖工作区镜像来源，默认读取 localStorage 镜像。 */
  mirror?: SyncWorkspaceStore;
  /** 覆盖项目库来源，默认读取 IndexedDB 项目库（只读，不会写回）。 */
  projectStore?: ProjectStore;
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

/** 崩溃屏里可以逐个导出的工程条目，只保留展示与定位需要的字段。 */
interface RecoverableProject {
  id: string;
  name: string;
  updatedAt: string;
  studentCount: number;
}

interface AppErrorBoundaryState {
  failed: boolean;
  backup: BackupNote | null;
  projects: RecoverableProject[];
}

function errorMessage(reason: unknown): string {
  return reason instanceof Error ? reason.message : String(reason);
}

/** 工程名可能带路径分隔符等在下载时非法的字符。 */
function filenameSafe(name: string): string {
  // C0 controls are illegal in download names; the class is intentional.
  // eslint-disable-next-line no-control-regex
  const cleaned = name.replace(/[\\/:*?"<>|\u0000-\u001f]+/g, "_").trim();
  return cleaned || "未命名项目";
}

/**
 * Last-resort error boundary: any uncaught render error shows a recoverable
 * screen instead of a blank page. Recovery actions: re-render the tree, go back
 * to the project list, or export the user's work as project packages.
 *
 * 导出有两条通道：编辑器的 localStorage 工作区镜像是主通道；镜像为空/损坏/读不出来时
 * （例如崩溃发生在项目工作台路由上），回落到只读枚举 IndexedDB 项目库并逐个导出。
 */
export class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = { failed: false, backup: null, projects: [] };

  private crash: CrashDetail | null = null;

  private ownStore: ProjectStore | null = null;

  private mounted = true;

  static getDerivedStateFromError(): Pick<AppErrorBoundaryState, "failed"> {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    this.crash = { message: error.message, componentStack: info.componentStack ?? null };
    console.error("AppErrorBoundary caught:", error, info.componentStack);
  }

  componentWillUnmount(): void {
    this.mounted = false;
  }

  /** 同一次崩溃里复用一个 store 实例：list / get 必须看到同一个连接与同一份降级状态。 */
  private projectStore(): ProjectStore {
    if (this.props.projectStore) return this.props.projectStore;
    this.ownStore ??= createIndexedDbProjectStore();
    return this.ownStore;
  }

  private finishBackup(
    outcome: BackupOutcome,
    message: string,
    detail: Record<string, unknown> = {},
    append = false,
  ): void {
    const record = {
      scope: "AppErrorBoundary",
      action: "export-backup",
      outcome,
      at: new Date().toISOString(),
      crash: this.crash,
      ...detail,
    };
    if (OK_OUTCOMES.has(outcome)) console.info("AppErrorBoundary 备份导出:", record);
    else console.error("AppErrorBoundary 备份导出失败:", record);
    if (!this.mounted) return;
    const tone: BackupNote["tone"] = OK_OUTCOMES.has(outcome) ? "ok" : "error";
    this.setState((previous) => {
      if (!append || !previous.backup) return { backup: { tone, message } };
      return {
        backup: {
          tone: previous.backup.tone === "error" || tone === "error" ? "error" : "ok",
          message: `${previous.backup.message} ${message}`,
        },
      };
    });
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
      void this.offerStoredProjects();
      return;
    }
    if (!raw) {
      this.finishBackup("mirror-empty", "没有找到本地工作区备份，这台设备上还没有保存过工程内容。");
      void this.offerStoredProjects();
      return;
    }
    const pack = loadBrowserWorkspaceMirror(mirror);
    if (!pack) {
      this.finishBackup("mirror-corrupt", "本地工作区备份已损坏，无法导出，请保留此页面并反馈控制台中的诊断信息。", {
        mirrorBytes: raw.length,
        mirrorHead: raw.slice(0, 120),
      });
      void this.offerStoredProjects();
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

  /** 镜像没救时的第二条通道：只读列出本机项目库，交给用户逐个导出。 */
  private async offerStoredProjects(): Promise<void> {
    const store = this.projectStore();
    let items;
    try {
      items = await store.list();
    } catch (reason) {
      this.finishBackup("store-unreadable", `本机项目库也读不出来：${errorMessage(reason)}`, {
        error: errorMessage(reason),
      }, true);
      return;
    }
    // health 是打开失败之后才翻转的快照值，必须在 list() 之后再读。
    const health = store.health;
    if (items.length === 0) {
      if (health === "memory") {
        this.finishBackup("store-degraded", "本机项目库已降级为内存模式，磁盘上没有可导出的工程内容。", {
          storeHealth: health,
        }, true);
      } else {
        this.finishBackup("store-empty", "本机项目库里也没有已保存的工程。", { storeHealth: health }, true);
      }
      return;
    }
    const projects: RecoverableProject[] = items.map((item) => ({
      id: item.id,
      name: item.name,
      updatedAt: item.updatedAt,
      studentCount: item.studentCount,
    }));
    if (this.mounted) this.setState({ projects });
    const message = health === "memory"
      ? `本机项目库已降级为内存模式（磁盘上没有持久副本），本次会话里还能读到 ${projects.length} 个工程，请立刻逐个导出。`
      : `本机项目库里还有 ${projects.length} 个工程，可逐个导出。`;
    this.finishBackup("store-listed", message, { storeHealth: health, projects: projects.length }, true);
  }

  private exportStoredProject(item: RecoverableProject): void {
    void this.runStoredProjectExport(item);
  }

  private async runStoredProjectExport(item: RecoverableProject): Promise<void> {
    const store = this.projectStore();
    const download = this.props.downloadPack ?? downloadProjectPackage;
    let stored;
    try {
      stored = await store.get(item.id);
    } catch (reason) {
      this.finishBackup("store-unreadable", `读取「${item.name}」失败：${errorMessage(reason)}`, {
        projectId: item.id,
        error: errorMessage(reason),
      });
      return;
    }
    if (!stored) {
      this.finishBackup("project-missing", `「${item.name}」已经不在本机项目库里了。`, { projectId: item.id });
      return;
    }
    const detail = {
      projectId: stored.id,
      projectName: stored.name,
      source: "project-store",
      packageVersion: stored.pack.version,
      exportedAt: stored.pack.exportedAt,
      students: stored.pack.project.students.length,
      assets: stored.pack.assets.length,
      fonts: stored.pack.fonts.length,
    };
    try {
      download(stored.pack, `cengfan-recovery-${filenameSafe(stored.name)}-${stored.updatedAt.slice(0, 10)}.json`);
    } catch (reason) {
      this.finishBackup("download-failed", `导出「${stored.name}」失败：${errorMessage(reason)}`, {
        ...detail,
        error: errorMessage(reason),
      });
      return;
    }
    this.finishBackup("exported", `已导出「${stored.name}」，可在恢复后通过「导入工程」重新载入。`, detail);
  }

  render(): ReactNode {
    if (!this.state.failed) return this.props.children;
    const { backup, projects } = this.state;
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
              onClick={() => this.setState({ failed: false, backup: null, projects: [] })}
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
          {projects.length > 0 ? (
            <ul
              aria-label="本机项目库工程"
              style={{ display: "grid", gap: 8, margin: 0, padding: 0, listStyle: "none" }}
            >
              {projects.map((project) => (
                <li key={project.id}>
                  <button
                    type="button"
                    className="secondary-button"
                    data-project-id={project.id}
                    aria-label={`导出「${project.name}」`}
                    onClick={() => this.exportStoredProject(project)}
                  >
                    {project.name}（{project.studentCount} 人 · {project.updatedAt.slice(0, 10)}）
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      </main>
    );
  }
}
