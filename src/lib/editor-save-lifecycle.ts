/**
 * 强制保存与「离开时保存」的生命周期:一次落盘的入口、返回工作台的收尾保存,
 * 以及切换标签/关闭页面时的尽力保存。
 *
 * 三个入口共用同一条保存管线,并且都跑在渲染期之外,所以它们的判据一起放在这里,
 * 免得 App 里散着几个只有在离开页面那一刻才会被读到的 ref。
 */
import { useEffect, useRef } from "react";
import type { EditorWorkspaceSnapshot } from "./editor-workspace-state";
import {
  describeForceSaveOutcome,
  shouldSaveOnPageLeave,
  subscribePageLeave,
  type EditorProjectRecordRefs,
} from "./editor-workspace-persistence";
import type { LocalWorkspaceOverwrite } from "./incremental-workspace-sync";
import { createProjectPackageEnvelope } from "./project-package";

export interface WorkspaceSaveLifecycleOptions {
  /** 只有项目模式才注册离开页面的保存:公开编辑器没有项目记录要写。 */
  projectId: string | undefined;
  projectLoading: boolean;
  projectMissing: boolean;
  record: EditorProjectRecordRefs;
  workspaceSync: LocalWorkspaceOverwrite;
  /** 当前这一份完整工作区(工程 + 素材 + 字体 + 模板 + 渲染设置)。 */
  readWorkspace(): EditorWorkspaceSnapshot;
  hasLocalEdits(): boolean;
  reportStatus(message: string): void;
}

export interface WorkspaceSaveLifecycle {
  /** 把当前工作区整份覆盖写下去,不产生任何提示文案。 */
  saveWorkspaceNow(): Promise<void>;
  /** 返回工作台前先落一次盘,然后交给 hash 路由。 */
  backToWorkbench(): Promise<void>;
  /** 强制保存按钮:落盘之后把结果讲清楚。 */
  overwriteBrowserStorage(): Promise<void>;
}

export function useWorkspaceSaveLifecycle(options: WorkspaceSaveLifecycleOptions): WorkspaceSaveLifecycle {
  const { projectId, projectLoading, projectMissing, record, workspaceSync } = options;
  /** 返回工作台已经保存过一次,离开页面的监听不必再写第二遍。 */
  const backNavigatingRef = useRef(false);

  const saveWorkspaceNow = async (): Promise<void> => {
    const pack = createProjectPackageEnvelope(options.readWorkspace());
    await workspaceSync.overwrite(pack);
  };

  // 项目模式下离开页面(切换/关闭标签)的自动保存采用 latest-ref 模式:
  // ref 在每次渲染后的 effect 中同步(lint 禁止渲染期写 ref),初始值即真实保存管线,
  // 覆盖首帧事件窗口;projectLifecycleRef 同样在 effect 中同步加载/缺失状态。
  const saveWorkspaceNowRef = useRef<() => Promise<void>>(saveWorkspaceNow);
  const projectLifecycleRef = useRef({ loading: projectLoading, missing: projectMissing });
  const hasLocalEditsRef = useRef(options.hasLocalEdits);
  useEffect(() => {
    saveWorkspaceNowRef.current = saveWorkspaceNow;
    projectLifecycleRef.current = { loading: projectLoading, missing: projectMissing };
    hasLocalEditsRef.current = options.hasLocalEdits;
  });

  const backToWorkbench = async (): Promise<void> => {
    if (backNavigatingRef.current) return;
    backNavigatingRef.current = true;
    if (record.idRef.current && !projectLoading && !projectMissing) {
      await saveWorkspaceNow();
    }
    window.location.hash = "#/";
  };

  // 仅项目模式注册:visibilitychange/pagehide 时若存在未保存编辑,尽力保存到
  // 本地草稿镜像(localStorage,同步落盘)+ IndexedDB 项目记录。
  useEffect(() => {
    if (!projectId) return;
    return subscribePageLeave(() => {
      const pending = shouldSaveOnPageLeave({
        projectId: record.idRef.current,
        loading: projectLifecycleRef.current.loading,
        missing: Boolean(projectLifecycleRef.current.missing),
        navigatingBack: backNavigatingRef.current,
        syncStatus: workspaceSync.getState().status,
        hasLocalEdits: hasLocalEditsRef.current(),
      });
      if (pending) void saveWorkspaceNowRef.current();
    });
  }, [projectId, record, workspaceSync]);

  const overwriteBrowserStorage = async (): Promise<void> => {
    await saveWorkspaceNow();
    options.reportStatus(describeForceSaveOutcome(workspaceSync.getState().status, record.saveErrorRef.current));
  };

  return { saveWorkspaceNow, backToWorkbench, overwriteBrowserStorage };
}
