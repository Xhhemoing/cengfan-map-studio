import {
  ArrowLeft,
  Bot,
  Download,
  ImageDown,
  MapPinned,
  PanelRight,
  PanelRightClose,
  Plus,
  Redo2,
  Save,
  Undo2,
  PackageOpen,
  RefreshCw,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { createNoteElement, createTextElement } from "./lib/canvas-data";
import { CHINA_PROVINCE_ADJACENCY } from "./lib/map-data";
import {
  DRAFT_KEY,
  ROOM_ACCESS_STORAGE_PREFIX,
  COLLABORATION_DISPLAY_NAME,
  DRAFT_SAVED_AT_KEY,
  RENDER_SETTINGS_KEY,
  COLLABORATION_SEND_DELAY_MS,
  provinceNames,
  dataViews,
  type ActivePanel,
} from "./lib/app-constants";
import {
  buildProvinceSummary,
  sampleStudents,
  type DataViewId,
  type MapTemplateId,
} from "./lib/project-data";
import { createId } from "./lib/ids";
import { editorProjectStore } from "./lib/editor-project-store";

import { AssistantConversationProvider } from "./components/AgentAssistant";
import { ProjectMenu } from "./components/ProjectMenu";
import { StudioTopbar } from "./components/StudioTopbar";
import { StudioLeftRail } from "./components/StudioLeftRail";
import { StudioEditorShell } from "./components/StudioEditorShell";
import { StudioAssistantDrawer } from "./components/StudioAssistantDrawer";
import { StudioAssistantRail } from "./components/StudioAssistantRail";

import { AssetPanel } from "./components/AssetPanel";
import { DataWorkspace } from "./components/DataWorkspace";
import "./components/workflow-workspaces.css";
import { GlobalSettingsScreen, type GlobalSettingsSection } from "./components/GlobalSettingsScreen";
import { TemplateCatalogRail, TemplateWorkspace, type TemplateSelection } from "./components/workspaces/TemplateWorkspace";
import { DataUploadRail, DataUploadWorkspace } from "./components/workspaces/DataUploadWorkspace";
import { MapStyleRail, MapStyleWorkspace } from "./components/workspaces/MapStyleWorkspace";
import { DisplayFrameRail, DisplayFrameWorkspace } from "./components/workspaces/DisplayFrameWorkspace";
import { ContentLayoutRail, ContentLayoutWorkspace, type ContentAssetPanelProps } from "./components/workspaces/ContentLayoutWorkspace";
import { DeliveryRail, DeliveryWorkspace, type DeliveryExportState, type DeliveryIssue } from "./components/workspaces/DeliveryWorkspace";

import { ActionGroup, CompactButton, SegmentedControl, ToolbarButton, ToolbarGroup } from "./components/StudioUi";
import { WorkflowStepper, type WorkflowPanelId } from "./components/WorkflowStepper";
import { WorkflowStageStepper } from "./components/WorkflowStageStepper";
import {
  LEGACY_PANEL_TO_WORKFLOW_STAGE,
  WORKFLOW_STAGE_TO_LEGACY_PANEL,
  type WorkflowStageId,
} from "./lib/workflow-stages";
import { LEGACY_EDITOR_STORAGE_KEY, loadWorkspaceSession, saveWorkspaceSession } from "./lib/workspace-session";
import { resolveDeliveryIssueLocation } from "./lib/delivery-target";
import { ThemeToggle } from "./components/ThemeToggle";
import { SkinSelector } from "./components/SkinSelector";
import { ResizablePanelDivider } from "./components/ResizablePanelDivider";
import { buildDataHealthSummary, listDataIssues } from "./lib/data-health";
import { computeWorkflowProgress, listStudentWarnings, type WorkflowStepId } from "./lib/workflow-progress";
import {
  previewEditorCommands,
  type EditorCommand,
} from "./lib/editor-commands";
import {
  applyTransaction,
  createProjectDocument,
  redoTransaction,
  restoreProjectDocument,
  serializeProjectDocument,
  undoTransaction,
  type ProjectDocument,
  type ProjectTransaction,
} from "./lib/project-document";
import {
  applyDataViewChange,
  findAssetUsage,

  isAssetInUse,

  removeUserAsset,
  removeUserFont,
  STYLE_LAYER_TARGETS,
} from "./lib/catalog-usage";

import { createSystemTemplate, mergeTemplateDocuments } from "./lib/template-document";
import {
  applyCustomTemplateToProject,
  createCustomTemplateFromProject,
  loadCustomTemplates,
  type CustomTemplateRecord,
} from "./lib/template-store";
import {
  downloadDataUrl,
  downloadText,
  serializePosterSvg,
  svgToPngDataUrl,
} from "./lib/export-poster";
import {
  createDecorationElement,
  createLandmarkElement,
  duplicateAssetElement,
} from "./lib/asset-elements";
import { PosterCanvas } from "./components/canvas/PosterCanvas";
import { createDefaultScene, type ProvinceAppearance, type SceneSelection } from "./lib/scene-document";
import { deriveFixedDisplayFrameFromCardSettings, normalizeDisplayFrame } from "./lib/display-frame";
import { createProvinceThemeTransaction, createSceneTransaction, deleteAsset, deleteText } from "./lib/inspector-operations";
import { InspectorPanel } from "./components/inspector/InspectorPanel";
import { MapInspector } from "./components/inspector/MapInspector";
import {
  buildFontFaceCss,
  ensureUserFontsLoaded,
  loadUserFonts,
  type UserFont,
} from "./lib/fonts";
import {
  loadUserAssets,
  type StudioAsset,
  type UserAsset,
} from "./lib/assets";
import {
  createResourcePack,
  downloadResourcePack,
  mergeResourcePack,
  parseResourcePack,
} from "./lib/resource-pack";
import {
  createProjectPackage,
  createProjectPackageEnvelope,
  downloadProjectPackage,
  parseProjectPackage,
  restoreProjectPackage,
  type ProjectPackage,
} from "./lib/project-package";
import { applyTypographyFont, type TypographyTarget } from "./lib/typography";
import type { ImageThemeResult } from "./lib/image-color";
import {
  loadStudioSkin,
  loadThemeMode,
  resolveTheme,
  saveStudioSkin,
  saveThemeMode,
  type ThemeMode,
} from "./lib/theme";
import {
  getPanelWidthBounds,
  normalizeEditorPanelLayout,
  readEditorPanelLayout,
  writeEditorPanelLayout,
  type EditorPanelLayout,
  type PanelSide,
} from "./lib/editor-layout";
import { checkLayoutHealth } from "./lib/layout-health";
import { listResourceHealthIssues } from "./lib/resource-health";

import {
  DEFAULT_GRID_SIZE,
  fitZoomPercent,
  snapPoint,
} from "./lib/grid";
import {
  DEFAULT_RENDER_SETTINGS,
  normalizeRenderSettings,
  renderIntervalMs,
  type RenderSettings,
} from "./lib/render-settings";
import {
  createBrowserWorkspaceStores,
  loadBrowserWorkspaceMirror,
  loadLatestBrowserWorkspace,
  saveBrowserWorkspaceSnapshot,
} from "./lib/browser-workspace-store";
import {
  LocalWorkspaceOverwrite,
  type LocalWorkspaceOverwriteState,
} from "./lib/incremental-workspace-sync";
import {
  CollaborationClientError,
  createRoom,
  createRoomInvitation,
  fetchRoom,
  fetchRoomOperations,
  joinRoom,
  leaveRoom,
  retryInitializingRoom,
  setRoomAccess,
  submitRoomOperations,
  submitRoomSnapshot,
  subscribeRoom,
  type CollaborationRole,
  type CollaborationRoom,
  type RoomAccessAction,
  type RoomMember,
  type RoomParticipant,
} from "./lib/collaboration-client";
import { applyCollaborationOperations, diffCollaborationDocument, rebaseRemoteCollaborationOperations } from "./lib/collaboration-operations";

function createInitialProject(): ProjectDocument {
  return createProjectDocument({
    students: sampleStudents,
    templateId: "original",
    dataView: "province",
    textElements: [
      {
        id: "text-wish",
        content: "山高水长，来日再聚",
        x: 745,
        y: 905,
        fontSize: 20,
        color: "#c85d4b",
      },
    ],
  });
}

function loadInitialProject(): ProjectDocument {
  if (typeof window === "undefined") return createInitialProject();
  try {
    const raw = window.localStorage.getItem(DRAFT_KEY);
    if (!raw) return createInitialProject();
    const restored = restoreProjectDocument(raw);
    if (restored.students.length === 0) restored.students = sampleStudents;
    return restored;
  } catch {
    return createInitialProject();
  }
}

function loadBrowserValue<T>(load: () => T, fallback: T): T {
  try {
    return load();
  } catch {
    return fallback;
  }
}

function WorkbenchBackButton({ onClick = () => { window.location.hash = "#/"; } }: { onClick?: () => void }) {
  return (
    <button type="button" className="secondary-button" aria-label="返回项目列表" onClick={onClick}>
      <ArrowLeft size={16} /> 返回列表
    </button>
  );
}

function StudioApp({ projectId }: { projectId?: string }) {
  const [browserStores] = useState(() => createBrowserWorkspaceStores());
  const [initialWorkspace] = useState(() => loadBrowserWorkspaceMirror(browserStores.mirror));
  const [project, setProject] = useState<ProjectDocument>(() => initialWorkspace?.project ?? loadInitialProject());
  const [previewCommands, setPreviewCommands] = useState<EditorCommand[]>([]);
  const [agentPreview, setAgentPreview] = useState<ProjectDocument | null>(null);
  const [workspaceSession] = useState(() => typeof window === "undefined"
    ? loadWorkspaceSession(null)
    : loadBrowserValue(() => loadWorkspaceSession(window.localStorage), loadWorkspaceSession(null)));
  const [selection, setSelection] = useState<SceneSelection>(() => {
    if (workspaceSession.selectedProvince) return { type: "province", province: workspaceSession.selectedProvince };
    if (workspaceSession.selectedObject === "cards") return { type: "cards" };
    if (workspaceSession.selectedObject === "guests") return { type: "guests" };
    if (workspaceSession.selectedObject) return { type: "asset", id: workspaceSession.selectedObject };
    return { type: "text", id: "text-note" };
  });
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  const [syncState, setSyncState] = useState<LocalWorkspaceOverwriteState>({
    status: initialWorkspace ? "saved" : "idle",
    savedAt: initialWorkspace?.exportedAt ?? null,
  });
  const [exportingPng, setExportingPng] = useState(false);
  const [exportState, setExportState] = useState<DeliveryExportState>("idle");
  const [exportError, setExportError] = useState<string>();
  const lastExportRef = useRef<"png" | "svg" | "project">("png");
  const [pngScale, setPngScale] = useState(1);
  const [transparentExport, setTransparentExport] = useState(false);
  const [showProjectExportDialog, setShowProjectExportDialog] = useState(false);


  const [includeResourcesInProjectExport, setIncludeResourcesInProjectExport] = useState(true);
  const [customTemplates, setCustomTemplates] = useState<CustomTemplateRecord[]>(() =>
    initialWorkspace?.customTemplates ?? (typeof window === "undefined" ? [] : loadBrowserValue(() => loadCustomTemplates(), [])),
  );
  const [templateSelection, setTemplateSelection] = useState<TemplateSelection | null>(null);
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
  const [showGrid] = useState(false);
  const [gridSize] = useState(DEFAULT_GRID_SIZE);
  const [renderSettings, setRenderSettings] = useState<RenderSettings>(() => {
    if (initialWorkspace) return initialWorkspace.renderSettings;
    if (typeof window === "undefined") return { ...DEFAULT_RENDER_SETTINGS };
    try {
      return normalizeRenderSettings(JSON.parse(window.localStorage.getItem(RENDER_SETTINGS_KEY) ?? "null"));
    } catch {
      return { ...DEFAULT_RENDER_SETTINGS };
    }
  });
  const [zoomPercent, setZoomPercent] = useState(100);
  const [collaborationOpen, setCollaborationOpen] = useState(false);
  const [roomInput, setRoomInput] = useState("");
  const [inviteTokenInput, setInviteTokenInput] = useState("");
  const [roomId, setRoomId] = useState<string | null>(null);
  const [roomAccessToken, setRoomAccessToken] = useState<string | null>(null);
  const [roomRole, setRoomRole] = useState<CollaborationRole | null>(null);
  const [roomParticipants, setRoomParticipants] = useState<RoomParticipant[]>([]);
  const [roomMembers, setRoomMembers] = useState<RoomMember[]>([]);
  const [roomReadonly, setRoomReadonly] = useState(false);
  const [roomClosed, setRoomClosed] = useState(false);
  const [invitationToken, setInvitationToken] = useState<string | null>(null);
  const [roomVersion, setRoomVersion] = useState(0);
  const [collaborationStatus, setCollaborationStatus] = useState<"idle" | "connecting" | "connected" | "syncing" | "conflict" | "error" | "closed">("idle");
  const [collaborationMessage, setCollaborationMessage] = useState("未连接时不会上传或覆盖工程");
  const [collaborationClientId] = useState(() => createId("collab-client"));
  const hasStoredRoomAccess = Boolean(roomInput.trim() && loadBrowserValue(
    () => window.localStorage.getItem(`${ROOM_ACCESS_STORAGE_PREFIX}${roomInput.trim().toUpperCase()}`),
    null,
  ));

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
  const collaborationBaselineRef = useRef<ProjectPackage | null>(null);
  const collaborationVersionRef = useRef(0);
  const collaborationRoomRef = useRef<string | null>(null);
  const collaborationAccessTokenRef = useRef<string | null>(null);
  const suppressCollaborationSendRef = useRef(false);
  const backfillInFlightRef = useRef(false);
  const receiveRoomUpdateRef = useRef<(room: CollaborationRoom<ProjectPackage>) => void>(() => undefined);


  const posterRef = useRef<SVGSVGElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [activePanel, setActivePanel] = useState<ActivePanel>(() => WORKFLOW_STAGE_TO_LEGACY_PANEL[workspaceSession.stage] ?? "roster");
  const [legacyEditorEnabled] = useState(() => typeof window !== "undefined"
    && loadBrowserValue(() => window.localStorage.getItem(LEGACY_EDITOR_STORAGE_KEY) === "1", false));
  const [activeStage, setActiveStage] = useState<WorkflowStageId>(() => legacyEditorEnabled ? "content" : workspaceSession.stage);
  const lastNonTemplateStageRef = useRef<WorkflowStageId>(activeStage === "template" || activeStage === "data" ? "content" : activeStage);
  const [assistantDrawerOpen, setAssistantDrawerOpen] = useState(false);
  const assistantEntryRef = useRef<HTMLButtonElement>(null);
  const [mobileInspectorOpen, setMobileInspectorOpen] = useState(false);
  const [activeWorkflowStep, setActiveWorkflowStep] = useState<WorkflowStepId>("roster");
  const [globalSettingsSection, setGlobalSettingsSection] = useState<GlobalSettingsSection | null>(null);
  const [themeMode, setThemeMode] = useState<ThemeMode>(() => typeof window === "undefined" ? "system" : loadThemeMode());
  const [skin, setSkin] = useState(() => typeof window === "undefined" ? "atelier" : loadStudioSkin());
  const [prefersDark, setPrefersDark] = useState(() => typeof window !== "undefined" && window.matchMedia?.("(prefers-color-scheme: dark)").matches === true);
  const [panelLayout, setPanelLayout] = useState<EditorPanelLayout>(() => readEditorPanelLayout());
  const [resizingPanel, setResizingPanel] = useState<PanelSide | null>(null);

  const resolvedRenderInterval = renderIntervalMs(renderSettings);
  const workflowProgress = useMemo(() => computeWorkflowProgress(project), [project]);
  useEffect(() => {
    if (typeof window === "undefined") return;
    const storage = loadBrowserValue(() => window.localStorage, null);
    if (!storage) return;
    const selectedProvince = selection.type === "province" ? selection.province : undefined;
    const selectedObject = selection.type === "asset" ? selection.id : selection.type === "cards" || selection.type === "guests" ? selection.type : undefined;
    const { selectedProvince: _savedProvince, selectedObject: _savedObject, ...sessionBase } = workspaceSession;
    saveWorkspaceSession(storage, {
      ...sessionBase,
      stage: activeStage,
      ...(selectedProvince ? { selectedProvince } : {}),
      ...(selectedObject ? { selectedObject } : {}),
      savedAt: new Date().toISOString(),
    });
  }, [activeStage, selection, workspaceSession]);
  const dataHealth = useMemo(() => buildDataHealthSummary(project), [project]);
  const dataIssues = useMemo(() => listDataIssues(project), [project]);
  const exportWarnings = useMemo(() => listStudentWarnings(project), [project]);
  const resourceHealthIssues = useMemo(
    () => listResourceHealthIssues(project, userAssets, userFonts),
    [project, userAssets, userFonts],
  );
  const resolvedTheme = resolveTheme(themeMode, prefersDark);
  const viewportWidth = typeof window === "undefined" ? 1440 : window.innerWidth;
  const sidebarBounds = getPanelWidthBounds("sidebar", viewportWidth, panelLayout.inspectorWidth);
  const inspectorBounds = getPanelWidthBounds("inspector", viewportWidth, panelLayout.sidebarWidth);
  const workspaceStyle = {
    "--sidebar-width": `${panelLayout.sidebarWidth}px`,
    "--inspector-width": `${panelLayout.inspectorWidth}px`,
  } as CSSProperties;
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => setPrefersDark(media.matches);
    media.addEventListener?.("change", onChange);
    return () => media.removeEventListener?.("change", onChange);
  }, []);

  useEffect(() => {
    saveThemeMode(themeMode);
  }, [themeMode]);

  useEffect(() => {
    saveStudioSkin(skin);
  }, [skin]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    const root = document.documentElement;
    root.dataset.editorTheme = resolvedTheme;
    root.dataset.editorSkin = skin;
    root.style.colorScheme = resolvedTheme === "dark" ? "dark" : "light";
  }, [resolvedTheme, skin]);

  useEffect(() => {
    try {
      writeEditorPanelLayout(window.localStorage, panelLayout, window.innerWidth);
    } catch {
      // Panel sizing remains usable when browser storage is unavailable.
    }
  }, [panelLayout]);

  useEffect(() => {
    const onResize = () => {
      setPanelLayout((current) => normalizeEditorPanelLayout(current, window.innerWidth));
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  const updatePanelWidth = (side: PanelSide, value: number) => {
    setPanelLayout((current) => normalizeEditorPanelLayout({
      ...current,
      [side === "sidebar" ? "sidebarWidth" : "inspectorWidth"]: value,
    }, viewportWidth));
  };

  useEffect(() => {
    if (typeof document === "undefined") return;
    const styleId = "cengfan-user-fonts";
    let style = document.getElementById(styleId) as HTMLStyleElement | null;
    if (!style) {
      style = document.createElement("style");
      style.id = styleId;
      document.head.appendChild(style);
    }
    style.textContent = buildFontFaceCss(userFonts);
  }, [userFonts]);

  useEffect(() => {
    void ensureUserFontsLoaded(userFonts);
  }, [userFonts]);

  const renderProject = useMemo(() => {
    if (agentPreview) return agentPreview;
    if (previewCommands.length === 0) return project;
    try {
      return previewEditorCommands(project, previewCommands);
    } catch {
      return project;
    }
  }, [agentPreview, project, previewCommands]);

  const template = renderProject.templateId;
  const dataView = renderProject.dataView;
  const students = renderProject.students;

  const style = renderProject.style;
  const selectedTextId = selection.type === "text" ? selection.id : null;
  const summary = buildProvinceSummary(students);
  const resolvedTemplate = useMemo(() => {
    const base = createSystemTemplate(template);
    return mergeTemplateDocuments(base, {
      background: {
        ...base.background,
        color: renderProject.canvas.backgroundColor || base.background.color,
        imageSrc: renderProject.canvas.backgroundImageSrc,
        type: renderProject.canvas.backgroundImageSrc ? "image" : "color",
      },
      map: {
        ...base.map,
        scale: renderProject.map.scale,
        edgeColor: renderProject.map.edgeColor,
        edgeStyle: renderProject.map.edgeStyle ?? "solid",
        edgeWidth: renderProject.map.edgeWidth ?? 1,
        landColor: renderProject.map.landColor,
        activeColor: renderProject.map.activeColor,
        showProvinceLabels: renderProject.map.showProvinceLabels,
        provinceStyles: renderProject.map.provinceStyles ?? {},
      },
      cards: {
        ...base.cards,
        preset: renderProject.cards.preset,
      },
      visibleFields: renderProject.cards.visibleFields,
      regionalAssets: style.regionalAssets,
    });
  }, [renderProject, style, template]);

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

  const currentCollaborationPackage = (exportedAt = new Date().toISOString()): ProjectPackage => {
    const pack = createProjectPackageEnvelope(latestWorkspaceRef.current);
    return { ...pack, exportedAt, project: { ...pack.project, history: { past: [], future: [] } } };
  };

  const applySharedPackage = (pack: ProjectPackage, version: number) => {
    const restored = restoreProjectPackage(pack);
    suppressCollaborationSendRef.current = true;
    collaborationBaselineRef.current = restored;
    collaborationVersionRef.current = version;
    setRoomVersion(version);
    setProject((current) => ({ ...restored.project, history: current.history, version: current.version + 1 }));
    setUserAssets(restored.assets);
    setUserFonts(restored.fonts);
    setCustomTemplates(restored.customTemplates);
    setRenderSettings(restored.renderSettings);
    setPreviewCommands([]);
    workspaceSync.markPending();
  };

  const receiveRoomUpdate = (room: CollaborationRoom<ProjectPackage>) => {
    if (room.members) setRoomMembers(room.members);
    if (room.readonly !== undefined) setRoomReadonly(room.readonly);
    if (room.closed) {
      setRoomClosed(true);
      setCollaborationStatus("closed");
      setCollaborationMessage("房间已关闭，无法继续同步或编辑");
    }
    if (room.version <= collaborationVersionRef.current) return;
    if (room.operations && collaborationBaselineRef.current) {
      const current = currentCollaborationPackage(collaborationBaselineRef.current.exportedAt);
      const rebased = rebaseRemoteCollaborationOperations(collaborationBaselineRef.current, current, room.operations);
      collaborationBaselineRef.current = rebased.baseline;
      applySharedPackage(rebased.current, room.version);
      collaborationBaselineRef.current = rebased.baseline;
    } else if (room.snapshot) {
      applySharedPackage(room.snapshot, room.version);
    } else {
      collaborationVersionRef.current = room.version;
      setRoomVersion(room.version);
    }
    setCollaborationStatus("connected");
    setCollaborationMessage(room.rebasedFromVersion === undefined ? "增量同步已完成" : "已自动合并互不冲突的并发修改");
  };

  useEffect(() => {
    receiveRoomUpdateRef.current = receiveRoomUpdate;
  });

  useEffect(() => {
    if (!roomId || !roomAccessToken) return;
    collaborationRoomRef.current = roomId;
    collaborationAccessTokenRef.current = roomAccessToken;
    const backfillCollaborationGap = async () => {
      const activeRoomId = collaborationRoomRef.current;
      const activeToken = collaborationAccessTokenRef.current;
      if (!activeRoomId || !activeToken || backfillInFlightRef.current) return;
      backfillInFlightRef.current = true;
      setCollaborationStatus("error");
      try {
        const interval = await fetchRoomOperations(activeRoomId, activeToken, collaborationVersionRef.current);
        if (interval.operations.length > 0 && collaborationBaselineRef.current) {
          const current = currentCollaborationPackage(collaborationBaselineRef.current.exportedAt);
          const rebased = rebaseRemoteCollaborationOperations(collaborationBaselineRef.current, current, interval.operations);
          collaborationBaselineRef.current = rebased.baseline;
          applySharedPackage(rebased.current, interval.version);
          collaborationBaselineRef.current = rebased.baseline;
        } else {
          collaborationVersionRef.current = interval.version;
          setRoomVersion(interval.version);
        }
        setCollaborationStatus("connected");
        setCollaborationMessage("已补齐断线期间的修改");
      } catch (error) {
        if (error instanceof CollaborationClientError && error.code === "VERSION_CONFLICT") {
          try {
            const room = await fetchRoom<ProjectPackage>(activeRoomId, activeToken);
            if (room.snapshot) {
              applySharedPackage(room.snapshot, room.version);
              setCollaborationStatus("connected");
              setCollaborationMessage("已重新加载完整快照");
            }
          } catch {
            setCollaborationStatus("error");
            setCollaborationMessage("连接中断，浏览器会自动尝试重连");
          }
        } else {
          setCollaborationStatus("error");
          setCollaborationMessage("连接中断，浏览器会自动尝试重连");
        }
      } finally {
        backfillInFlightRef.current = false;
      }
    };
    return subscribeRoom<ProjectPackage>(roomId, roomAccessToken, (room) => receiveRoomUpdateRef.current(room), () => {
      void backfillCollaborationGap();
    }, {
      version: collaborationVersionRef.current,
      onMembers: (members) => setRoomMembers(members),
      onClosed: () => {
        setRoomClosed(true);
        setRoomReadonly(true);
        setCollaborationStatus("closed");
        setCollaborationMessage("房间已关闭，无法继续同步或编辑");
      },
    });
    // applySharedPackage/currentCollaborationPackage are re-created each render;
    // re-subscribing the SSE stream on every render would churn connections. The
    // handlers run from refs so the stream only depends on room identity/token.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomAccessToken, roomId]);

  useEffect(() => {
    if (!roomId || !roomAccessToken || roomRole === "viewer" || roomReadonly || roomClosed || !collaborationBaselineRef.current) return;
    if (suppressCollaborationSendRef.current) {
      suppressCollaborationSendRef.current = false;
      return;
    }
    const timer = window.setTimeout(async () => {
      const baseline = collaborationBaselineRef.current;
      if (!baseline || collaborationRoomRef.current !== roomId) return;
      const currentEnvelope = createProjectPackageEnvelope(latestWorkspaceRef.current);
      const current: ProjectPackage = {
        ...currentEnvelope,
        exportedAt: baseline.exportedAt,
        project: { ...currentEnvelope.project, history: { past: [], future: [] } },
      };
      const operations = diffCollaborationDocument(baseline, current);
      if (operations.length === 0) return;
      const txId = createId("collab-op");
      setCollaborationStatus("syncing");
      setCollaborationMessage(`正在同步 ${operations.length} 项增量修改`);
      try {
        const acknowledged = await submitRoomOperations<ProjectPackage>(roomId, roomAccessToken, {
          txId,
          clientId: collaborationClientId,
          baseVersion: collaborationVersionRef.current,
          operations,
        });
        collaborationBaselineRef.current = applyCollaborationOperations(baseline, operations);
        collaborationVersionRef.current = acknowledged.version;
        setRoomVersion(acknowledged.version);
        setCollaborationStatus("connected");
        setCollaborationMessage(acknowledged.rebasedFromVersion === undefined ? "增量同步已完成" : "已自动合并互不冲突的并发修改");
      } catch (error) {
        if (error instanceof CollaborationClientError && error.code === "VERSION_CONFLICT") {
          setCollaborationStatus("conflict");
          setCollaborationMessage("同一内容被其他成员修改；已暂停上传，请重新加入房间确认最新版本");
        } else {
          setCollaborationStatus("error");
          setCollaborationMessage(error instanceof Error ? error.message : "增量同步失败");
        }
      }
    }, COLLABORATION_SEND_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [collaborationClientId, customTemplates, project, renderSettings, roomAccessToken, roomId, roomRole, roomReadonly, roomClosed, userAssets, userFonts]);

  const storedRoomAccess = (id: string): string | null => loadBrowserValue(
    () => window.localStorage.getItem(`${ROOM_ACCESS_STORAGE_PREFIX}${id}`),
    null,
  );

  const persistRoomAccess = (id: string, accessToken: string) => {
    try {
      window.localStorage.setItem(`${ROOM_ACCESS_STORAGE_PREFIX}${id}`, accessToken);
    } catch {
      // The active connection remains usable when browser storage is unavailable.
    }
  };

  const forgetRoomAccess = (id: string) => {
    try {
      window.localStorage.removeItem(`${ROOM_ACCESS_STORAGE_PREFIX}${id}`);
    } catch {
      // Local project data is intentionally untouched when credentials cannot be cleared.
    }
  };

  const startCollaborationRoom = async () => {
    setCollaborationStatus("connecting");
    setCollaborationMessage("正在创建房间");
    try {
      const allocated = await createRoom<ProjectPackage>({ clientId: collaborationClientId, displayName: COLLABORATION_DISPLAY_NAME });
      const { room, access } = allocated;
      persistRoomAccess(room.id, access.accessToken);
      setRoomId(room.id);
      setRoomAccessToken(access.accessToken);
      setRoomRole(access.role);
      setRoomParticipants([{ id: access.participantId, displayName: access.displayName, role: access.role }]);
      setRoomMembers(room.members ?? [{ clientId: collaborationClientId, role: "owner", joinedAt: new Date().toISOString(), lastSeenAt: new Date().toISOString() }]);
      setRoomReadonly(room.readonly ?? false);
      setRoomClosed(room.closed ?? false);
      setRoomInput(room.id);
      collaborationRoomRef.current = room.id;
      collaborationAccessTokenRef.current = access.accessToken;
      collaborationVersionRef.current = room.version;
      const initial = currentCollaborationPackage();
      collaborationBaselineRef.current = initial;
      const ready = await submitRoomSnapshot(room.id, access.accessToken, {
        txId: createId("collab-init"),
        clientId: collaborationClientId,
        baseVersion: room.version,
        snapshot: initial,
      });
      collaborationVersionRef.current = ready.version;
      setRoomVersion(ready.version);
      setCollaborationStatus("connected");
      setCollaborationMessage("房间已创建，后续仅同步增量修改");
    } catch (error) {
      setCollaborationStatus("error");
      setCollaborationMessage(error instanceof Error ? error.message : "创建协作房间失败");
    }
  };

  const joinCollaborationRoom = async () => {
    const normalizedRoomId = roomInput.trim().toUpperCase();
    if (!normalizedRoomId) return;
    const persistedToken = storedRoomAccess(normalizedRoomId);
    if (!inviteTokenInput.trim() && !persistedToken) return;
    setCollaborationStatus("connecting");
    setCollaborationMessage(persistedToken ? "正在恢复房间访问" : "正在验证邀请凭证");
    try {
      const access = persistedToken
        ? { accessToken: persistedToken, role: null }
        : await joinRoom<ProjectPackage>({
          roomId: normalizedRoomId,
          inviteToken: inviteTokenInput.trim(),
          clientId: collaborationClientId,
          displayName: COLLABORATION_DISPLAY_NAME,
        }).then((joined) => joined.access);
      const room = await retryInitializingRoom(() => fetchRoom<ProjectPackage>(normalizedRoomId, access.accessToken));
      if (!room.snapshot) throw new Error("房间工程数据不完整");
      persistRoomAccess(normalizedRoomId, access.accessToken);
      setRoomId(normalizedRoomId);
      setRoomAccessToken(access.accessToken);
      setRoomRole(room.role ?? access.role);
      setRoomParticipants(room.participants ?? []);
      setRoomMembers(room.members ?? []);
      setRoomReadonly(room.readonly ?? false);
      setRoomClosed(room.closed ?? false);
      setInviteTokenInput("");
      collaborationRoomRef.current = normalizedRoomId;
      collaborationAccessTokenRef.current = access.accessToken;
      applySharedPackage(room.snapshot, room.version);
      if (room.closed) {
        setCollaborationStatus("closed");
        setCollaborationMessage("房间已关闭，无法继续同步或编辑");
      } else {
        setCollaborationStatus("connected");
        setCollaborationMessage("已加入房间，后续仅同步增量修改");
      }
    } catch (error) {
      if (error instanceof CollaborationClientError && (error.code === "ROOM_FORBIDDEN" || error.code === "ROOM_NOT_FOUND")) {
        forgetRoomAccess(normalizedRoomId);
      }
      setCollaborationStatus("error");
      setCollaborationMessage(error instanceof Error ? error.message : "加入协作房间失败");
    }
  };

  const createCollaborationInvitation = async (role: Exclude<CollaborationRole, "owner">) => {
    if (!roomId || !roomAccessToken) return;
    try {
      const invitation = await createRoomInvitation(roomId, roomAccessToken, role);
      setInvitationToken(invitation.token);
      setCollaborationMessage(`已生成${role === "editor" ? "编辑" : "查看"}邀请凭证，请通过私密渠道发送`);
    } catch (error) {
      setCollaborationStatus("error");
      setCollaborationMessage(error instanceof Error ? error.message : "创建邀请失败");
    }
  };

  const leaveCollaborationRoom = () => {
    if (roomId && roomAccessToken) {
      void leaveRoom(roomId, roomAccessToken, collaborationClientId).catch(() => {
        // Leaving is best-effort; local state is cleared regardless.
      });
    }
    if (roomId) forgetRoomAccess(roomId);
    setRoomId(null);
    setRoomAccessToken(null);
    setRoomRole(null);
    setRoomParticipants([]);
    setRoomMembers([]);
    setRoomReadonly(false);
    setRoomClosed(false);
    setInvitationToken(null);
    collaborationRoomRef.current = null;
    collaborationAccessTokenRef.current = null;
    collaborationBaselineRef.current = null;
    collaborationVersionRef.current = 0;
    setRoomVersion(0);
    setCollaborationStatus("idle");
    setCollaborationMessage("已断开；未连接时不会上传或覆盖工程");
  };

  const setCollaborationRoomAccess = async (action: RoomAccessAction) => {
    if (!roomId || !roomAccessToken) return;
    setCollaborationStatus("syncing");
    try {
      const updated = await setRoomAccess(roomId, roomAccessToken, collaborationClientId, action);
      setRoomReadonly(updated.readonly ?? false);
      if (updated.closed) {
        setRoomClosed(true);
        setCollaborationStatus("closed");
        setCollaborationMessage("房间已关闭，无法继续同步或编辑");
      } else {
        setCollaborationStatus("connected");
        setCollaborationMessage(updated.readonly ? "房间已设为只读" : "房间已恢复可编辑");
      }
    } catch (error) {
      setCollaborationStatus("error");
      setCollaborationMessage(error instanceof Error ? error.message : "设置房间访问失败");
    }
  };

  const canEditSharedProject = roomRole !== "viewer" && !roomReadonly && !roomClosed;

  const commitProject = (next: ProjectDocument) => {
    if (!canEditSharedProject) {
      setCollaborationMessage("当前仅查看，无法修改此工程");
      return;
    }
    setProject(next);
    setPreviewCommands([]);
    workspaceSync.markPending();
  };

  const commitProjectTransaction = (transaction: ProjectTransaction) => {
    if (!canEditSharedProject) {
      setCollaborationMessage("当前仅查看，无法修改此工程");
      return;
    }
    setProject((current) => {
      const next = applyTransaction(current, transaction);
      return next;
    });
    setPreviewCommands([]);
    setAgentPreview(null);
    workspaceSync.markPending();
  };

  const canUndo = project.history.past.length > 0;
  const canRedo = project.history.future.length > 0;
  const undoLabel = canUndo
    ? `撤销：${project.history.past[project.history.past.length - 1]?.label ?? "上一步"}`
    : "暂无可撤销操作";
  const redoLabel = canRedo
    ? `重做：${project.history.future[0]?.label ?? "下一步"}`
    : "暂无可重做操作";

  const handleUndo = () => {
    if (!canUndo) return;
    commitProject(undoTransaction(project));
  };

  const handleRedo = () => {
    if (!canRedo) return;
    commitProject(redoTransaction(project));
  };

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia?.("(max-width: 1120px)").matches) return;
    const timer = window.setTimeout(() => {
      const stage = stageRef.current;
      if (!stage) return;
      setZoomPercent(fitZoomPercent({
        stageWidth: stage.clientWidth,
        stageHeight: stage.clientHeight,
        canvasWidth: project.canvas.width,
        canvasHeight: project.canvas.height,
      }));
    }, 0);
    return () => window.clearTimeout(timer);
  }, [project.canvas.height, project.canvas.width]);

  const maybeSnap = (x: number, y: number) => {
    if (!showGrid) return { x: Math.round(x), y: Math.round(y) };
    return snapPoint({ x, y }, gridSize);
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select" || target?.isContentEditable) {
        return;
      }
      const key = event.key.toLowerCase();
      const mod = event.metaKey || event.ctrlKey;
      if (!mod) return;
      if (key === "z" && !event.shiftKey) {
        event.preventDefault();
        handleUndo();
        return;
      }
      if ((key === "z" && event.shiftKey) || key === "y") {
        event.preventDefault();
        handleRedo();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  const resolvedCardPositionsRef = useRef<Record<string, { x: number; y: number }> | null>(null);
  const captureCardPositions = (positions: Record<string, { x: number; y: number }>) => {
    resolvedCardPositionsRef.current = positions;
  };
  const freezeCardPositionsForMapChange = (current: ProjectDocument) => {
    const positions = resolvedCardPositionsRef.current;
    if (!positions || Object.keys(positions).length === 0) return current.cards;
    return { ...current.cards, positions: { ...positions, ...current.cards.positions } };
  };
  const refreshDisplayFramePositions = () => {
    if (typeof window !== "undefined" && Object.keys(project.cards.positions ?? {}).length > 0
      && !window.confirm("刷新展示框位置会重新按当前地图计算数据框位置，是否继续？")) return;
    resolvedCardPositionsRef.current = null;
    commitProjectTransaction({
      id: createId("tx-display-frame-position-refresh"),
      label: "刷新展示框位置",
      source: "manual",
      apply: (current) => ({ ...current, cards: { ...current.cards, positions: {} } }),
    });
    setStatusMessage("已刷新展示框位置");
  };
  const patchScene = (target: SceneSelection, patch: Record<string, unknown>) => {
    if (target.type !== "map" && target.type !== "province") {
      commitProjectTransaction(createSceneTransaction(target, patch));
      return;
    }
    const transaction = createSceneTransaction(target, patch);
    commitProjectTransaction({
      ...transaction,
      apply: (current) => {
        const next = transaction.apply(current);
        return { ...next, cards: freezeCardPositionsForMapChange(current) };
      },
    });
  };

  const applyFont = (target: TypographyTarget, fontId: string, applyToAll: boolean) => {
    commitProjectTransaction({
      id: createId("tx-typography"),
      label: applyToAll ? "应用字体到全部同类文本" : "修改字体",
      source: "manual",
      apply: (current) => applyTypographyFont(current, target, fontId, applyToAll),
    });
  };

  const resetSceneTarget = (target: Extract<SceneSelection, { type: "canvas" | "map" | "cards" }>) => {
    const defaults = createDefaultScene(project.templateId);
    const patch = target.type === "canvas"
      ? defaults.canvas
      : target.type === "map"
        ? defaults.map
        : defaults.cards;
    patchScene(target, { ...patch } as Record<string, unknown>);
  };

  const exportSvg = () => {
    lastExportRef.current = "svg";
    setExportState("exporting");
    setExportError(undefined);
    try {
      const svg = posterRef.current;
      if (!svg) throw new Error("海报预览尚未准备好");
      const source = serializePosterSvg(svg, { transparentBackground: transparentExport });
      downloadText(source, "我的毕业去向图.svg", "image/svg+xml;charset=utf-8");
      setExportState("success");
      setStatusMessage("SVG 已导出");
    } catch (error) {
      const message = error instanceof Error ? error.message : "SVG 导出失败";
      setExportState("error");
      setExportError(message);
      setStatusMessage(message);
    }
  };

  const openProjectExportDialog = () => {
    setIncludeResourcesInProjectExport(true);
    setShowProjectExportDialog(true);
  };

  const exportProjectPackage = () => {
    lastExportRef.current = "project";
    setExportState("exporting");
    setExportError(undefined);
    try {
      const exportedAssets = includeResourcesInProjectExport ? userAssets : [];
      const exportedFonts = includeResourcesInProjectExport ? userFonts : [];
      downloadProjectPackage(createProjectPackage({
        project,
        assets: exportedAssets,
        fonts: exportedFonts,
        customTemplates,
        renderSettings,
      }));
      setShowProjectExportDialog(false);
      setExportState("success");
      setStatusMessage(includeResourcesInProjectExport
        ? `完整工程包已导出：${project.students.length} 条名单、${exportedAssets.length} 个素材、${exportedFonts.length} 个字体、${customTemplates.length} 个模板`
        : `工程已导出（未包含资源包）：${project.students.length} 条名单、${customTemplates.length} 个模板`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "工程包导出失败";
      setExportState("error");
      setExportError(message);
      setStatusMessage(message);
    }
  };

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

  const importProjectPackage = (file: File | null) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const pack = parseProjectPackage(String(reader.result ?? ""));
        if (!window.confirm(`导入工程将替换当前画布和 ${project.students.length} 条名单，是否继续？`)) return;
        setUserAssets(pack.assets);
        setUserFonts(pack.fonts);
        setCustomTemplates(pack.customTemplates);
        setRenderSettings(pack.renderSettings);
        commitProject(pack.project);
        setSelection({ type: "canvas" });
        setStatusMessage(`完整工程包已导入：${pack.project.students.length} 条名单、${pack.assets.length} 个素材、${pack.fonts.length} 个字体、${pack.customTemplates.length} 个模板`);
      } catch (error) {
        setStatusMessage(error instanceof Error ? error.message : "工程包导入失败");
      }
    };
    reader.readAsText(file);
  };

  const addUserAsset = (asset: UserAsset) => {
    if (!asset?.src) {
      setStatusMessage("素材内容为空，未保存");
      return;
    }
    setUserAssets((current) => {
      if (current.some((item) => item.id === asset.id || item.src === asset.src && item.kind === asset.kind && JSON.stringify(item.provinceIds) === JSON.stringify(asset.provinceIds))) {
        setStatusMessage(`素材库已有相同素材：${asset.label}`);
        return current;
      }
      const next = [...current, asset];
      setStatusMessage(`已加入素材库：${asset.label}`);
      return next;
    });
  };

  const replaceUserAsset = (assetId: string, replacement: UserAsset) => {
    setUserAssets((current) => current.map((asset) => asset.id === assetId ? replacement : asset));
    commitProject(
      applyTransaction(project, {
        id: createId(`tx-asset-replace-${assetId}`),
        label: `更新素材：${replacement.label}`,
        source: "manual",
        apply: (current) => ({
          ...current,
          assetElements: current.assetElements.map((element) =>
            element.assetId === assetId ? { ...element, src: replacement.src, label: replacement.label } : element,
          ),
        }),
      }),
    );
    setStatusMessage(`已更新素材：${replacement.label}`);
  };

  const deleteUserAsset = (assetId: string) => {
    const asset = userAssets.find((item) => item.id === assetId);
    setUserAssets((current) => {
      const next = removeUserAsset(current, assetId);
      return next;
    });
    setStatusMessage(asset ? `已从素材库删除：${asset.label}` : "已从素材库删除素材");
  };

  const deleteUserFont = (fontId: string) => {
    const font = userFonts.find((item) => item.id === fontId);
    setUserFonts((current) => {
      const next = removeUserFont(current, fontId);
      return next;
    });
    setStatusMessage(font ? `已删除字体：${font.label}` : "已删除字体");
  };

  const assetUsageById = useMemo(() => {
    const map: Record<string, string> = {};
    for (const asset of userAssets) {
      if (!isAssetInUse(project, asset.id, asset) && asset.src !== project.canvas.backgroundImageSrc) continue;
      const usage = findAssetUsage(project, asset.id);
      const parts: string[] = [];
      if (usage.provinces.length) parts.push(usage.provinces.map((name) => name.replace(/(特别行政区|维吾尔自治区|壮族自治区|回族自治区|自治区|省|市)$/, "")).join("/"));
      if (usage.instances.length) parts.push(`${usage.instances.length} 个实例`);
      if (asset.src === project.canvas.backgroundImageSrc) parts.push("背景");
      map[asset.id] = parts.length ? `使用中 · ${parts.join(" · ")}` : "使用中";
    }
    return map;
  }, [project, userAssets]);


  const selectStyleLayer = (target: (typeof STYLE_LAYER_TARGETS)[number]) => {
    if (target.type === "text") {
      setSelection({ type: "text", id: target.id });
      return;
    }
    if (target.type === "map") {
      setSelection({ type: "map" });
      return;
    }
    if (target.type === "canvas") {
      setSelection({ type: "canvas" });
      return;
    }
    if (target.type === "guests") {
      setSelection({ type: "guests" });
      return;
    }
    setSelection({ type: "cards" });
  };

  const exportResourcePack = () => {
    if (userAssets.length === 0 && userFonts.length === 0) {
      setStatusMessage("本地素材库为空，请先上传图片或字体");
      return;
    }
    const pack = createResourcePack({ assets: userAssets, fonts: userFonts });
    downloadResourcePack(pack);
    setStatusMessage(`已导出资源包：${userAssets.length} 个素材，${userFonts.length} 个字体`);
  };

  const importResourcePack = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const { pack, assetCount, fontCount } = parseResourcePack(String(reader.result || ""));
        const merged = mergeResourcePack({
          existingAssets: userAssets,
          existingFonts: userFonts,
          incoming: pack,
        });
        setUserAssets(merged.assets);
        setUserFonts(merged.fonts);
        setStatusMessage(`资源包已导入：新增 ${merged.addedAssets}/${assetCount} 素材，${merged.addedFonts}/${fontCount} 字体`);
      } catch (error) {
        setStatusMessage(error instanceof Error ? error.message : "资源包导入失败");
      }
    };
    reader.readAsText(file);
  };


  const handleSceneSelect = (next: SceneSelection) => {
    setSelection(next);
  };

  const locateLayoutIssue = (issue: { id: string }) => {
    const target = issue.id.split(":").find((id) => (
      id === "map"
      || id === "cards"
      || id === "guests"
      || Boolean(project.cards.positions?.[id])
      || project.textElements.some((text) => text.id === id)
      || project.assetElements.some((asset) => asset.id === id)
    ));
    if (!target) return;
    if (target === "map") setSelection({ type: "map" });
    else if (target === "cards" || project.cards.positions?.[target]) setSelection({ type: "cards" });
    else if (target === "guests") setSelection({ type: "guests" });
    else if (project.textElements.some((text) => text.id === target)) setSelection({ type: "text", id: target });
    else if (project.assetElements.some((asset) => asset.id === target)) setSelection({ type: "asset", id: target });
  };

  const locateDeliveryIssue = (item: DeliveryIssue) => {
    if (item.kind === "data") {
      setSelectedStudentId(item.issue.studentId);
      setActiveStage("data");
      setActivePanel("roster");
      return;
    }
    if (item.kind === "layout") {
      locateLayoutIssue(item.issue);
      setActiveStage("content");
      setActivePanel("content");
      return;
    }
    const target = item.issue.target;
    const location = resolveDeliveryIssueLocation(target);
    if (!location) return;
    if (location.selectionKind === "map") setSelection({ type: "map" });
    else if (location.selectionKind === "province") setSelection({ type: "province", province: location.province! });
    else if (location.selectionKind === "guests") setSelection({ type: "guests" });
    else if (location.selectionKind === "cards") setSelection({ type: "cards" });
    else if (location.selectionKind === "text" || location.selectionKind === "asset") {
      setSelection({ type: location.selectionKind, id: location.id! });
    }
    setActiveStage(location.stage);
    setActivePanel(location.stage === "frame" ? "layout" : location.stage === "map" ? "map" : "content");
  };

  const contentLayoutIssues = useMemo(() => checkLayoutHealth({
    canvas: { width: project.canvas.width, height: project.canvas.height, safeMargin: project.canvas.safeMargin },
    cardsPositions: project.cards.positions,
    objects: [
      { id: "map", kind: "map", zIndex: project.map.zIndex, bounds: { x: project.map.x, y: project.map.y, width: project.map.width * project.map.scale, height: project.map.height * project.map.scale } },
      ...Object.keys(project.cards.positions ?? {}).map((id) => ({ id, kind: "card" as const, positionKey: id, zIndex: project.cards.zIndex, bounds: { x: 0, y: 0, width: project.cards.maxWidth, height: 180 } })),
      ...(Object.keys(project.cards.positions ?? {}).length === 0 ? [{ id: "cards", kind: "card" as const, zIndex: project.cards.zIndex, bounds: { x: project.cards.x, y: project.cards.y, width: project.cards.maxWidth, height: 180 } }] : []),
      ...(project.guests.visibility ? [{ id: "guests", kind: "guests" as const, zIndex: 20, bounds: { x: project.guests.x, y: project.guests.y, width: project.guests.width, height: 120 } }] : []),
      ...project.textElements.map((text) => ({
        id: text.id,
        kind: "text" as const,
        zIndex: 40,
        bounds: { x: text.textAlign === "right" ? text.x - text.maxWidth : text.textAlign === "center" ? text.x - text.maxWidth / 2 : text.x, y: text.y - text.fontSize, width: text.maxWidth, height: text.fontSize * 1.3 },
        visible: text.visibility,
        content: text.content,
        textColor: text.color,
        backgroundColor: project.canvas.backgroundColor,
      })),
      ...project.assetElements.map((asset) => ({ id: asset.id, kind: "asset" as const, zIndex: asset.zIndex, bounds: { x: asset.x, y: asset.y, width: asset.width, height: asset.height }, visible: asset.visibility })),
    ],
  }), [project]);

  const handleLegacySceneSelect = (next: SceneSelection) => {
    handleSceneSelect(next);
    // Keep the legacy content editor's material context available without letting
    // the dedicated map stage leave its own workflow context.
    if (activeStage === "content" && next.type === "province") setActivePanel("assets");
  };

  const exportPng = async () => {
    lastExportRef.current = "png";
    setExportingPng(true);
    setExportState("exporting");
    setExportError(undefined);
    try {
      const svg = posterRef.current;
      if (!svg) throw new Error("海报预览尚未准备好");
      await ensureUserFontsLoaded(userFonts);
      const source = serializePosterSvg(svg, { transparentBackground: transparentExport, blockFontDisplay: true });
      const dataUrl = await svgToPngDataUrl(source, {
        width: project.canvas.width * pngScale,
        height: project.canvas.height * pngScale,
        transparentBackground: transparentExport,
      });
      downloadDataUrl(dataUrl, "我的毕业去向图.png");
      setExportState("success");
      setStatusMessage("PNG 已导出");
    } catch (error) {
      const message = error instanceof Error ? error.message : "PNG 导出失败";
      setExportState("error");
      setExportError(message);
      setStatusMessage(message);
    } finally {
      setExportingPng(false);
    }
  };

  const retryLastExport = () => {
    if (lastExportRef.current === "svg") exportSvg();
    else if (lastExportRef.current === "project") exportProjectPackage();
    else void exportPng();
  };

  const addText = () => {
    const element = createTextElement("给未来的一封信", 720, 870);
    commitProject(
      applyTransaction(project, {
        id: createId("tx-text"),
        label: "添加文本框",
        source: "manual",
        apply: (current) => ({
          ...current,
          textElements: [...current.textElements, element],
        }),
      }),
    );
    setSelection({ type: "text", id: element.id });
  };

  const addNote = () => {
    const element = createNoteElement("山高水长，来日再聚", 745, 905);
    commitProject(applyTransaction(project, {
      id: createId("tx-note"),
      label: "添加特别备注",
      source: "manual",
      apply: (current) => ({ ...current, textElements: [...current.textElements, element] }),
    }));
    setSelection({ type: "text", id: element.id });
  };

  const removeText = (id: string) => {
    commitProject(applyTransaction(project, {
      id: `tx-text-delete-${id}`,
      label: "删除文本",
      source: "manual",
      apply: (current) => deleteText(current, id),
    }));
    setSelection({ type: "canvas" });
  };

  const removeAsset = (id: string) => {
    commitProject(applyTransaction(project, {
      id: `tx-asset-delete-${id}`,
      label: "删除素材实例",
      source: "manual",
      apply: (current) => deleteAsset(current, id),
    }));
    setSelection({ type: "canvas" });
  };

  const duplicateAsset = (id: string) => {
    const source = project.assetElements.find((asset) => asset.id === id);
    if (!source) return;
    const copy = duplicateAssetElement(source);
    commitProject(applyTransaction(project, {
      id: `tx-asset-duplicate-${id}`,
      label: "复制素材实例",
      source: "manual",
      apply: (current) => ({ ...current, assetElements: [...current.assetElements, copy] }),
    }));
    setSelection({ type: "asset", id: copy.id });
  };

  const changeAssetLayer = (id: string, delta: -1 | 1) => {
    const asset = project.assetElements.find((item) => item.id === id);
    if (!asset) return;
    patchScene({ type: "asset", id }, { zIndex: asset.zIndex + delta });
  };

  const applySystemTemplate = (templateId: MapTemplateId) => {
    const scene = createDefaultScene(templateId);
    commitProject(applyTransaction(project, {
      id: createId(`tx-template-${templateId}`),
      label: `应用内置模板：${createSystemTemplate(templateId).name}`,
      source: "manual",
      apply: (current) => ({
        ...current,
        templateId,
        canvas: scene.canvas,
        map: scene.map,
        cards: scene.cards,
        textElements: scene.textElements,
        assetElements: scene.assetElements,
        style: {
          ...current.style,
          cardPreset: scene.cards.preset,
          mapScale: scene.map.scale,
          backgroundColor: scene.canvas.backgroundColor,
          visibleFields: [...scene.cards.visibleFields],
        },
      }),
    }));
  };

  const applyCustomTemplateRecord = (record: CustomTemplateRecord) => {
    commitProject(
      applyTransaction(project, {
        id: `tx-custom-${record.id}`,
        label: `应用自定义模板：${record.name}`,
        source: "manual",
        apply: (current) => applyCustomTemplateToProject(current, record),
      }),
    );
  };

  const saveCurrentTemplate = () => {
    const name = window.prompt("自定义模板名称", "我的地图版式");
    if (!name?.trim()) return;
    const scope = window.confirm("点击“确定”保存视觉样式；点击“取消”保存布局倾向（含卡片分组）")
      ? "visual"
      : "layout";
    const record = createCustomTemplateFromProject({
      name: name.trim(),
      baseTemplateId: project.templateId,
      scope,
      overrides: {
        background: {
          type: project.canvas.backgroundImageSrc ? "image" : "color",
          color: project.canvas.backgroundColor || createSystemTemplate(project.templateId).background.color,
          imageSrc: project.canvas.backgroundImageSrc,
          opacity: project.canvas.backgroundOpacity,
          blur: 0,
          layer: "behind-map",
        },
        map: {
          ...createSystemTemplate(project.templateId).map,
          scale: project.map.scale,
          offsetX: project.map.x,
          offsetY: project.map.y,
          landColor: project.map.landColor,
          activeColor: project.map.activeColor,
          edgeColor: project.map.edgeColor,
          edgeStyle: project.map.edgeStyle ?? "solid",
          edgeWidth: project.map.edgeWidth ?? 1,
          showProvinceLabels: project.map.showProvinceLabels,
          provinceStyles: project.map.provinceStyles ?? {},
        },
        cards: {
          ...createSystemTemplate(project.templateId).cards,
          preset: project.cards.preset,
          grouping: project.cards.grouping,
          maxWidth: project.cards.maxWidth,
          padding: project.cards.padding,
          background: project.cards.background,
          textColor: project.cards.textColor,
        },
        visibleFields: project.cards.visibleFields,
        regionalAssets: project.style.regionalAssets,
      },
      scene: {
        canvas: project.canvas,
        map: project.map,
        cards: project.cards,
        guests: project.guests,
        textElements: project.textElements,
        assetElements: project.assetElements,
      },
      students: project.students,
    });
    const next = [record, ...customTemplates].slice(0, 20);
    setCustomTemplates(next);
    setStatusMessage(`已保存模板：${record.name}`);
  };

  const createNewProject = () => {
    if (!window.confirm("新建项目会清空当前未保存修改，是否继续？")) return;
    const next = createProjectDocument({ students: [], templateId: "original", dataView: "province" });
    setProject(next);
    setPreviewCommands([]);
    setSelection({ type: "canvas" });
    setSelectedStudentId(null);
    setActivePanel("roster");
    setActiveWorkflowStep("roster");
    setActiveStage("template");
    setStatusMessage("已新建空项目");
  };

  const restoreLocalProject = () => {
    const next = loadInitialProject();
    setProject(next);
    setPreviewCommands([]);
    setSelection({ type: "canvas" });
    setActivePanel("roster");
    setActiveWorkflowStep("roster");
    setActiveStage("template");
    setStatusMessage("已恢复本机最近项目");
  };

  const openGlobalData = () => {
    if (activeStage !== "data" && activeStage !== "template") lastNonTemplateStageRef.current = activeStage;
    setGlobalSettingsSection(null);
    setActivePanel("roster");
    setActiveWorkflowStep("roster");
    setActiveStage("data");
  };

  const handleWorkflowStageChange = (stage: WorkflowStageId) => {
    setGlobalSettingsSection(null);
    if (stage !== "template" && stage !== "data") lastNonTemplateStageRef.current = stage;
    setActiveStage(stage);
    if (stage === "template") {
      setGlobalSettingsSection(null);
      return;
    }
    if (stage === "data") {
      openGlobalData();
      return;
    }
    const legacyPanel = WORKFLOW_STAGE_TO_LEGACY_PANEL[stage];
    if (!legacyPanel) return;
    setActivePanel(legacyPanel);
    setActiveWorkflowStep(stage === "map" ? "presentation" : stage === "frame" ? "layout" : stage === "export" ? "export" : "local");
  };

  const dataWorkspaceProps = {
    students: project.students,
    dataView: project.dataView,
    onChangeDataView: (view: DataViewId) => commitProjectTransaction({
      id: createId(`tx-data-view-${view}`),
      label: `切换数据呈现：${view}`,
      source: "manual" as const,
      apply: (current: ProjectDocument) => applyDataViewChange(current, view),
    }),
    onAppendStudents: (records: typeof project.students) => commitProjectTransaction({
      id: createId("tx-append"),
      label: `追加 ${records.length} 名学生`,
      source: "import" as const,
      apply: (current: ProjectDocument) => ({ ...current, students: [...current.students, ...records] }),
    }),
    onReplaceStudents: (records: typeof project.students) => commitProjectTransaction({
      id: createId("tx-replace"),
      label: `替换为 ${records.length} 名学生`,
      source: "import" as const,
      apply: (current: ProjectDocument) => ({ ...current, students: records }),
    }),
    onUpdateStudent: (id: string, patch: Partial<Pick<typeof project.students[number], "name" | "university" | "city" | "province" | "locationScope">>) => commitProjectTransaction({
      id: createId(`tx-student-update-${id}`),
      label: "编辑学生记录",
      source: "manual" as const,
      apply: (current: ProjectDocument) => ({
        ...current,
        students: current.students.map((student) => {
          if (student.id !== id) return student;
          const next = { ...student, ...patch };
          if ("province" in patch && !patch.province) {
            const { province: _cleared, ...withoutProvince } = next;
            if ("locationScope" in patch && !patch.locationScope) {
              const { locationScope: _locationScope, ...withoutLocationScope } = withoutProvince;
              return withoutLocationScope;
            }
            return withoutProvince;
          }
          if ("locationScope" in patch && !patch.locationScope) {
            const { locationScope: _cleared, ...rest } = next;
            return rest;
          }
          return next;
        }),
      }),
    }),
    onToggleVisibility: (id: string) => commitProjectTransaction({
      id: createId(`tx-student-visibility-${id}`),
      label: "切换学生显示状态",
      source: "manual" as const,
      apply: (current: ProjectDocument) => ({
        ...current,
        students: current.students.map((student) => student.id === id ? { ...student, visibility: student.visibility === false } : student),
      }),
    }),
    onDeleteStudent: (id: string) => commitProjectTransaction({
      id: createId(`tx-student-delete-${id}`),
      label: "删除学生记录",
      source: "manual" as const,
      apply: (current: ProjectDocument) => ({ ...current, students: current.students.filter((student) => student.id !== id) }),
    }),
    onSetStudentsVisibility: (visibility: boolean) => commitProjectTransaction({
      id: createId(`tx-students-visibility-${visibility}`),
      label: visibility ? "全部显示学生" : "全部隐藏学生",
      source: "manual" as const,
      apply: (current: ProjectDocument) => ({ ...current, students: current.students.map((student) => ({ ...student, visibility })) }),
    }),
    selectedStudentId,
    onSelectStudent: setSelectedStudentId,
  };

  const handleCreateDecoration = (asset: StudioAsset) => {
    const element = createDecorationElement(asset, {
      x: project.canvas.width - 180,
      y: project.canvas.height - 180,
    });
    commitProject(
      applyTransaction(project, {
        id: createId("tx-decoration"),
        label: `添加装饰：${asset.label}`,
        source: "manual",
        apply: (current) => ({
          ...current,
          assetElements: [...current.assetElements, element],
        }),
      }),
    );
    setSelection({ type: "asset", id: element.id });
  };

  const mapStyleAssetPanelProps: ContentAssetPanelProps = {
    instances: project.assetElements
      .filter((element) => element.kind !== "province-texture")
      .map((element) => ({ id: element.id, assetId: element.assetId, label: element.label, kind: element.kind })),
    provinces: provinceNames,
    dataProvinces: summary.map((item) => item.province),
    provinceStyles: project.map.provinceStyles,
    provinceAdjacency: CHINA_PROVINCE_ADJACENCY,
    mapBaseColor: project.map.landColor,
    posterBackground: project.canvas.backgroundColor,
    userAssets,
    assetUsageById,
    onApplyBackground: (asset) => {
      commitProject(applyTransaction(project, {
        id: createId("tx-bg"),
        label: `应用背景：${asset.label}`,
        source: "manual",
        apply: (current) => ({
          ...current,
          canvas: { ...current.canvas, backgroundImageSrc: asset.src },
          style: { ...current.style, backgroundImageSrc: asset.src },
        }),
      }));
    },
    onSelectInstance: (id) => setSelection({ type: "asset", id }),
    onPatchProvinceTextureUniformSize: (next) => patchScene({ type: "map" }, { provinceTextureUniformSize: next }),
    onApplyProvinceAppearance: (province, appearance, fill) => {
      setSelection({ type: "province", province });
      patchScene({ type: "province", province }, { appearance, ...(fill ? { fill } : {}) });
      setStatusMessage(`已应用到地图：${province}`);
    },
    onApplyProvinceThemes: (themes) => {
      const entries = Object.entries(themes);
      if (entries.length === 0) return;
      const transaction = createProvinceThemeTransaction(themes);
      commitProjectTransaction({
        ...transaction,
        apply: (current) => ({ ...transaction.apply(current), cards: freezeCardPositionsForMapChange(current) }),
      });
      setStatusMessage(`已应用 ${entries.length} 个省份智能底色`);
    },
    onResetProvinceAppearance: (province) => {
      setSelection({ type: "province", province });
      patchScene({ type: "province", province }, { appearance: undefined, fill: undefined, textureSrc: undefined });
      setStatusMessage(`已恢复系统默认：${province}`);
    },
    onAddUserAsset: addUserAsset,
    onReplaceUserAsset: replaceUserAsset,
    onDeleteUserAsset: deleteUserAsset,
    onExportResourcePack: exportResourcePack,
    onImportResourcePack: importResourcePack,
  };

  const handleWorkflowStepChange = (id: WorkflowPanelId) => {
    const nextStage = LEGACY_PANEL_TO_WORKFLOW_STAGE[id];
    setActiveStage(nextStage);
    if (id === "roster") {
      openGlobalData();
      return;
    }
    setActivePanel(id);
    const workflowId: WorkflowStepId = id === "map"
      ? "presentation"
      : id === "layout"
        ? "layout"
        : id === "deliver"
          ? "export"
          : "local";
    setActiveWorkflowStep(workflowId);
  };

  const systemTemplateIds = ["original", "cartoon", "grain", "q", "scenery", "regional"] as const;
  const templateOptions = systemTemplateIds.map((templateId) => ({
    id: templateId,
    name: createSystemTemplate(templateId).name,
  }));
  const openStudioSettings = () => {
    setActiveWorkflowStep("layout");
    setGlobalSettingsSection("canvas");
  };
  const openTopbarProjectMenu = () => {
    const menu = document.querySelector<HTMLDetailsElement>(".topbar .project-menu");
    if (menu) menu.open = !menu.open;
  };
  const openCollaborationSettings = () => {
    openTopbarProjectMenu();
    setCollaborationOpen(true);
  };
  const openDataDiagnostics = () => {
    setGlobalSettingsSection("cards");
  };
  const openRenderSettings = () => {
    setGlobalSettingsSection("advanced");
  };
  const projectExportActions = (
    <ToolbarGroup label="导出与工程">
      <ProjectMenu
      roomId={roomId}
      roomVersion={roomVersion}
      roomInput={roomInput}
      inviteTokenInput={inviteTokenInput}
      roomRole={roomRole}
      members={roomMembers}
      ownClientId={collaborationClientId}
      roomReadonly={roomReadonly}
      roomClosed={roomClosed}
      invitationToken={invitationToken}
      hasStoredRoomAccess={hasStoredRoomAccess}
      collaborationStatus={collaborationStatus}
      collaborationMessage={collaborationMessage}
      collaborationOpen={collaborationOpen}
      pngScale={pngScale}
      transparentExport={transparentExport}
      syncStatus={syncState.status}
      onSetCollaborationOpen={setCollaborationOpen}
      onRoomInputChange={setRoomInput}
      onInviteTokenInputChange={setInviteTokenInput}
      onCreateInvitation={(role) => void createCollaborationInvitation(role)}
      onSetRoomAccess={(action) => void setCollaborationRoomAccess(action)}
      onLeaveRoom={leaveCollaborationRoom}
      onStartRoom={() => void startCollaborationRoom()}
      onJoinRoom={joinCollaborationRoom}
      onNewProject={createNewProject}
      onRestoreLocal={restoreLocalProject}
      onSaveLocal={() => void overwriteBrowserStorage()}
      onPngScaleChange={setPngScale}
      onTransparentChange={setTransparentExport}
      onExportSvg={exportSvg}
      onExportProject={openProjectExportDialog}
      onImportProject={importProjectPackage}
    />
    </ToolbarGroup>
  );
  const studioAssistantRail = (
    <StudioAssistantRail
      project={project}
      assets={userAssets}
      syncStatus={syncState.status}
      collaboration={{ roomId, status: collaborationStatus, participantCount: roomParticipants.length }}
      dataIssueCount={dataIssues.length}
      renderIntervalMs={resolvedRenderInterval}
      onOpenSettings={openStudioSettings}
      onOpenProject={openTopbarProjectMenu}
      onOpenCollaboration={openCollaborationSettings}
      onOpenDataDiagnostics={openDataDiagnostics}
      onOpenRenderSettings={openRenderSettings}
      selection={selection}
      layoutIssues={contentLayoutIssues}
      onSelectElement={handleSceneSelect}
      onLocateLayoutIssue={locateLayoutIssue}
      onPreview={setAgentPreview}
      onCommit={commitProjectTransaction}
    />
  );

  if (projectId && projectLoading) {
    return (
      <main className="workbench-shell">
        <section role="status" className="workbench-loading">
          <div className="brand">
            <MapPinned size={24} />
            <span className="brand-label brand-label__full">蹭饭地图工作室</span>
            <span className="brand-label brand-label__compact" aria-hidden="true">蹭饭图</span>
            <em>Beta</em>
          </div>
          <p>正在加载项目…</p>
        </section>
      </main>
    );
  }

  if (projectMissing) {
    return (
      <main className="workbench-shell">
        <section className="workbench-error" role="alert">
          <strong>项目不存在或已删除</strong>
          <WorkbenchBackButton />
        </section>
      </main>
    );
  }

  if (activeStage === "template") {
    return (
      <div className="app-shell" data-editor-theme={resolvedTheme} data-editor-skin={skin}>
        <StudioTopbar
          assistantEntry={
            <button
              ref={assistantEntryRef}
              type="button"
              aria-label="打开AI助手与高级功能"
              aria-expanded={assistantDrawerOpen}
              onClick={() => setAssistantDrawerOpen(true)}
            >
              <Bot size={17} />
            </button>
          }
          projectActions={
            <>
              {projectId && <WorkbenchBackButton onClick={() => void handleBackToWorkbench()} />}
              {projectExportActions}
              <ToolbarGroup label="界面主题">
                <SkinSelector skin={skin} onChange={setSkin} />
<ThemeToggle mode={themeMode} resolvedTheme={resolvedTheme} onChange={setThemeMode} />
              </ToolbarGroup>
            </>
          }
        />
        <StudioEditorShell
          stage={activeStage}
          leftRail={
            <StudioLeftRail
              activeStage={activeStage}
              project={project}
              progress={workflowProgress}
              onChangeStage={handleWorkflowStageChange}
            />
          }
          rightRail={
            <TemplateCatalogRail
              templates={templateOptions}
              customTemplates={customTemplates}
              currentTemplateId={project.templateId}
              selection={templateSelection}
              onSelect={setTemplateSelection}
            />
          }
          rightRailLabel="模板列表"
        >
          <TemplateWorkspace
            project={project}
            templates={templateOptions}
            customTemplates={customTemplates}
            onApplyTemplate={(templateId) => {
              applySystemTemplate(templateId);
              setTemplateSelection(null);
              setActiveStage("content");
              setActivePanel("content");
            }}
            onApplyCustomTemplate={(templateRecord) => {
              applyCustomTemplateRecord(templateRecord);
              setTemplateSelection(null);
              setActiveStage("content");
              setActivePanel("content");
            }}
            selection={templateSelection}
            onSelect={setTemplateSelection}
          />
        </StudioEditorShell>
        <StudioAssistantDrawer
          open={assistantDrawerOpen}
          onClose={() => setAssistantDrawerOpen(false)}
          label="AI 助手与高级功能"
        >
          {studioAssistantRail}
        </StudioAssistantDrawer>
      </div>
    );
  }

  if (activeStage === "data") {
    return (
      <div className="app-shell" data-editor-theme={resolvedTheme} data-editor-skin={skin}>
        <StudioTopbar
          assistantEntry={
            <button
              ref={assistantEntryRef}
              type="button"
              aria-label="打开AI助手与高级功能"
              aria-expanded={assistantDrawerOpen}
              onClick={() => setAssistantDrawerOpen(true)}
            >
              <Bot size={17} />
            </button>
          }
          projectActions={
            <>
              {projectId && <WorkbenchBackButton onClick={() => void handleBackToWorkbench()} />}
              {projectExportActions}
              <ToolbarGroup label="界面主题">
                <SkinSelector skin={skin} onChange={setSkin} />
<ThemeToggle mode={themeMode} resolvedTheme={resolvedTheme} onChange={setThemeMode} />
              </ToolbarGroup>
            </>
          }
        />
        <StudioEditorShell
          stage={activeStage}
          leftRail={
            <StudioLeftRail
              activeStage={activeStage}
              project={project}
              progress={workflowProgress}
              onChangeStage={handleWorkflowStageChange}
            />
          }
          rightRail={
            <DataUploadRail
              project={project}
              summary={dataHealth}
              issues={dataIssues}
              dataWorkspaceProps={dataWorkspaceProps}
              assetPanelProps={mapStyleAssetPanelProps}
              onCreateDecoration={handleCreateDecoration}
              onSelectStudent={setSelectedStudentId}
            />
          }
          rightRailLabel="数据质量与素材"
        >
          <DataUploadWorkspace
            project={project}
            summary={dataHealth}
            issues={dataIssues}
            dataWorkspaceProps={{ ...dataWorkspaceProps, hideDataExpression: true, hideTemplateDownload: true }}
            assetPanelProps={mapStyleAssetPanelProps}
            onCreateDecoration={handleCreateDecoration}
            onSelectStudent={setSelectedStudentId}
          />
        </StudioEditorShell>
        <StudioAssistantDrawer
          open={assistantDrawerOpen}
          onClose={() => setAssistantDrawerOpen(false)}
          label="AI 助手与高级功能"
        >
          {studioAssistantRail}
        </StudioAssistantDrawer>
      </div>
    );
  }

  if (activeStage === "map") {
    return (
      <div className="app-shell" data-editor-theme={resolvedTheme} data-editor-skin={skin}>
        <StudioTopbar
          assistantEntry={
            <button
              ref={assistantEntryRef}
              type="button"
              aria-label="打开AI助手与高级功能"
              aria-expanded={assistantDrawerOpen}
              onClick={() => setAssistantDrawerOpen(true)}
            >
              <Bot size={17} />
            </button>
          }
          projectActions={
            <>
              {projectId && <WorkbenchBackButton onClick={() => void handleBackToWorkbench()} />}
              {projectExportActions}
              <ToolbarGroup label="界面主题">
                <SkinSelector skin={skin} onChange={setSkin} />
<ThemeToggle mode={themeMode} resolvedTheme={resolvedTheme} onChange={setThemeMode} />
              </ToolbarGroup>
            </>
          }
        />
        <StudioEditorShell
          stage={activeStage}
          leftRail={
            <StudioLeftRail
              activeStage={activeStage}
              project={project}
              progress={workflowProgress}
              onChangeStage={handleWorkflowStageChange}
            />
          }
          rightRail={
            <MapStyleRail
              project={project}
              selectedProvince={selection.type === "province" ? selection.province : null}
              userFonts={userFonts}
              canUndo={canUndo}
              canRedo={canRedo}
              undoLabel={undoLabel}
              redoLabel={redoLabel}
              onChangeDataView={dataWorkspaceProps.onChangeDataView}
              onPatchMap={(patch) => patchScene({ type: "map" }, patch)}
              onResetMap={() => resetSceneTarget({ type: "map" })}
              onPatchProvince={(province, patch) => patchScene({ type: "province", province }, patch as Record<string, unknown>)}
              onAddUserAsset={addUserAsset}
              onUndo={handleUndo}
              onRedo={handleRedo}
            />
          }
          rightRailLabel="地图对象属性"
        >
        <MapStyleWorkspace
          project={project}
          selectedProvince={selection.type === "province" ? selection.province : null}
          userFonts={userFonts}
          canUndo={canUndo}
          canRedo={canRedo}
          undoLabel={undoLabel}
          redoLabel={redoLabel}
          onChangeDataView={dataWorkspaceProps.onChangeDataView}
          onPatchMap={(patch) => patchScene({ type: "map" }, patch)}
          onResetMap={() => resetSceneTarget({ type: "map" })}
          onPatchProvince={(province, patch) => patchScene({ type: "province", province }, patch as Record<string, unknown>)}
          onCardPositionsResolved={captureCardPositions}
          onSelect={handleSceneSelect}
          onMoveProvinceTexture={(province, offsetX, offsetY) => {
            const appearance = project.map.provinceStyles?.[province]?.appearance;
            if (!appearance || appearance.kind === "manual-color") return;
            patchScene({ type: "province", province }, { appearance: { ...appearance, offsetX, offsetY } });
          }}
          onResizeMapImage={(alignment) => {
            const source = project.map.renderSource;
            if (source?.kind !== "image" || !source.alignment) return;
            patchScene({ type: "map" }, { renderSource: { ...source, alignment: { ...source.alignment, ...alignment } } });
          }}
          onAddUserAsset={addUserAsset}
          onUndo={handleUndo}
          onRedo={handleRedo}
        />
        </StudioEditorShell>
        <StudioAssistantDrawer
          open={assistantDrawerOpen}
          onClose={() => setAssistantDrawerOpen(false)}
          label="AI 助手与高级功能"
        >
          {studioAssistantRail}
        </StudioAssistantDrawer>
      </div>
    );
  }

  if (activeStage === "frame") {
    const displayFrame = project.cards.displayFrame === undefined
      ? deriveFixedDisplayFrameFromCardSettings(project.cards)
      : normalizeDisplayFrame(project.cards.displayFrame);
    return (
      <div className="app-shell" data-editor-theme={resolvedTheme} data-editor-skin={skin}>
        <StudioTopbar
          assistantEntry={
            <button
              ref={assistantEntryRef}
              type="button"
              aria-label="打开AI助手与高级功能"
              aria-expanded={assistantDrawerOpen}
              onClick={() => setAssistantDrawerOpen(true)}
            >
              <Bot size={17} />
            </button>
          }
          stageActions={
            <>
              <ToolbarGroup label="历史与缩放">
                <ToolbarButton label={undoLabel} icon={<Undo2 size={18} />} disabled={!canUndo} onClick={handleUndo} />
                <ToolbarButton label={redoLabel} icon={<Redo2 size={18} />} disabled={!canRedo} onClick={handleRedo} />
              </ToolbarGroup>
              <ToolbarButton label="刷新展示框位置" icon={<RefreshCw size={18} />} onClick={refreshDisplayFramePositions} />
            </>
          }
          projectActions={
            <>
              {projectId && <WorkbenchBackButton onClick={() => void handleBackToWorkbench()} />}
              {projectExportActions}
              <ToolbarGroup label="界面主题">
                <SkinSelector skin={skin} onChange={setSkin} />
<ThemeToggle mode={themeMode} resolvedTheme={resolvedTheme} onChange={setThemeMode} />
              </ToolbarGroup>
            </>
          }
        />
        <StudioEditorShell
          stage={activeStage}
          leftRail={
            <StudioLeftRail
              activeStage={activeStage}
              project={project}
              progress={workflowProgress}
              onChangeStage={handleWorkflowStageChange}
            />
          }
          rightRail={
            <DisplayFrameRail
              frame={displayFrame}
              onPatchStyle={(patch) => patchScene({ type: "cards" }, { displayFrame: { ...displayFrame, style: { ...displayFrame.style, ...patch } } })}
            />
          }
          rightRailLabel="展示框公共样式"
        >
          <DisplayFrameWorkspace
            cards={project.cards}
            userFonts={userFonts}
            onPatch={(patch) => patchScene({ type: "cards" }, patch)}
            onRefreshPositions={refreshDisplayFramePositions}
          />
        </StudioEditorShell>
        <StudioAssistantDrawer
          open={assistantDrawerOpen}
          onClose={() => setAssistantDrawerOpen(false)}
          label="AI 助手与高级功能"
        >
          {studioAssistantRail}
        </StudioAssistantDrawer>
      </div>
    );
  }

  if (activeStage === "export") {
    return (
      <div className="app-shell" data-editor-theme={resolvedTheme} data-editor-skin={skin}>
        <StudioTopbar
          assistantEntry={
            <button
              ref={assistantEntryRef}
              type="button"
              aria-label="打开AI助手与高级功能"
              aria-expanded={assistantDrawerOpen}
              onClick={() => setAssistantDrawerOpen(true)}
            >
              <Bot size={17} />
            </button>
          }
          projectActions={
            <>
              {projectId && <WorkbenchBackButton onClick={() => void handleBackToWorkbench()} />}
              {projectExportActions}
              <ToolbarGroup label="界面主题">
                <SkinSelector skin={skin} onChange={setSkin} />
<ThemeToggle mode={themeMode} resolvedTheme={resolvedTheme} onChange={setThemeMode} />
              </ToolbarGroup>
            </>
          }
        />
        <StudioEditorShell
          stage={activeStage}
          leftRail={
            <StudioLeftRail
              activeStage={activeStage}
              project={project}
              progress={workflowProgress}
              onChangeStage={handleWorkflowStageChange}
            />
          }
          rightRail={
            <DeliveryRail
              project={renderProject}
              dataIssues={dataIssues}
              layoutIssues={contentLayoutIssues}
              resourceIssues={resourceHealthIssues.filter((issue) => issue.kind === "resource")}
              fontIssues={resourceHealthIssues.filter((issue) => issue.kind === "font")}
              pngScale={pngScale}
              transparentExport={transparentExport}
              includeResources={includeResourcesInProjectExport}
              exportState={exportState}
              exportError={exportError}
              onPngScaleChange={setPngScale}
              onTransparentExportChange={setTransparentExport}
              onIncludeResourcesChange={setIncludeResourcesInProjectExport}
              onLocate={locateDeliveryIssue}
              onExportPng={() => void exportPng()}
              onExportSvg={exportSvg}
              onExportProjectPackage={exportProjectPackage}
              onRetry={retryLastExport}
            />
          }
          rightRailLabel="导出与检查"
        >
        <DeliveryWorkspace
          project={renderProject}
          posterRef={posterRef}
          userFonts={userFonts}
          dataIssues={dataIssues}
          layoutIssues={contentLayoutIssues}
          resourceIssues={resourceHealthIssues.filter((issue) => issue.kind === "resource")}
          fontIssues={resourceHealthIssues.filter((issue) => issue.kind === "font")}
          pngScale={pngScale}
          transparentExport={transparentExport}
          includeResources={includeResourcesInProjectExport}
          exportState={exportState}
          exportError={exportError}
          onPngScaleChange={setPngScale}
          onTransparentExportChange={setTransparentExport}
          onIncludeResourcesChange={setIncludeResourcesInProjectExport}
          onLocate={locateDeliveryIssue}
          onExportPng={() => void exportPng()}
          onExportSvg={exportSvg}
          onExportProjectPackage={exportProjectPackage}
          onRetry={retryLastExport}
        />
        </StudioEditorShell>
        <StudioAssistantDrawer
          open={assistantDrawerOpen}
          onClose={() => setAssistantDrawerOpen(false)}
          label="AI 助手与高级功能"
        >
          {studioAssistantRail}
        </StudioAssistantDrawer>
      </div>
    );
  }

  if (activeStage === "content" && !legacyEditorEnabled) {
    return (
      <div className="app-shell" data-editor-theme={resolvedTheme} data-editor-skin={skin}>
        <StudioTopbar
          assistantEntry={
            <button
              ref={assistantEntryRef}
              type="button"
              aria-label="打开AI助手与高级功能"
              aria-expanded={assistantDrawerOpen}
              onClick={() => setAssistantDrawerOpen(true)}
            >
              <Bot size={17} />
            </button>
          }
          stageActions={
            <>
              <ToolbarGroup label="历史与缩放">
                <ToolbarButton label={undoLabel} icon={<Undo2 size={18} />} disabled={!canUndo} onClick={handleUndo} />
                <ToolbarButton label={redoLabel} icon={<Redo2 size={18} />} disabled={!canRedo} onClick={handleRedo} />
              </ToolbarGroup>
              <ToolbarButton label="刷新展示框位置" icon={<RefreshCw size={18} />} onClick={refreshDisplayFramePositions} />
              <ToolbarButton label="返回地图样式" icon={<MapPinned size={18} />} onClick={() => {
                setActiveStage("map");
                setActivePanel("map");
              }} />
            </>
          }
          projectActions={
            <>
              {projectId && <WorkbenchBackButton onClick={() => void handleBackToWorkbench()} />}
              {projectExportActions}
              <ToolbarGroup label="界面主题">
                <SkinSelector skin={skin} onChange={setSkin} />
<ThemeToggle mode={themeMode} resolvedTheme={resolvedTheme} onChange={setThemeMode} />
              </ToolbarGroup>
            </>
          }
        />
        <StudioEditorShell
          stage={activeStage}
          leftRail={
            <StudioLeftRail
              activeStage={activeStage}
              project={project}
              progress={workflowProgress}
              onChangeStage={handleWorkflowStageChange}
            />
          }
          rightRail={
            <ContentLayoutRail
              project={renderProject}
              selection={selection}
              userAssets={userAssets}
              userFonts={userFonts}
              assetPanelProps={mapStyleAssetPanelProps}
              onPatch={patchScene}
              onReset={resetSceneTarget}
              onApplyFont={applyFont}
              onUploadFont={(font) => {
                setUserFonts((current) => [...current, font]);
                setStatusMessage(`已上传字体：${font.label}`);
              }}
              onDeleteUserFont={deleteUserFont}
            />
          }
          rightRailLabel="内容对象属性"
        >
        <ContentLayoutWorkspace
          project={renderProject}
          selection={selection}
          userAssets={userAssets}
          userFonts={userFonts}
          canUndo={canUndo}
          canRedo={canRedo}
          undoLabel={undoLabel}
          redoLabel={redoLabel}
          assetPanelProps={mapStyleAssetPanelProps}
          onSelect={handleSceneSelect}
          onPatch={patchScene}
          onReset={resetSceneTarget}
          onRefreshPositions={refreshDisplayFramePositions}
          onBackToMap={() => {
            setActiveStage("map");
            setActivePanel("map");
          }}
          onUndo={handleUndo}
          onRedo={handleRedo}
          selectedStudentId={selectedStudentId}
          onSelectStudent={setSelectedStudentId}
          onApplyFont={applyFont}
          onUploadFont={(font) => {
            setUserFonts((current) => [...current, font]);
            setStatusMessage(`已上传字体：${font.label}`);
          }}
          onDeleteUserFont={deleteUserFont}
          onMoveText={(id, x, y) => {
            const point = maybeSnap(x, y);
            commitProject(applyTransaction(project, createSceneTransaction({ type: "text", id }, point)));
          }}
          onMoveAsset={(id, x, y) => {
            const point = maybeSnap(x, y);
            const current = project.assetElements.find((asset) => asset.id === id);
            if (!current || (current.x === point.x && current.y === point.y)) return;
            commitProject(applyTransaction(project, createSceneTransaction({ type: "asset", id }, point)));
          }}
          onResizeAsset={(id, x, y, width, height) => {
            const point = maybeSnap(x, y);
            const current = project.assetElements.find((asset) => asset.id === id);
            if (!current || (current.x === point.x && current.y === point.y && current.width === width && current.height === height)) return;
            commitProject(applyTransaction(project, createSceneTransaction({ type: "asset", id }, { x: point.x, y: point.y, width, height })));
          }}
          onMoveProvinceTexture={(province, offsetX, offsetY) => {
            const appearance = project.map.provinceStyles?.[province]?.appearance;
            if (!appearance || appearance.kind === "manual-color") return;
            patchScene({ type: "province", province }, { appearance: { ...appearance, offsetX, offsetY } });
          }}
          onResizeMapImage={(alignment) => {
            const source = project.map.renderSource;
            if (source?.kind !== "image" || !source.alignment) return;
            patchScene({ type: "map" }, { renderSource: { ...source, alignment: { ...source.alignment, ...alignment } } });
          }}
          onCardPositionsResolved={captureCardPositions}
          onMoveCard={(id, x, y) => {
            const point = maybeSnap(x, y);
            commitProject(applyTransaction(project, {
              id: createId(`tx-card-position-${id}`),
              label: "调整数据框位置",
              source: "manual",
              apply: (current) => ({ ...current, cards: { ...current.cards, positions: { ...current.cards.positions, [id]: point } } }),
            }));
          }}
          onMoveGuests={(x, y) => {
            const point = maybeSnap(x, y);
            commitProject(applyTransaction(project, createSceneTransaction({ type: "guests" }, point)));
          }}
        />
        </StudioEditorShell>
        <StudioAssistantDrawer
          open={assistantDrawerOpen}
          onClose={() => setAssistantDrawerOpen(false)}
          label="AI 助手与高级功能"
        >
          {studioAssistantRail}
        </StudioAssistantDrawer>
      </div>
    );
  }

  if (globalSettingsSection) {
    return (
      <div className="app-shell" data-editor-theme={resolvedTheme} data-editor-skin={skin}>
        <header className="topbar">
          <div className="brand">
            <MapPinned size={24} />
            <span className="brand-label brand-label__full">蹭饭地图工作室</span>
            <span className="brand-label brand-label__compact" aria-hidden="true">蹭饭图</span>
            <em>Beta</em>
          </div>
          <div className="topbar-workflow">
            <WorkflowStageStepper activeId={activeStage} project={project} progress={workflowProgress} onChange={handleWorkflowStageChange} />
          </div>
          <div className="topbar-actions">
            {projectId && <WorkbenchBackButton onClick={() => void handleBackToWorkbench()} />}
          </div>
        </header>
        <GlobalSettingsScreen
        project={project}
        userFonts={userFonts}
        initialSection={globalSettingsSection}
        canUndo={canUndo}
        canRedo={canRedo}
        undoLabel={undoLabel}
        redoLabel={redoLabel}
        onClose={() => setGlobalSettingsSection(null)}
        onUndo={handleUndo}
        onRedo={handleRedo}
        onPatch={patchScene}
        onReset={resetSceneTarget}
        selectedStudentId={dataWorkspaceProps.selectedStudentId}
        onSelectStudent={dataWorkspaceProps.onSelectStudent}
        onChangeDataView={dataWorkspaceProps.onChangeDataView}
        onAppendStudents={dataWorkspaceProps.onAppendStudents}
        onReplaceStudents={dataWorkspaceProps.onReplaceStudents}
        onUpdateStudent={dataWorkspaceProps.onUpdateStudent}
        onToggleStudentVisibility={dataWorkspaceProps.onToggleVisibility}
        onDeleteStudent={dataWorkspaceProps.onDeleteStudent}
        onSetStudentsVisibility={dataWorkspaceProps.onSetStudentsVisibility}
        provinces={provinceNames}
        onApplyFont={applyFont}
        onUploadFont={(font) => {
          setUserFonts((current) => [...current, font]);
          setStatusMessage(`已上传字体：${font.label}`);
        }}
        onDeleteUserFont={deleteUserFont}
        workflowProgress={workflowProgress}
        workflowActiveStep={activeWorkflowStep}
        templates={(["original", "cartoon", "grain", "q", "scenery"] as const).map((templateId) => ({
          id: templateId,
          name: createSystemTemplate(templateId).name,
        }))}
        currentTemplateId={template}
        customTemplates={customTemplates.map(({ id, name, scope }) => ({ id, name, scope }))}
        onApplyTemplate={applySystemTemplate}
        onApplyCustomTemplate={(record) => {
          const full = customTemplates.find((item) => item.id === record.id);
          if (full) applyCustomTemplateRecord(full);
        }}
          onSaveTemplate={saveCurrentTemplate}
          onOpenGlobalData={openGlobalData}
          themeMode={themeMode}
          resolvedTheme={resolvedTheme}
          onThemeChange={setThemeMode}
          />
      </div>
    );
  }

  return (
    <main className="app-shell" data-editor-theme={resolvedTheme} data-editor-skin={skin}>
      <header className="topbar">
        <div className="brand">
          <MapPinned size={24} />
          <span className="brand-label brand-label__full">蹭饭地图工作室</span>
          <span className="brand-label brand-label__compact" aria-hidden="true">蹭饭图</span>
          <em>Beta</em>
        </div>
        <div className="topbar-workflow">
          <WorkflowStageStepper activeId={activeStage} project={project} progress={workflowProgress} onChange={handleWorkflowStageChange} />
          <div className="topbar-workflow__legacy" aria-hidden="true">
            <WorkflowStepper activeId={activePanel} progress={workflowProgress} onChange={handleWorkflowStepChange} />
          </div>
        </div>
        <div className="topbar-actions">
          {projectId && <WorkbenchBackButton onClick={() => void handleBackToWorkbench()} />}
          <ToolbarGroup label="历史与缩放">
            <ToolbarButton
              label={undoLabel}
              icon={<Undo2 size={18} />}
              disabled={!canUndo}
              onClick={handleUndo}
            />
            <ToolbarButton
              label={redoLabel}
              icon={<Redo2 size={18} />}
              disabled={!canRedo}
              onClick={handleRedo}
            />
            <span className="zoom-label" aria-label="当前缩放">{zoomPercent}%</span>
            <ToolbarButton
              label="缩小画布"
              icon={<ZoomOut size={17} />}
              onClick={() => setZoomPercent((value) => Math.max(25, value - 10))}
            />
            <ToolbarButton
              label="放大画布"
              icon={<ZoomIn size={17} />}
              onClick={() => setZoomPercent((value) => Math.min(300, value + 10))}
            />
          </ToolbarGroup>

          <ToolbarGroup label="属性面板" className="inspector-toggle-group">
            <ToolbarButton
              className="inspector-toggle"
              label={mobileInspectorOpen ? "关闭属性面板" : "打开属性面板"}
              icon={mobileInspectorOpen ? <PanelRightClose size={17} /> : <PanelRight size={17} />}
              aria-expanded={mobileInspectorOpen}
              aria-controls="editor-inspector"
              onClick={() => setMobileInspectorOpen((open) => !open)}
            />
          </ToolbarGroup>

          <ToolbarGroup label="界面主题">
            <SkinSelector skin={skin} onChange={setSkin} />
            <ThemeToggle mode={themeMode} resolvedTheme={resolvedTheme} onChange={setThemeMode} />
          </ToolbarGroup>

          {projectExportActions}

          <ToolbarGroup label="导出">
            <button className="primary-button" onClick={exportPng} disabled={exportingPng}>
              <ImageDown size={16} /> {exportingPng ? "导出中..." : "导出 PNG"}
            </button>
          </ToolbarGroup>
        </div>
      </header>


      {showProjectExportDialog && (
        <div className="dialog-backdrop" onMouseDown={() => setShowProjectExportDialog(false)}>
          <section
            className="export-project-dialog"
            role="dialog"
            aria-modal="true"
            aria-label="导出工程确认"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <header>
              <div>
                <h2>确认导出工程</h2>
                <p>工程文件会保存当前画布、名单、模板和渲染设置。</p>
              </div>
              <button type="button" aria-label="关闭导出工程确认" onClick={() => setShowProjectExportDialog(false)}>×</button>
            </header>
            <label className="export-resource-option boolean-control checkbox-row">
              <input
                type="checkbox"
                aria-label="导出时包含资源包"
                checked={includeResourcesInProjectExport}
                onChange={(event) => setIncludeResourcesInProjectExport(event.target.checked)}
              />
              <span>
                <strong>包含资源包</strong>
                <small>一并打包地图背景、地图贴图、素材和字体；导入后会立刻同步到画布与素材库。</small>
              </span>
            </label>
            {!includeResourcesInProjectExport && (
              <p className="export-resource-warning">未包含资源包时，其他设备可能缺少素材库条目和自定义字体。</p>
            )}
            <footer>
              <button type="button" className="secondary-button" onClick={() => setShowProjectExportDialog(false)}>取消</button>
              <button type="button" className="primary-button" aria-label="确认导出工程" onClick={exportProjectPackage}>确认导出</button>
            </footer>
          </section>
        </div>
      )}

      <section
        className="workspace"
        style={workspaceStyle}
        data-editor-resizing={resizingPanel ? "true" : undefined}
        data-resizing-panel={resizingPanel ?? undefined}
      >
        <aside className="sidebar studio-sidebar">
          <div className="studio-sidebar__rail">{studioAssistantRail}</div>

          <div className="studio-sidebar__panel">
          {activePanel === "roster" && (
            <div className="panel-content workflow-panel workflow-panel--roster">
              <div className="panel-heading"><span>名单检查</span><small>{project.students.length} 条记录</small></div>
              <DataWorkspace {...dataWorkspaceProps} />
            </div>
          )}

          {activePanel === "map" && (
            <div className="panel-content workflow-panel workflow-panel--map">
              <div className="panel-heading"><span>地图表达</span><small>选择读图方式</small></div>
              <SegmentedControl
                label="地图表达"
                activeId={dataView}
                items={dataViews.map((view) => ({ id: view.id, label: view.name.replace("卡片", ""), ariaLabel: `${view.name}：${view.description}` }))}
                onChange={(view) => commitProjectTransaction({ id: createId(`tx-data-view-${view}`), label: `切换数据呈现：${view}`, source: "manual", apply: (current) => applyDataViewChange(current, view) })}
                className="workflow-data-views"
              />
              <MapInspector map={project.map} mode="global" collapsible onPatch={(patch) => patchScene({ type: "map" }, patch)} onReset={() => resetSceneTarget({ type: "map" })} />
            </div>
          )}

          {activePanel === "layout" && (
            <div className="panel-content">
              <div className="panel-heading">
                <span>内置模板</span>
                <small>应用整套地图元素</small>
              </div>
              <div className="template-grid" aria-label="内置整体模板">
                {(["original", "cartoon", "grain", "q", "scenery"] as const).map((templateId) => {
                  const template = createSystemTemplate(templateId);
                  return <button
                    key={templateId}
                    type="button"
                    className={`template-card ${project.templateId === templateId ? "selected" : ""}`}
                    onClick={() => applySystemTemplate(templateId)}
                  >
                    <span className={`template-card__preview template-card__preview--${templateId}`} />
                    <strong>{template.name}</strong>
                  </button>;
                })}
              </div>
              <button className="wide-button" type="button" onClick={saveCurrentTemplate}><Save size={16} /> 保存当前整体模板</button>

              {customTemplates.length > 0 && (
                <>
                  <div className="panel-heading data-heading">
                    <span>我的模板</span>
                    <small>{customTemplates.length}</small>
                  </div>
                  <div className="view-list">
                    {customTemplates.map((item) => (
                      <button
                        key={item.id}
                        onClick={() => applyCustomTemplateRecord(item)}
                      >
                        <strong>{item.name}</strong>
                        <span>
                          {item.scope === "visual" ? "视觉样式" : "布局倾向"} ·{" "}
                          {item.baseTemplateId}
                        </span>
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}


          {activePanel === "assets" && (
            <div className="panel-content">
              <AssetPanel
                instances={project.assetElements
                  .filter((element) => element.kind !== "province-texture")
                  .map((element) => ({
                    id: element.id,
                    assetId: element.assetId,
                    label: element.label,
                    kind: element.kind,
                  }))}
                provinces={provinceNames}
                dataProvinces={summary.map((item) => item.province)}
                selectedProvince={selection.type === "province" ? selection.province : ""}
                selectedProvinceStyle={selection.type === "province" ? project.map.provinceStyles?.[selection.province] : undefined}
                provinceStyles={project.map.provinceStyles}
                provinceAdjacency={CHINA_PROVINCE_ADJACENCY}
                mapBaseColor={project.map.landColor}
                posterBackground={project.canvas.backgroundColor}
                provinceTextureUniformSize={project.map.provinceTextureUniformSize}
                userAssets={userAssets}
                assetUsageById={assetUsageById}
                onPatchProvinceTextureUniformSize={(provinceTextureUniformSize) => {
                  patchScene({ type: "map" }, { provinceTextureUniformSize });
                }}

                onSelectProvince={(province) => {
                  if (province) {
                    setSelection({ type: "province", province });
                    setActivePanel("assets");
                  }
                }}
                onSelectInstance={(id) => setSelection({ type: "asset", id })}
                onApplyBackground={(asset) => {
                  commitProject(
                    applyTransaction(project, {
                      id: createId("tx-bg"),
                      label: `应用背景：${asset.label}`,
                      source: "manual",
                      apply: (current) => ({
                        ...current,
                        canvas: {
                          ...current.canvas,
                          backgroundImageSrc: asset.src,
                        },
                        style: {
                          ...current.style,
                          backgroundImageSrc: asset.src,
                        },
                      }),
                    }),
                  );
                }}
                onCreateLandmark={(asset) => {
                  const selectedProvince = selection.type === "province" ? selection.province : "";
                  const element = createLandmarkElement(asset, selectedProvince || "全国", {
                    x: project.map.x + project.map.width / 2 - 60,
                    y: project.map.y + project.map.height / 2 - 60,
                  });
                  commitProject(
                    applyTransaction(project, {
                      id: createId("tx-landmark"),
                      label: `添加地标：${asset.label}`,
                      source: "manual",
                      apply: (current) => ({
                        ...current,
                        assetElements: [...current.assetElements, element],
                      }),
                    }),
                  );
                  setSelection({ type: "asset", id: element.id });
                }}
                onCreateDecoration={(asset) => {
                  const element = createDecorationElement(asset, {
                    x: project.canvas.width - 180,
                    y: project.canvas.height - 180,
                  });
                  commitProject(
                    applyTransaction(project, {
                      id: createId("tx-decoration"),
                      label: `添加装饰：${asset.label}`,
                      source: "manual",
                      apply: (current) => ({
                        ...current,
                        assetElements: [...current.assetElements, element],
                      }),
                    }),
                  );
                  setSelection({ type: "asset", id: element.id });
                }}
                onApplyProvinceAppearance={(province, appearance: ProvinceAppearance, fill?: string) => {
                  try {
                    setSelection({ type: "province", province });
                    setActivePanel("assets");
                    patchScene({ type: "province", province }, { appearance, ...(fill ? { fill } : {}) });
                    setStatusMessage(`已应用到地图：${province}`);
                  } catch (error) {
                    setStatusMessage(error instanceof Error ? error.message : "应用省份贴图失败");
                  }
                }}
                onApplyProvinceThemes={(themeResults: Record<string, ImageThemeResult>) => {
                  const entries = Object.entries(themeResults);
                  if (entries.length === 0) return;
                  const transaction = createProvinceThemeTransaction(themeResults);
                  commitProjectTransaction({
                    ...transaction,
                    apply: (current) => ({ ...transaction.apply(current), cards: freezeCardPositionsForMapChange(current) }),
                  });
                  setStatusMessage(`已应用 ${entries.length} 个省份智能底色`);
                }}
                onResetProvinceAppearance={(province) => {
                  try {
                    setSelection({ type: "province", province });
                    setActivePanel("assets");
                    patchScene({ type: "province", province }, { appearance: undefined, fill: undefined, textureSrc: undefined });
                    setStatusMessage(`已恢复系统默认：${province}`);
                  } catch (error) {
                    setStatusMessage(error instanceof Error ? error.message : "恢复省份外观失败");
                  }
                }}
                onAddUserAsset={addUserAsset}
                onReplaceUserAsset={replaceUserAsset}
                onDeleteUserAsset={deleteUserAsset}
                onExportResourcePack={exportResourcePack}
                onImportResourcePack={importResourcePack}
              />
            </div>
          )}

          {activePanel === "deliver" && (
            <div className="panel-content workflow-panel workflow-panel--deliver">
              <div className="panel-heading"><span>交付检查</span><small>{exportWarnings.unresolvedStudents.length || exportWarnings.hiddenStudents.length ? "需检查" : "可以导出"}</small></div>
              <div className="workflow-delivery-checks">
                <div><strong>{project.students.length}</strong><span>名单记录</span></div>
                <div><strong>{summary.length}</strong><span>目的省市</span></div>
              </div>
              {exportWarnings.unresolvedStudents.length > 0 && <p className="panel-note">{exportWarnings.unresolvedStudents.length} 个城市未匹配，可返回「名单」修正。</p>}
              {exportWarnings.hiddenStudents.length > 0 && <p className="panel-note">{exportWarnings.hiddenStudents.length} 条记录已隐藏，不会出现在海报中。</p>}
              <ActionGroup label="交付操作" className="workflow-delivery-actions">
                <button className="wide-button workflow-export-button" type="button" onClick={() => void exportPng()} disabled={exportingPng}><ImageDown size={16} />{exportingPng ? "导出中..." : "导出 PNG"}</button>
                <CompactButton icon={<Download size={14} aria-hidden />} onClick={exportSvg}>导出 SVG</CompactButton>
                <CompactButton icon={<Save size={14} aria-hidden />} onClick={() => void overwriteBrowserStorage()} disabled={syncState.status === "saving"}>保存到本机</CompactButton>
                <CompactButton icon={<PackageOpen size={14} aria-hidden />} onClick={openProjectExportDialog}>导出工程</CompactButton>
              </ActionGroup>
            </div>
          )}

          {activePanel === "content" && (
            <div className="panel-content workflow-panel workflow-panel--content">
              <>
                  <div className="panel-heading">
                    <span>画布元素</span>
                    <small>可编辑图层</small>
                  </div>
                  <ActionGroup label="添加画布元素" className="content-add-actions">
                    <CompactButton icon={<Plus size={14} aria-hidden />} onClick={addText}>添加文本框</CompactButton>
                    <CompactButton icon={<Plus size={14} aria-hidden />} onClick={addNote}>添加特别备注</CompactButton>
                  </ActionGroup>

                  <div className="element-list" role="list" aria-label="画布图层">
                    {STYLE_LAYER_TARGETS.map((target) => {
                      const selected = target.type === "text"
                        ? selection.type === "text" && selection.id === target.id
                        : selection.type === target.type;
                      const dotClass = target.type === "text"
                        ? (target.id === "text-title" ? "title-dot" : "subtitle-dot")
                        : target.type === "map"
                          ? "map-dot"
                          : target.type === "cards"
                            ? "cards-dot"
                            : target.type === "guests"
                              ? "guests-dot"
                              : "canvas-dot";
                      return (
                        <button
                          key={target.label}
                          type="button"
                          role="listitem"
                          className={selected ? "is-active" : undefined}
                          aria-pressed={selected}
                          onClick={() => selectStyleLayer(target)}
                        >
                          <span className={`layer-dot ${dotClass}`} />
                          {target.label}
                        </button>
                      );
                    })}
                  </div>
                  <p className="panel-note">点击图层可在右侧打开对应属性面板；数据卡片会同时切换到「板块」页。可管理画布、标题、地图、卡片与特邀嘉宾。</p>
                  <p className="panel-note">
                    当前模板参数：scale {resolvedTemplate.map.scale.toFixed(2)} ·{" "}
                    {resolvedTemplate.cards.preset} · 字段{" "}
                    {resolvedTemplate.visibleFields.join("/")}
                  </p>
                </>
            </div>
          )}
          </div>
        </aside>

        <section className="editor-area">
          <div className="canvas-stage" ref={stageRef}>
            <div
              className="canvas-zoom-shell"
              style={{
                width: Math.round(project.canvas.width * zoomPercent / 100),
                height: Math.round(project.canvas.height * zoomPercent / 100),
              }}
            >
              <div
                className="canvas-zoom-inner"
                style={{
                  width: project.canvas.width,
                  height: project.canvas.height,
                  transform: `scale(${zoomPercent / 100})`,
                  transformOrigin: "top left",
                }}
              >
                <PosterCanvas
                  project={renderProject}
                  posterRef={posterRef}
                  selectedTextId={selectedTextId}
                  selectedAssetId={selection.type === "asset" ? selection.id : null}
                  selectedProvince={selection.type === "province" ? selection.province : null}
                  userFonts={userFonts}
                  showGrid={showGrid}
                  gridSize={gridSize}
                  renderIntervalMs={resolvedRenderInterval}
                  onSelect={handleLegacySceneSelect}
                  onMoveText={(id, x, y) => {
                    const point = maybeSnap(x, y);
                    commitProject(
                      applyTransaction(project, createSceneTransaction({ type: "text", id }, point)),
                    );
                  }}
                  onMoveAsset={(id, x, y) => {
                    const point = maybeSnap(x, y);
                    const current = project.assetElements.find((asset) => asset.id === id);
                    if (!current || (current.x === point.x && current.y === point.y)) return;
                    commitProject(
                      applyTransaction(project, createSceneTransaction({ type: "asset", id }, point)),
                    );
                  }}
                  onResizeAsset={(id, x, y, width, height) => {
                    const point = maybeSnap(x, y);
                    const current = project.assetElements.find((asset) => asset.id === id);
                    if (!current || (current.x === point.x && current.y === point.y && current.width === width && current.height === height)) return;
                    commitProject(
                      applyTransaction(project, createSceneTransaction({ type: "asset", id }, { x: point.x, y: point.y, width, height })),
                    );
                  }}
                  mapSelected={selection.type === "map"}
                  onMoveProvinceTexture={(province, offsetX, offsetY) => {
                    const appearance = project.map.provinceStyles?.[province]?.appearance;
                    if (!appearance || appearance.kind === "manual-color") return;
                    patchScene({ type: "province", province }, { appearance: { ...appearance, offsetX, offsetY } });
                  }}
                  onResizeMapImage={(alignment) => {
                    const rs = project.map.renderSource;
                    if (rs?.kind !== "image" || !rs.alignment) return;
                    patchScene({ type: "map" }, { renderSource: { ...rs, alignment: { ...rs.alignment, ...alignment } } });
                  }}
                  onCardPositionsResolved={captureCardPositions}
                  selectedStudentId={selectedStudentId}
                  onSelectStudent={setSelectedStudentId}
                  onMoveCard={(id, x, y) => {
                    const point = maybeSnap(x, y);
                    commitProject(
                      applyTransaction(project, {
                        id: createId(`tx-card-position-${id}`),
                        label: "调整数据框位置",
                        source: "manual",
                        apply: (current) => ({
                          ...current,
                          cards: { ...current.cards, positions: { ...current.cards.positions, [id]: point } },
                        }),
                      }),
                    );
                  }}
                  onMoveGuests={(x, y) => {
                    const point = maybeSnap(x, y);
                    commitProject(
                      applyTransaction(project, createSceneTransaction({ type: "guests" }, point)),
                    );
                  }}
                />
              </div>
            </div>
          </div>
        </section>

        <aside id="editor-inspector" className={`inspector${mobileInspectorOpen ? " is-open" : ""}`}>
          <InspectorPanel
            project={renderProject}
            selection={selection}
            userFonts={userFonts}
            onPatch={patchScene}
            onReset={resetSceneTarget}
            onDeleteText={removeText}
            onDeleteAsset={removeAsset}
            onDuplicateAsset={duplicateAsset}
            onLayerChange={changeAssetLayer}
            onAddUserAsset={addUserAsset}
            provinces={provinceNames}
            onOpenGlobalSettings={setGlobalSettingsSection}
            onApplyFont={applyFont}
            onUploadFont={(font) => {
              setUserFonts((current) => [...current, font]);
              setStatusMessage(`已上传字体：${font.label}`);
            }}
            onDeleteUserFont={deleteUserFont}

          />
          <details className="project-summary">
            <summary>项目摘要</summary>
            <div className="summary-number"><strong>{students.length}</strong><span>学生</span></div>
            <div className="summary-number"><strong>{summary.length}</strong><span>目的省市</span></div>
            <p>{dataViews.find((view) => view.id === dataView)?.description}</p>
            <p>已记录 {project.history.past.length} 步，可重做 {project.history.future.length} 步。</p>
            <div className="status" data-sync-status={syncState.status}>
              <span />
              {syncState.status === "saving" ? "正在覆盖本地数据" : syncState.status === "saved" ? "全部数据已保存" : syncState.status === "failed" ? "本地保存失败" : "有未保存修改"}
            </div>
            <p className="panel-note">
              本地：仅点击强制保存时覆盖本地数据
              {syncState.savedAt && ` · ${new Date(syncState.savedAt).toLocaleTimeString("zh-CN", { hour12: false })}`}
            </p>
            {statusMessage && <p className="panel-note">{statusMessage}</p>}
          </details>
        </aside>

        <ResizablePanelDivider
          side="sidebar"
          value={panelLayout.sidebarWidth}
          min={sidebarBounds.min}
          max={sidebarBounds.max}
          ariaLabel="调整左侧栏宽度"
          onChange={(value) => updatePanelWidth("sidebar", value)}
          onResizeStart={() => setResizingPanel("sidebar")}
          onResizeEnd={() => setResizingPanel(null)}
        />
        <ResizablePanelDivider
          side="inspector"
          value={panelLayout.inspectorWidth}
          min={inspectorBounds.min}
          max={inspectorBounds.max}
          ariaLabel="调整右侧栏宽度"
          onChange={(value) => updatePanelWidth("inspector", value)}
          onResizeStart={() => setResizingPanel("inspector")}
          onResizeEnd={() => setResizingPanel(null)}
        />
      </section>
    </main>
  );
}

export function App({ projectId }: { projectId?: string }) {
  return <AssistantConversationProvider><StudioApp projectId={projectId} /></AssistantConversationProvider>;
}
