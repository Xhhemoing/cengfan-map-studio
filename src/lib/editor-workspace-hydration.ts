/**
 * 工作区水合与「有没有未保存改动」的记账。
 *
 * 三件事绑在同一组 ref 上,所以一起搬出 App:
 * 1. 每次工作区状态变化都把最新一份记到 ref 上,并按需要把同步状态标成 pending;
 * 2. 公开编辑器从浏览器本地读回最完整的一份工作区;
 * 3. 项目模式按 id 打开 IndexedDB 里的项目记录。
 *
 * 水合写回来的那一次不能算成用户编辑,否则「离开页面要不要保存」会永远为真——
 * `skipNextPending` 与 `hydrated` 两个标记就是为此存在的。
 */
import { useEffect, useRef, type MutableRefObject } from "react";
import type { BrowserWorkspaceStores } from "./browser-workspace-store";
import {
  loadAdoptableWorkspace,
  loadStoredProject,
  type EditorProjectRecordRefs,
} from "./editor-workspace-persistence";
import {
  applyWorkspacePackage,
  type EditorWorkspaceSetters,
  type EditorWorkspaceSnapshot,
} from "./editor-workspace-state";
import type { LocalWorkspaceOverwrite, LocalWorkspaceOverwriteState } from "./incremental-workspace-sync";
import type { MissingProjectObservation } from "./missing-project-notice";
import { restoreProjectPackage, type ProjectPackage } from "./project-package";
import type { ProjectStore } from "./project-store";

/** 水合结果要落到的全部编辑器状态入口。 */
export interface WorkspaceHydrationSink extends EditorWorkspaceSetters {
  setSyncState(state: LocalWorkspaceOverwriteState): void;
  setProjectMissing(observation: MissingProjectObservation | null): void;
  setProjectLoading(loading: boolean): void;
  reportStatus(message: string): void;
}

export interface EditorWorkspaceHydrationOptions extends EditorWorkspaceSnapshot {
  /** 路由带进来的项目 id;没有就是公开编辑器,以浏览器本地镜像为准。 */
  projectId: string | undefined;
  browserStores: BrowserWorkspaceStores;
  /** 首帧同步读到的镜像时间戳,用来判断异步读回来的那份值不值得采纳。 */
  initialExportedAt: string | undefined;
  projectStore: ProjectStore;
  record: EditorProjectRecordRefs;
  workspaceSync: LocalWorkspaceOverwrite;
  sink: WorkspaceHydrationSink;
}

export interface EditorWorkspaceHydration {
  /** 最近一次渲染出去的完整工作区,供保存与协作在渲染期之外取用。 */
  readWorkspace(): EditorWorkspaceSnapshot;
  /** 水合之后用户是否真的改过东西。 */
  hasLocalEdits(): boolean;
}

/**
 * 把一份已还原的工程包铺到编辑器上,并把它标成「不是用户编辑」。
 * 写成模块级函数,水合的两条路径就不必各自复制这两行标记。
 */
function adoptWorkspace(
  hydratedRef: MutableRefObject<boolean>,
  skipNextPendingRef: MutableRefObject<boolean>,
  sink: EditorWorkspaceSetters,
  restored: ProjectPackage,
): void {
  hydratedRef.current = true;
  skipNextPendingRef.current = true;
  applyWorkspacePackage(sink, restored);
}

export function useEditorWorkspaceHydration(
  options: EditorWorkspaceHydrationOptions,
): EditorWorkspaceHydration {
  const {
    project,
    assets,
    fonts,
    customTemplates,
    renderSettings,
    projectId,
    browserStores,
    initialExportedAt,
    projectStore,
    workspaceSync,
  } = options;
  // 项目身份的三个 ref 由 useEditorProjectRecord 持有,这里只往里写值。先解构成局部 ref,
  // 写的就是 ref 本身而不是「调用方传进来的那个对象」——后者是 react-hooks/immutability 明令
  // 禁止的改法。
  const { idRef: projectIdRef, nameRef: projectNameRef, createdAtRef: projectCreatedAtRef } = options.record;

  const latestWorkspaceRef = useRef<EditorWorkspaceSnapshot>({
    project,
    assets,
    fonts,
    customTemplates,
    renderSettings,
  });
  const initializedRef = useRef(false);
  const hydratedRef = useRef(false);
  const skipNextPendingRef = useRef(false);
  const hasLocalEditsRef = useRef(false);

  // 异步读回来的工作区要铺到最新一次渲染的 setter 上,采用 latest-ref 模式:
  // ref 在每次渲染后的 effect 中同步(lint 禁止渲染期写 ref),且这一条必须先于下面两个
  // 加载 effect 声明——effect 按声明顺序执行,首帧的回调才不会读到过期的 sink。
  const sinkRef = useRef(options.sink);
  useEffect(() => {
    sinkRef.current = options.sink;
  });

  useEffect(() => {
    latestWorkspaceRef.current = { project, assets, fonts, customTemplates, renderSettings };
    if (!initializedRef.current) {
      initializedRef.current = true;
      return;
    }
    if (skipNextPendingRef.current) {
      skipNextPendingRef.current = false;
      return;
    }
    if (!hydratedRef.current) hasLocalEditsRef.current = true;
    workspaceSync.markPending();
  }, [customTemplates, project, renderSettings, assets, fonts, workspaceSync]);

  useEffect(() => {
    if (projectId) return; // 项目模式以 IndexedDB 中的项目为准,不覆盖浏览器本地镜像
    let cancelled = false;
    void loadAdoptableWorkspace({
      stores: browserStores,
      initialExportedAt,
      hasLocalEdits: () => hasLocalEditsRef.current,
    }).then((pack) => {
      if (cancelled || !pack) return;
      const sink = sinkRef.current;
      adoptWorkspace(hydratedRef, skipNextPendingRef, sink, restoreProjectPackage(pack));
      sink.setSyncState({ status: "saved", savedAt: pack.exportedAt });
      sink.reportStatus("已从浏览器本地完整工作区恢复");
    }).catch(() => undefined).finally(() => {
      hydratedRef.current = true;
    });
    return () => { cancelled = true; };
  }, [browserStores, initialExportedAt, projectId]);

  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;
    projectIdRef.current = projectId;
    void loadStoredProject(projectStore, projectId).then((outcome) => {
      if (cancelled) return;
      const sink = sinkRef.current;
      // 渲染期已重置缺失状态;此处仅收尾加载状态(渲染期 setState 也会在加载完成前触发重渲染)。
      sink.setProjectMissing(null);
      sink.setProjectLoading(false);
      if (outcome.status === "missing") {
        sink.setProjectMissing(outcome.observation);
        return;
      }
      projectNameRef.current = outcome.record.name;
      projectCreatedAtRef.current = outcome.record.createdAt;
      adoptWorkspace(hydratedRef, skipNextPendingRef, sink, outcome.restored);
      sink.reportStatus(`已打开项目「${outcome.record.name}」`);
    });
    return () => { cancelled = true; };
  }, [projectId, projectStore, projectIdRef, projectNameRef, projectCreatedAtRef]);

  return {
    readWorkspace: () => latestWorkspaceRef.current,
    hasLocalEdits: () => hasLocalEditsRef.current,
  };
}
