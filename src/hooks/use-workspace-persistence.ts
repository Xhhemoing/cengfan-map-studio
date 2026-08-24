import { useEffect, useRef, useState } from "react";
import { loadBrowserValue, loadInitialProject } from "../lib/app-initialization";
import { DRAFT_KEY, DRAFT_SAVED_AT_KEY, RENDER_SETTINGS_KEY } from "../lib/app-constants";
import { loadUserAssets, type UserAsset } from "../lib/assets";
import {
  createBrowserWorkspaceStores,
  loadBrowserWorkspaceMirror,
  loadLatestBrowserWorkspace,
  saveBrowserWorkspaceSnapshot,
} from "../lib/browser-workspace-store";
import type { EditorCommand } from "../lib/editor-commands";
import { editorProjectStore } from "../lib/editor-project-store";
import { loadUserFonts, type UserFont } from "../lib/fonts";
import {
  LocalWorkspaceOverwrite,
  type LocalWorkspaceOverwriteState,
} from "../lib/incremental-workspace-sync";
import { serializeProjectDocument, type ProjectDocument } from "../lib/project-document";
import { createProjectPackageEnvelope, restoreProjectPackage } from "../lib/project-package";
import {
  DEFAULT_RENDER_SETTINGS,
  normalizeRenderSettings,
  type RenderSettings,
} from "../lib/render-settings";
import { loadCustomTemplates, type CustomTemplateRecord } from "../lib/template-store";

/**
 * 工作区文档状态与本地持久化（localStorage 草稿 + 完整镜像 + IndexedDB 项目记录）。
 *
 * 拥有 project / assets / fonts / customTemplates / renderSettings 的状态与
 * 恢复（浏览器镜像、项目记录）、强制保存、离开页面兜底保存等副作用；
 * App 只负责把返回的状态和动作组合进界面。
 */
export function useWorkspacePersistence({ projectId }: { projectId?: string }) {
  const [browserStores] = useState(() => createBrowserWorkspaceStores());
  const [initialWorkspace] = useState(() => loadBrowserWorkspaceMirror(browserStores.mirror));
  const [project, setProject] = useState<ProjectDocument>(() => initialWorkspace?.project ?? loadInitialProject());
  const [previewCommands, setPreviewCommands] = useState<EditorCommand[]>([]);
  const [syncState, setSyncState] = useState<LocalWorkspaceOverwriteState>({
    status: initialWorkspace ? "saved" : "idle",
    savedAt: initialWorkspace?.exportedAt ?? null,
  });
  const [customTemplates, setCustomTemplates] = useState<CustomTemplateRecord[]>(() =>
    initialWorkspace?.customTemplates ?? (typeof window === "undefined" ? [] : loadBrowserValue(() => loadCustomTemplates(), [])),
  );
  const [statusMessage, setStatusMessage] = useState(initialWorkspace ? "已从本地完整镜像恢复工作区" : "仅在点击强制保存时写入本地");
  const [projectMissing, setProjectMissing] = useState(false);
  const [projectLoading, setProjectLoading] = useState(() => Boolean(projectId));
  // projectId 变更(如浏览器前进/后退直达另一项目)时,在渲染期同步重置加载/缺失状态,
  // 让加载壳在 get() 完成前一直显示,避免旧项目数据被编辑后误存到新项目记录。
  // 该 setState 位于渲染期(非 effect 内),是 React 文档认可的"根据先前渲染调整状态"模式。
  const [prevProjectId, setPrevProjectId] = useState(projectId);
  if (prevProjectId !== projectId) {
    setPrevProjectId(projectId);
    setProjectLoading(Boolean(projectId));
    setProjectMissing(false);
  }
  const [userFonts, setUserFonts] = useState<UserFont[]>(() =>
    initialWorkspace?.fonts ?? (typeof window === "undefined" ? [] : loadBrowserValue(() => loadUserFonts(), [])),
  );
  const [userAssets, setUserAssets] = useState<UserAsset[]>(() =>
    initialWorkspace?.assets ?? (typeof window === "undefined" ? [] : loadBrowserValue(() => loadUserAssets(), [])),
  );
  const [renderSettings, setRenderSettings] = useState<RenderSettings>(() => {
    if (initialWorkspace) return initialWorkspace.renderSettings;
    if (typeof window === "undefined") return { ...DEFAULT_RENDER_SETTINGS };
    try {
      return normalizeRenderSettings(JSON.parse(window.localStorage.getItem(RENDER_SETTINGS_KEY) ?? "null"));
    } catch {
      return { ...DEFAULT_RENDER_SETTINGS };
    }
  });

  const projectIdRef = useRef<string | null>(projectId ?? null);
  const projectNameRef = useRef<string | null>(null);
  const projectCreatedAtRef = useRef<string>(new Date(0).toISOString());
  const projectRecordSaveErrorRef = useRef<string | null>(null);
  const backNavigatingRef = useRef(false);
  const hasLocalWorkspaceEditsRef = useRef(false);
  // saveLocal 只在事件处理器(强制保存按钮)经 LocalWorkspaceOverwrite.drain() 触发,属于渲染期之后;
  // 此处 ref 读取发生在保存时刻而非渲染期,react-hooks/refs 无法穿透类间接层,故按行豁免。
  // eslint-disable-next-line react-hooks/refs
  const [workspaceSync] = useState(() => new LocalWorkspaceOverwrite({
    saveLocal: async (pack) => {
      try {
        localStorage.setItem(DRAFT_KEY, serializeProjectDocument(pack.project));
        localStorage.setItem(DRAFT_SAVED_AT_KEY, pack.exportedAt);
      } catch {
        // The complete mirror or IndexedDB copy can still preserve the workspace.
      }
      const result = await saveBrowserWorkspaceSnapshot(pack, browserStores);
      if (result.durable === "failed" && result.mirror === "failed") {
        projectRecordSaveErrorRef.current = null; // put 分支不会执行,清空旧错误,避免 overwriteBrowserStorage 误报"本地已保存"
        throw new Error("浏览器本地存储不可写");
      }
      if (projectIdRef.current) {
        try {
          await editorProjectStore.put({
            id: projectIdRef.current,
            name: projectNameRef.current ?? "未命名项目",
            createdAt: projectCreatedAtRef.current,
            updatedAt: new Date().toISOString(),
            pack,
          });
          projectRecordSaveErrorRef.current = null;
        } catch (error) {
          projectRecordSaveErrorRef.current = error instanceof Error ? error.message : String(error);
          throw new Error("项目记录写入失败", { cause: error });
        }
      }
    },
    onStateChange: setSyncState,
  }));
  const latestWorkspaceRef = useRef({ project, assets: userAssets, fonts: userFonts, customTemplates, renderSettings });
  const workspaceStateInitializedRef = useRef(false);
  const workspaceHydratedRef = useRef(false);
  const skipNextWorkspacePendingRef = useRef(false);

  useEffect(() => {
    latestWorkspaceRef.current = { project, assets: userAssets, fonts: userFonts, customTemplates, renderSettings };
    if (!workspaceStateInitializedRef.current) {
      workspaceStateInitializedRef.current = true;
      return;
    }
    if (skipNextWorkspacePendingRef.current) {
      skipNextWorkspacePendingRef.current = false;
      return;
    }
    if (!workspaceHydratedRef.current) hasLocalWorkspaceEditsRef.current = true;
    workspaceSync.markPending();
  }, [customTemplates, project, renderSettings, userAssets, userFonts, workspaceSync]);

  useEffect(() => {
    if (projectId) return; // 项目模式以 IndexedDB 中的项目为准,不覆盖浏览器本地镜像
    let cancelled = false;
    void loadLatestBrowserWorkspace(browserStores).then((pack) => {
      if (cancelled || !pack || hasLocalWorkspaceEditsRef.current) return;
      const initialTime = Date.parse(initialWorkspace?.exportedAt ?? "");
      const restoredTime = Date.parse(pack.exportedAt);
      if (initialWorkspace && (!Number.isFinite(restoredTime) || restoredTime <= initialTime)) return;
      const restored = restoreProjectPackage(pack);
      workspaceHydratedRef.current = true;
      skipNextWorkspacePendingRef.current = true;
      setProject(restored.project);
      setUserAssets(restored.assets);
      setUserFonts(restored.fonts);
      setCustomTemplates(restored.customTemplates);
      setRenderSettings(restored.renderSettings);
      setPreviewCommands([]);
      setSyncState({ status: "saved", savedAt: pack.exportedAt });
      setStatusMessage("已从浏览器本地完整工作区恢复");
    }).catch(() => undefined).finally(() => {
      workspaceHydratedRef.current = true;
    });
    return () => { cancelled = true; };
  }, [browserStores, initialWorkspace, projectId]);

  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;
    projectIdRef.current = projectId;
    void editorProjectStore.get(projectId).then((record) => {
      if (cancelled) return;
      // 渲染期已重置缺失状态;此处仅收尾加载状态(渲染期 setState 也会在加载完成前触发重渲染)。
      setProjectMissing(false);
      setProjectLoading(false);
      if (!record) {
        setProjectMissing(true);
        return;
      }
      const restored = restoreProjectPackage(record.pack);
      projectNameRef.current = record.name;
      projectCreatedAtRef.current = record.createdAt;
      workspaceHydratedRef.current = true;
      skipNextWorkspacePendingRef.current = true;
      setProject(restored.project);
      setUserAssets(restored.assets);
      setUserFonts(restored.fonts);
      setCustomTemplates(restored.customTemplates);
      setRenderSettings(restored.renderSettings);
      setPreviewCommands([]);
      setStatusMessage(`已打开项目「${record.name}」`);
    }).catch(() => {
      if (cancelled) return;
      setProjectMissing(true);
      setProjectLoading(false);
    });
    return () => { cancelled = true; };
  }, [projectId]);

  const saveWorkspaceNow = async (): Promise<void> => {
    const pack = createProjectPackageEnvelope(latestWorkspaceRef.current);
    await workspaceSync.overwrite(pack);
  };

  // 项目模式下离开页面(切换/关闭标签)的自动保存采用 latest-ref 模式:
  // ref 在每次渲染后的 effect 中同步(lint 禁止渲染期写 ref),初始值即真实保存管线,
  // 覆盖首帧事件窗口;projectLifecycleRef 同样在 effect 中同步加载/缺失状态。
  const saveWorkspaceNowRef = useRef<() => Promise<void>>(saveWorkspaceNow);
  const projectLifecycleRef = useRef({ loading: projectLoading, missing: projectMissing });
  useEffect(() => {
    saveWorkspaceNowRef.current = saveWorkspaceNow;
    projectLifecycleRef.current = { loading: projectLoading, missing: projectMissing };
  });

  const handleBackToWorkbench = async () => {
    if (backNavigatingRef.current) return;
    backNavigatingRef.current = true;
    if (projectIdRef.current && !projectLoading && !projectMissing) {
      await saveWorkspaceNow();
    }
    window.location.hash = "#/";
  };

  // 仅项目模式注册:visibilitychange/pagehide 时若存在未保存编辑,尽力保存到
  // 本地草稿镜像(localStorage,同步落盘)+ IndexedDB 项目记录。
  useEffect(() => {
    if (!projectId) return;
    const handlePageLeave = () => {
      if (!projectIdRef.current || projectLifecycleRef.current.loading || projectLifecycleRef.current.missing || backNavigatingRef.current) return;
      const state = workspaceSync.getState();
      if (state.status === "pending" || hasLocalWorkspaceEditsRef.current) {
        void saveWorkspaceNowRef.current();
      }
    };
    window.addEventListener("visibilitychange", handlePageLeave);
    window.addEventListener("pagehide", handlePageLeave);
    return () => {
      window.removeEventListener("visibilitychange", handlePageLeave);
      window.removeEventListener("pagehide", handlePageLeave);
    };
  }, [projectId, workspaceSync]);

  const overwriteBrowserStorage = async () => {
    await saveWorkspaceNow();
    const result = workspaceSync.getState();
    if (result.status === "saved") {
      setStatusMessage("强制保存完成：全部数据已覆盖到浏览器本地");
    } else if (projectRecordSaveErrorRef.current) {
      setStatusMessage(`浏览器本地已保存，但项目记录写入失败（${projectRecordSaveErrorRef.current}）。请导出工程包备份，否则项目列表不会更新。`);
    } else {
      setStatusMessage("强制保存失败：浏览器本地存储不可写，请立即导出工程包");
    }
  };

  return {
    project,
    setProject,
    previewCommands,
    setPreviewCommands,
    userAssets,
    setUserAssets,
    userFonts,
    setUserFonts,
    customTemplates,
    setCustomTemplates,
    renderSettings,
    setRenderSettings,
    syncState,
    statusMessage,
    setStatusMessage,
    projectLoading,
    projectMissing,
    workspaceSync,
    latestWorkspaceRef,
    saveWorkspaceNow,
    overwriteBrowserStorage,
    handleBackToWorkbench,
  };
}
