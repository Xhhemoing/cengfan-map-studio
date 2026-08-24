import {
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
} from "lucide-react";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { createNoteElement, createTextElement } from "./lib/canvas-data";
import {
  loadInitialProject,
  loadBrowserValue,
} from "./lib/app-initialization";
import { CHINA_PROVINCE_ADJACENCY } from "./lib/map-data";
import {
  provinceNames,
  dataViews,
  type ActivePanel,
} from "./lib/app-constants";
import {
  buildProvinceSummary,
  type DataViewId,
  type MapTemplateId,
  type Student,
} from "./lib/project-data";
import {
  appendStudentsTransaction,
  changeDataViewTransaction,
  deleteStudentTransaction,
  replaceStudentsTransaction,
  setStudentsVisibilityTransaction,
  toggleStudentVisibilityTransaction,
  updateStudentTransaction,
  type StudentPatch,
} from "./lib/student-transactions";
import { createId } from "./lib/ids";
import {
  addAssetElementTransaction,
  addNoteElementTransaction,
  addTextElementTransaction,
  applyBackgroundAssetTransaction,
  applyCustomTemplateTransaction,
  applyFontTransaction,
  applySystemTemplateTransaction,
  deleteAssetElementTransaction,
  deleteTextElementTransaction,
  duplicateAssetElementTransaction,
  moveCardTransaction,
  refreshDisplayFramePositionsTransaction,
  replaceAssetElementSourceTransaction,
  sceneResetPatch,
} from "./lib/canvas-edit-transactions";
import {
  addAssetToLibrary,
  buildAssetUsageLabels,
  describeAssetRemoval,
  describeFontRemoval,
  EMPTY_ASSET_MESSAGE,
  mergeImportedResourcePack,
  prepareResourcePackExport,
  replaceAssetInLibrary,
} from "./lib/resource-library";
import {
  resolveDeliveryIssueNavigation,
  resolveLayoutIssueSelection,
  resolveWorkflowPanelNavigation,
  resolveWorkflowStageNavigation,
  styleLayerSelection,
} from "./lib/editor-navigation";
import {
  loadStoredRenderSettings,
  mountUserFontFaces,
  nextWorkspaceSession,
} from "./lib/editor-chrome";
import { resolveRenderedTemplate } from "./lib/rendered-template";
import { editorProjectStore } from "./lib/editor-project-store";
import {
  resolveMissingProjectNotice,
  type MissingProjectObservation,
} from "./lib/missing-project-notice";

import { AssistantConversationProvider } from "./components/AgentAssistant";
import { ProjectMenu } from "./components/ProjectMenu";
import { WorkbenchBackButton } from "./components/WorkbenchBackButton";
import { WorkflowStageStepper } from "./components/WorkflowStageStepper";
import { StudioLayoutTemplate, type StageSlots } from "./components/StudioLayoutTemplate";
import { StudioAssistantRail } from "./components/StudioAssistantRail";

import { AssetPanel } from "./components/AssetPanel";
import { DataWorkspace } from "./components/DataWorkspace";
import "./components/workflow-workspaces.css";
import { GlobalSettingsScreen, type GlobalSettingsSection } from "./components/GlobalSettingsScreen";
import { DataUploadRail, DataUploadWorkspace } from "./components/workspaces/DataUploadWorkspace";
import { MapStyleRail, MapStyleWorkspace } from "./components/workspaces/MapStyleWorkspace";
import { ReferenceCardStyleWorkspace } from "./components/workspaces/ReferenceCardStyleWorkspace";
import { ContentLayoutRail, ContentLayoutWorkspace, type ContentAssetPanelProps } from "./components/workspaces/ContentLayoutWorkspace";
import { DeliveryRail, DeliveryWorkspace, type DeliveryIssue } from "./components/workspaces/DeliveryWorkspace";

import { ActionGroup, CompactButton, SegmentedControl, ToolbarButton, ToolbarGroup } from "./components/StudioUi";
import { CardsInspector } from "./components/inspector/CardsInspector";
import { ZoomControls } from "./components/ZoomControls";
import { WorkflowStepper, type WorkflowPanelId } from "./components/WorkflowStepper";
import {
  WORKFLOW_STAGE_TO_LEGACY_PANEL,
  deriveWorkflowStageProgress,
  type WorkflowStageId,
} from "./lib/workflow-stages";
import { deriveStageOverviewModel, type StageOverviewAction } from "./lib/stage-overview";
import { STAGE_METADATA } from "./lib/stage-metadata";
import { LEGACY_EDITOR_STORAGE_KEY, loadWorkspaceSession, saveWorkspaceSession } from "./lib/workspace-session";
import { ThemeToggle } from "./components/ThemeToggle";
import { SkinSelector } from "./components/SkinSelector";
import { ResizablePanelDivider } from "./components/ResizablePanelDivider";
import { buildDataHealthSummary, listDataIssues } from "./lib/data-health";
import { computeWorkflowProgress, listStudentWarnings, type WorkflowStepId } from "./lib/workflow-progress";
import { describeHistoryActions, matchEditorHistoryShortcut } from "./lib/editor-history";
import {
  previewEditorCommands,
  type EditorCommand,
} from "./lib/editor-commands";
import {
  applyTransaction,
  createProjectDocument,
  redoTransaction,
  undoTransaction,
  type ProjectDocument,
  type ProjectTransaction,
} from "./lib/project-document";
import {
  removeUserAsset,
  removeUserFont,
  STYLE_LAYER_TARGETS,
} from "./lib/catalog-usage";

import { createSystemTemplate } from "./lib/template-document";
import {
  loadCustomTemplates,
  type CustomTemplateRecord,
} from "./lib/template-store";
import { captureCustomTemplate, withCapturedTemplate } from "./lib/template-capture";
import {
  createDecorationElement,
  createLandmarkElement,
  duplicateAssetElement,
} from "./lib/asset-elements";
import { PosterCanvas } from "./components/canvas/PosterCanvas";
import { type ProvinceAppearance, type SceneSelection } from "./lib/scene-document";

import { createProvinceThemeTransaction, createSceneTransaction } from "./lib/inspector-operations";
import { InspectorPanel } from "./components/inspector/InspectorPanel";
import { MapInspector } from "./components/inspector/MapInspector";
import {
  ensureUserFontsLoaded,
  loadUserFonts,
  type UserFont,
} from "./lib/fonts";
import {
  loadUserAssets,
  type StudioAsset,
  type UserAsset,
} from "./lib/assets";
import { downloadResourcePack } from "./lib/resource-pack";
import {
  createProjectPackageEnvelope,
  restoreProjectPackage,
  type ProjectPackage,
} from "./lib/project-package";
import { usePosterExport } from "./lib/usePosterExport";
import { type TypographyTarget } from "./lib/typography";
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
import { buildProjectLayoutHealthInput } from "./lib/layout-health-input";
import { listResourceHealthIssues } from "./lib/resource-health";

import {
  DEFAULT_GRID_SIZE,
  fitZoomPercent,
  snapPoint,
} from "./lib/grid";
import { renderIntervalMs, type RenderSettings } from "./lib/render-settings";
import {
  createBrowserWorkspaceStores,
  loadBrowserWorkspaceMirror,
} from "./lib/browser-workspace-store";
import type { LocalWorkspaceOverwriteState } from "./lib/incremental-workspace-sync";
import {
  createWorkspaceSync,
  describeForceSaveOutcome,
  loadAdoptableWorkspace,
  loadStoredProject,
  shouldSaveOnPageLeave,
  subscribePageLeave,
} from "./lib/editor-workspace-persistence";
import {
  armCollaborationSend,
  createCollaborationHealTracker,
} from "./lib/collaboration-send";
import { useCollaborationRoom, type UseCollaborationRoomRefs } from "./lib/useCollaborationRoom";

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
  const [customTemplates, setCustomTemplates] = useState<CustomTemplateRecord[]>(() =>
    initialWorkspace?.customTemplates ?? (typeof window === "undefined" ? [] : loadBrowserValue(() => loadCustomTemplates(), [])),
  );
  const [statusMessage, setStatusMessage] = useState(initialWorkspace ? "已从本地完整镜像恢复工作区" : "仅在点击强制保存时写入本地");
  const [projectMissing, setProjectMissing] = useState<MissingProjectObservation | null>(null);
  const [projectLoading, setProjectLoading] = useState(() => Boolean(projectId));
  // projectId 变更(如浏览器前进/后退直达另一项目)时,在渲染期同步重置加载/缺失状态,
  // 让加载壳在 get() 完成前一直显示,避免旧项目数据被编辑后误存到新项目记录。
  // 该 setState 位于渲染期(非 effect 内),是 React 文档认可的"根据先前渲染调整状态"模式。
  const [prevProjectId, setPrevProjectId] = useState(projectId);
  if (prevProjectId !== projectId) {
    setPrevProjectId(projectId);
    setProjectLoading(Boolean(projectId));
    setProjectMissing(null);
  }
  const [userFonts, setUserFonts] = useState<UserFont[]>(() =>
    initialWorkspace?.fonts ?? (typeof window === "undefined" ? [] : loadBrowserValue(() => loadUserFonts(), [])),
  );
  const [userAssets, setUserAssets] = useState<UserAsset[]>(() =>
    initialWorkspace?.assets ?? (typeof window === "undefined" ? [] : loadBrowserValue(() => loadUserAssets(), [])),
  );
  const [showGrid] = useState(false);
  const [gridSize] = useState(DEFAULT_GRID_SIZE);
  const [renderSettings, setRenderSettings] = useState<RenderSettings>(() => initialWorkspace
    ? initialWorkspace.renderSettings
    : loadStoredRenderSettings(() => typeof window === "undefined" ? null : window.localStorage));
  const [zoomPercent, setZoomPercent] = useState(100);
  const [collaborationClientId] = useState(() => createId("collab-client"));

  const projectIdRef = useRef<string | null>(projectId ?? null);
  const projectNameRef = useRef<string | null>(null);
  const projectCreatedAtRef = useRef<string>(new Date(0).toISOString());
  const projectRecordSaveErrorRef = useRef<string | null>(null);
  const backNavigatingRef = useRef(false);
  const hasLocalWorkspaceEditsRef = useRef(false);
  // saveLocal 只在事件处理器(强制保存按钮)经 LocalWorkspaceOverwrite.drain() 触发,属于渲染期之后;
  // 此处 ref 读取发生在保存时刻而非渲染期,react-hooks/refs 无法穿透类间接层,故按行豁免。
  // eslint-disable-next-line react-hooks/refs
  const [workspaceSync] = useState(() => createWorkspaceSync({
    stores: browserStores,
    projectStore: editorProjectStore,
    record: {
      idRef: projectIdRef,
      nameRef: projectNameRef,
      createdAtRef: projectCreatedAtRef,
      saveErrorRef: projectRecordSaveErrorRef,
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
  // 房间控制器与送出侧共享同一组 ref:两边各持一份的话,基线与版本会立刻分叉。
  const collaborationRefs: UseCollaborationRoomRefs = {
    baselineRef: collaborationBaselineRef,
    versionRef: collaborationVersionRef,
    roomRef: collaborationRoomRef,
    accessTokenRef: collaborationAccessTokenRef,
    suppressSendRef: suppressCollaborationSendRef,
    backfillInFlightRef,
  };

  const posterRef = useRef<SVGSVGElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [activePanel, setActivePanel] = useState<ActivePanel>(() => WORKFLOW_STAGE_TO_LEGACY_PANEL[workspaceSession.stage] ?? "roster");
  const [legacyEditorEnabled] = useState(() => typeof window !== "undefined"
    && loadBrowserValue(() => window.localStorage.getItem(LEGACY_EDITOR_STORAGE_KEY) === "1", false));
  const [activeStage, setActiveStage] = useState<WorkflowStageId>(() => legacyEditorEnabled ? "content" : workspaceSession.stage);
  const lastNonTemplateStageRef = useRef<WorkflowStageId>(activeStage === "data" ? "content" : activeStage);
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
    saveWorkspaceSession(storage, nextWorkspaceSession(workspaceSession, { stage: activeStage, selection }));
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
    mountUserFontFaces(userFonts);
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

  const selectedTextId = selection.type === "text" ? selection.id : null;
  const summary = buildProvinceSummary(students);
  const resolvedTemplate = useMemo(() => resolveRenderedTemplate(renderProject), [renderProject]);

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

  const applyRestoredWorkspace = (restored: ProjectPackage) => {
    workspaceHydratedRef.current = true;
    skipNextWorkspacePendingRef.current = true;
    setProject(restored.project);
    setUserAssets(restored.assets);
    setUserFonts(restored.fonts);
    setCustomTemplates(restored.customTemplates);
    setRenderSettings(restored.renderSettings);
    setPreviewCommands([]);
  };

  useEffect(() => {
    if (projectId) return; // 项目模式以 IndexedDB 中的项目为准,不覆盖浏览器本地镜像
    let cancelled = false;
    void loadAdoptableWorkspace({
      stores: browserStores,
      initialExportedAt: initialWorkspace?.exportedAt,
      hasLocalEdits: () => hasLocalWorkspaceEditsRef.current,
    }).then((pack) => {
      if (cancelled || !pack) return;
      applyRestoredWorkspace(restoreProjectPackage(pack));
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
    void loadStoredProject(editorProjectStore, projectId).then((outcome) => {
      if (cancelled) return;
      // 渲染期已重置缺失状态;此处仅收尾加载状态(渲染期 setState 也会在加载完成前触发重渲染)。
      setProjectMissing(null);
      setProjectLoading(false);
      if (outcome.status === "missing") {
        setProjectMissing(outcome.observation);
        return;
      }
      projectNameRef.current = outcome.record.name;
      projectCreatedAtRef.current = outcome.record.createdAt;
      applyRestoredWorkspace(outcome.restored);
      setStatusMessage(`已打开项目「${outcome.record.name}」`);
    });
    return () => { cancelled = true; };
  }, [projectId]);

  const currentCollaborationPackage = (exportedAt = new Date().toISOString()): ProjectPackage => {
    const pack = createProjectPackageEnvelope(latestWorkspaceRef.current);
    return { ...pack, exportedAt, project: { ...pack.project, history: { past: [], future: [] } } };
  };

  const applySharedPackage = (pack: ProjectPackage, _version: number): ProjectPackage => {
    const restored = restoreProjectPackage(pack);
    setProject((current) => ({ ...restored.project, history: current.history, version: current.version + 1 }));
    setUserAssets(restored.assets);
    setUserFonts(restored.fonts);
    setCustomTemplates(restored.customTemplates);
    setRenderSettings(restored.renderSettings);
    setPreviewCommands([]);
    workspaceSync.markPending();
    return restored;
  };

  const collaboration = useCollaborationRoom({
    clientId: collaborationClientId,
    currentPackage: currentCollaborationPackage,
    applyPackage: applySharedPackage,
    ...collaborationRefs,
  });

  /**
   * 卸载之后 ref 还活着,但组件已经不在树上:在途上传的回执既不能改基线,也不能再
   * 对着卸载的树 setState。StrictMode 会先卸载再重挂,所以每次挂载都要重新置位。
   */
  const collaborationMountedRef = useRef(true);
  useEffect(() => {
    collaborationMountedRef.current = true;
    return () => {
      collaborationMountedRef.current = false;
    };
  }, []);

  // 愈合探测只置位标记、不额外触发渲染:它的两个信号同时也是送出 effect 的依赖,而
  // effect 按声明顺序执行,标记在同一次 commit 里先于送出 effect 就绪。
  const [collaborationHeal] = useState(createCollaborationHealTracker);
  useEffect(() => {
    collaborationHeal.observe({
      roomId: collaboration.roomId,
      connectionHealCount: collaboration.connectionHealCount,
      roomVersion: collaboration.roomVersion,
    });
  }, [collaborationHeal, collaboration.connectionHealCount, collaboration.roomId, collaboration.roomVersion]);

  useEffect(() => armCollaborationSend({
    clientId: collaborationClientId,
    room: collaboration,
    refs: { ...collaborationRefs, mountedRef: collaborationMountedRef },
    heal: collaborationHeal,
    controller: collaboration,
    currentPackage: currentCollaborationPackage,
    applyPackage: applySharedPackage,
    // Depend on the individual room fields rather than the whole controller
    // object so the debounce only re-arms when the room or workspace changes.
    // connectionHealCount/roomVersion are the heal signals: without them a diff
    // stranded by a partition waits for the next user edit. The offline flag
    // itself is deliberately not a dependency — the send path now raises it, and
    // re-arming on the raise would retry a doomed upload during the partition.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [collaborationClientId, customTemplates, project, renderSettings, collaboration.connectionHealCount, collaboration.roomAccessToken, collaboration.roomId, collaboration.roomRole, collaboration.roomReadonly, collaboration.roomClosed, collaboration.roomExpired, collaboration.roomVersion, userAssets, userFonts]);

  const commitProject = (next: ProjectDocument) => {
    if (!collaboration.canEdit) {
      collaboration.setCollaborationMessage("当前仅查看，无法修改此工程");
      return;
    }
    setProject(next);
    setPreviewCommands([]);
    workspaceSync.markPending();
  };

  const commitProjectTransaction = (transaction: ProjectTransaction) => {
    if (!collaboration.canEdit) {
      collaboration.setCollaborationMessage("当前仅查看，无法修改此工程");
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

  const posterExport = usePosterExport({
    posterRef,
    project,
    userAssets,
    userFonts,
    customTemplates,
    renderSettings,
    applyImportedPackage: (pack) => {
      setUserAssets(pack.assets);
      setUserFonts(pack.fonts);
      setCustomTemplates(pack.customTemplates);
      setRenderSettings(pack.renderSettings);
      commitProject(pack.project);
      setSelection({ type: "canvas" });
    },
    reportStatus: setStatusMessage,
  });

  const { canUndo, canRedo, undoLabel, redoLabel } = describeHistoryActions(project);

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
      const action = matchEditorHistoryShortcut(event);
      if (!action) return;
      event.preventDefault();
      if (action === "undo") handleUndo();
      else handleRedo();
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
    commitProjectTransaction(refreshDisplayFramePositionsTransaction());
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
    commitProjectTransaction(applyFontTransaction(target, fontId, applyToAll));
  };

  const resetSceneTarget = (target: Extract<SceneSelection, { type: "canvas" | "map" | "cards" }>) => {
    patchScene(target, sceneResetPatch(project.templateId, target.type));
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
    return subscribePageLeave(() => {
      const pending = shouldSaveOnPageLeave({
        projectId: projectIdRef.current,
        loading: projectLifecycleRef.current.loading,
        missing: Boolean(projectLifecycleRef.current.missing),
        navigatingBack: backNavigatingRef.current,
        syncStatus: workspaceSync.getState().status,
        hasLocalEdits: hasLocalWorkspaceEditsRef.current,
      });
      if (pending) void saveWorkspaceNowRef.current();
    });
  }, [projectId, workspaceSync]);

  const overwriteBrowserStorage = async () => {
    await saveWorkspaceNow();
    setStatusMessage(describeForceSaveOutcome(workspaceSync.getState().status, projectRecordSaveErrorRef.current));
  };

  const addUserAsset = (asset: UserAsset) => {
    if (!asset?.src) {
      setStatusMessage(EMPTY_ASSET_MESSAGE);
      return;
    }
    setUserAssets((current) => {
      const outcome = addAssetToLibrary(current, asset);
      setStatusMessage(outcome.message);
      return outcome.assets;
    });
  };

  const replaceUserAsset = (assetId: string, replacement: UserAsset) => {
    setUserAssets((current) => replaceAssetInLibrary(current, assetId, replacement));
    commitProject(applyTransaction(project, replaceAssetElementSourceTransaction(assetId, replacement)));
    setStatusMessage(`已更新素材：${replacement.label}`);
  };

  const deleteUserAsset = (assetId: string) => {
    const message = describeAssetRemoval(userAssets, assetId);
    setUserAssets((current) => removeUserAsset(current, assetId));
    setStatusMessage(message);
  };

  const deleteUserFont = (fontId: string) => {
    const message = describeFontRemoval(userFonts, fontId);
    setUserFonts((current) => removeUserFont(current, fontId));
    setStatusMessage(message);
  };

  const assetUsageById = useMemo(() => buildAssetUsageLabels(project, userAssets), [project, userAssets]);

  const selectStyleLayer = (target: (typeof STYLE_LAYER_TARGETS)[number]) => {
    setSelection(styleLayerSelection(target));
  };

  const exportResourcePack = () => {
    const outcome = prepareResourcePackExport({ assets: userAssets, fonts: userFonts });
    if (outcome.pack) downloadResourcePack(outcome.pack);
    setStatusMessage(outcome.message);
  };

  const importResourcePack = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => {
      const outcome = mergeImportedResourcePack({
        text: String(reader.result || ""),
        existingAssets: userAssets,
        existingFonts: userFonts,
      });
      if (outcome.merged) {
        setUserAssets(outcome.merged.assets);
        setUserFonts(outcome.merged.fonts);
      }
      setStatusMessage(outcome.message);
    };
    reader.readAsText(file);
  };


  const handleSceneSelect = (next: SceneSelection) => {
    setSelection(next);
  };

  const locateLayoutIssue = (issue: { id: string }) => {
    const next = resolveLayoutIssueSelection(project, issue);
    if (next) setSelection(next);
  };

  const locateDeliveryIssue = (item: DeliveryIssue) => {
    const navigation = resolveDeliveryIssueNavigation(project, item);
    if (!navigation) return;
    if (navigation.studentId !== undefined) setSelectedStudentId(navigation.studentId);
    if (navigation.selection) setSelection(navigation.selection);
    setActiveStage(navigation.stage);
    setActivePanel(navigation.panel);
  };

  const contentLayoutIssues = useMemo(() => checkLayoutHealth(buildProjectLayoutHealthInput(project)), [project]);

  const handleLegacySceneSelect = (next: SceneSelection) => {
    handleSceneSelect(next);
    // Keep the legacy content editor's material context available without letting
    // the dedicated map stage leave its own workflow context.
    if (activeStage === "content" && next.type === "province") setActivePanel("assets");
  };

  const addText = () => {
    const element = createTextElement("给未来的一封信", 720, 870);
    commitProject(applyTransaction(project, addTextElementTransaction(element)));
    setSelection({ type: "text", id: element.id });
  };

  const addNote = () => {
    const element = createNoteElement("山高水长，来日再聚", 745, 905);
    commitProject(applyTransaction(project, addNoteElementTransaction(element)));
    setSelection({ type: "text", id: element.id });
  };

  const removeText = (id: string) => {
    commitProject(applyTransaction(project, deleteTextElementTransaction(id)));
    setSelection({ type: "canvas" });
  };

  const removeAsset = (id: string) => {
    commitProject(applyTransaction(project, deleteAssetElementTransaction(id)));
    setSelection({ type: "canvas" });
  };

  const duplicateAsset = (id: string) => {
    const source = project.assetElements.find((asset) => asset.id === id);
    if (!source) return;
    const copy = duplicateAssetElement(source);
    commitProject(applyTransaction(project, duplicateAssetElementTransaction(id, copy)));
    setSelection({ type: "asset", id: copy.id });
  };

  const changeAssetLayer = (id: string, delta: -1 | 1) => {
    const asset = project.assetElements.find((item) => item.id === id);
    if (!asset) return;
    patchScene({ type: "asset", id }, { zIndex: asset.zIndex + delta });
  };

  const applySystemTemplate = (templateId: MapTemplateId) => {
    commitProject(applyTransaction(project, applySystemTemplateTransaction(templateId)));
  };

  const applyCustomTemplateRecord = (record: CustomTemplateRecord) => {
    commitProject(applyTransaction(project, applyCustomTemplateTransaction(record)));
  };

  const saveCurrentTemplate = () => {
    const name = window.prompt("自定义模板名称", "我的地图版式");
    if (!name?.trim()) return;
    const scope = window.confirm("点击“确定”保存视觉样式；点击“取消”保存布局倾向（含卡片分组）")
      ? "visual"
      : "layout";
    const record = captureCustomTemplate({ name, scope, project });
    setCustomTemplates(withCapturedTemplate(customTemplates, record));
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
    setActiveStage("data");
    setStatusMessage("已新建空项目");
  };

  const restoreLocalProject = () => {
    const next = loadInitialProject();
    setProject(next);
    setPreviewCommands([]);
    setSelection({ type: "canvas" });
    setActivePanel("roster");
    setActiveWorkflowStep("roster");
    setActiveStage("data");
    setStatusMessage("已恢复本机最近项目");
  };

  const openGlobalData = () => {
    if (activeStage !== "data") lastNonTemplateStageRef.current = activeStage;
    setGlobalSettingsSection(null);
    setActivePanel("roster");
    setActiveWorkflowStep("roster");
    setActiveStage("data");
  };

  const handleWorkflowStageChange = (stage: WorkflowStageId) => {
    setGlobalSettingsSection(null);
    if (stage !== "data") lastNonTemplateStageRef.current = stage;
    setActiveStage(stage);
    if (stage === "data") {
      openGlobalData();
      return;
    }
    const navigation = resolveWorkflowStageNavigation(stage);
    if (!navigation) return;
    setActivePanel(navigation.panel);
    setActiveWorkflowStep(navigation.step);
  };

  const dataWorkspaceProps = {
    students: project.students,
    dataView: project.dataView,
    onChangeDataView: (view: DataViewId) => commitProjectTransaction(changeDataViewTransaction(view)),
    onAppendStudents: (records: Student[]) => commitProjectTransaction(appendStudentsTransaction(records)),
    onReplaceStudents: (records: Student[]) => commitProjectTransaction(replaceStudentsTransaction(records)),
    onUpdateStudent: (id: string, patch: StudentPatch) => commitProjectTransaction(updateStudentTransaction(id, patch)),
    onToggleVisibility: (id: string) => commitProjectTransaction(toggleStudentVisibilityTransaction(id)),
    onDeleteStudent: (id: string) => commitProjectTransaction(deleteStudentTransaction(id)),
    onSetStudentsVisibility: (visibility: boolean) => commitProjectTransaction(setStudentsVisibilityTransaction(visibility)),
    selectedStudentId,
    onSelectStudent: setSelectedStudentId,
  };

  const handleCreateDecoration = (asset: StudioAsset) => {
    const element = createDecorationElement(asset, {
      x: project.canvas.width - 180,
      y: project.canvas.height - 180,
    });
    commitProject(applyTransaction(project, addAssetElementTransaction("tx-decoration", `添加装饰：${asset.label}`, element)));
    setSelection({ type: "asset", id: element.id });
  };

  const handleCreateLandmark = (asset: StudioAsset) => {
    const selectedProvince = selection.type === "province" ? selection.province : "";
    const element = createLandmarkElement(asset, selectedProvince || "全国", {
      x: project.map.x + project.map.width / 2 - 60,
      y: project.map.y + project.map.height / 2 - 60,
    });
    commitProject(applyTransaction(project, addAssetElementTransaction("tx-landmark", `添加地标：${asset.label}`, element)));
    setSelection({ type: "asset", id: element.id });
  };

  const applyBackgroundAsset = (asset: StudioAsset) => {
    commitProject(applyTransaction(project, applyBackgroundAssetTransaction(asset)));
  };

  const applyProvinceThemes = (themes: Record<string, ImageThemeResult>) => {
    const entries = Object.entries(themes);
    if (entries.length === 0) return;
    const transaction = createProvinceThemeTransaction(themes);
    commitProjectTransaction({
      ...transaction,
      apply: (current) => ({ ...transaction.apply(current), cards: freezeCardPositionsForMapChange(current) }),
    });
    setStatusMessage(`已应用 ${entries.length} 个省份智能底色`);
  };

  const moveCard = (id: string, x: number, y: number) => {
    commitProject(applyTransaction(project, moveCardTransaction(id, maybeSnap(x, y))));
  };

  const moveText = (id: string, x: number, y: number) => {
    commitProject(applyTransaction(project, createSceneTransaction({ type: "text", id }, maybeSnap(x, y))));
  };

  const moveGuests = (x: number, y: number) => {
    commitProject(applyTransaction(project, createSceneTransaction({ type: "guests" }, maybeSnap(x, y))));
  };

  const moveAsset = (id: string, x: number, y: number) => {
    const point = maybeSnap(x, y);
    const current = project.assetElements.find((asset) => asset.id === id);
    if (!current || (current.x === point.x && current.y === point.y)) return;
    commitProject(applyTransaction(project, createSceneTransaction({ type: "asset", id }, point)));
  };

  const resizeAsset = (id: string, x: number, y: number, width: number, height: number) => {
    const point = maybeSnap(x, y);
    const current = project.assetElements.find((asset) => asset.id === id);
    if (!current || (current.x === point.x && current.y === point.y && current.width === width && current.height === height)) return;
    commitProject(applyTransaction(project, createSceneTransaction({ type: "asset", id }, { x: point.x, y: point.y, width, height })));
  };

  const moveProvinceTexture = (province: string, offsetX: number, offsetY: number) => {
    const appearance = project.map.provinceStyles?.[province]?.appearance;
    if (!appearance || appearance.kind === "manual-color") return;
    patchScene({ type: "province", province }, { appearance: { ...appearance, offsetX, offsetY } });
  };

  const resizeMapImage = (alignment: { x: number; y: number; width: number; height: number; rotation: number }) => {
    const source = project.map.renderSource;
    if (source?.kind !== "image" || !source.alignment) return;
    patchScene({ type: "map" }, { renderSource: { ...source, alignment: { ...source.alignment, ...alignment } } });
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
    onApplyBackground: applyBackgroundAsset,
    onSelectInstance: (id) => setSelection({ type: "asset", id }),
    onPatchProvinceTextureUniformSize: (next) => patchScene({ type: "map" }, { provinceTextureUniformSize: next }),
    onApplyProvinceAppearance: (province, appearance, fill) => {
      setSelection({ type: "province", province });
      patchScene({ type: "province", province }, { appearance, ...(fill ? { fill } : {}) });
      setStatusMessage(`已应用到地图：${province}`);
    },
    onApplyProvinceThemes: applyProvinceThemes,
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
    const navigation = resolveWorkflowPanelNavigation(id);
    setActiveStage(navigation.stage);
    if (id === "roster") {
      openGlobalData();
      return;
    }
    setActivePanel(id);
    setActiveWorkflowStep(navigation.step);
  };

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
    collaboration.setCollaborationOpen(true);
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
      roomId={collaboration.roomId}
      roomVersion={collaboration.roomVersion}
      roomInput={collaboration.roomInput}
      inviteTokenInput={collaboration.inviteTokenInput}
      roomRole={collaboration.roomRole}
      members={collaboration.roomMembers}
      ownClientId={collaborationClientId}
      roomReadonly={collaboration.roomReadonly}
      roomClosed={collaboration.roomClosed}
      roomExpired={collaboration.roomExpired}
      roomPersistenceDegraded={collaboration.roomPersistenceDegraded}
      roomPersistenceKind={collaboration.roomPersistenceKind}
      collaborationOffline={collaboration.collaborationOffline}
      invitationToken={collaboration.invitationToken}
      hasStoredRoomAccess={collaboration.hasStoredRoomAccess}
      collaborationStatus={collaboration.collaborationStatus}
      collaborationMessage={collaboration.collaborationMessage}
      collaborationOpen={collaboration.collaborationOpen}
      pngScale={posterExport.pngScale}
      transparentExport={posterExport.transparentExport}
      syncStatus={syncState.status}
      onSetCollaborationOpen={collaboration.setCollaborationOpen}
      onRoomInputChange={collaboration.setRoomInput}
      onInviteTokenInputChange={collaboration.setInviteTokenInput}
      onCreateInvitation={collaboration.createInvitation}
      onSetRoomAccess={collaboration.setAccess}
      onLeaveRoom={collaboration.leaveRoom}
      onStartRoom={collaboration.startRoom}
      onJoinRoom={collaboration.joinRoom}
      onNewProject={createNewProject}
      onRestoreLocal={restoreLocalProject}
      onSaveLocal={() => void overwriteBrowserStorage()}
      onPngScaleChange={posterExport.setPngScale}
      onTransparentChange={posterExport.setTransparentExport}
      onExportSvg={posterExport.exportSvg}
      onExportProject={posterExport.openProjectExportDialog}
      onImportProject={posterExport.importProjectPackage}
    />
    </ToolbarGroup>
  );
  const stageOverview = useMemo(
    () => deriveStageOverviewModel({
      stage: activeStage,
      project,
      stageProgress: deriveWorkflowStageProgress(project, workflowProgress),
      dataHealth,
      dataIssues,
      layoutIssues: contentLayoutIssues,
      resourceIssues: resourceHealthIssues.filter((issue) => issue.kind === "resource"),
      dataViewLabel: dataViews.find((view) => view.id === dataView)?.name ?? dataView,
      exportState: posterExport.exportState,
    }),
    [activeStage, project, workflowProgress, dataHealth, dataIssues, contentLayoutIssues, resourceHealthIssues, dataView, posterExport.exportState],
  );

  const handleStageOverviewAction = (action: StageOverviewAction) => {
    if (action.kind === "data-diagnostics") {
      openDataDiagnostics();
      return;
    }
    if (action.kind === "locate-layout") {
      locateLayoutIssue(action.issue);
      return;
    }
    if (action.kind === "locate-delivery") {
      locateDeliveryIssue(action.issue);
      return;
    }
    if (action.kind === "stage") {
      setActiveStage(action.stage);
      return;
    }
    if (action.kind === "export-png") {
      void posterExport.exportPng();
      return;
    }
  };

  const studioAssistantRail = (
    <StudioAssistantRail
      project={project}
      assets={userAssets}
      syncStatus={syncState.status}
      collaboration={{ roomId: collaboration.roomId, status: collaboration.collaborationStatus, participantCount: collaboration.roomParticipants.length }}
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
      stageOverview={stageOverview}
      onStageOverviewAction={handleStageOverviewAction}
    />
  );

  const assistantEntryButton = (
    <button
      ref={assistantEntryRef}
      type="button"
      aria-label="打开AI助手与高级功能"
      aria-expanded={assistantDrawerOpen}
      onClick={() => setAssistantDrawerOpen(true)}
    >
      <Bot size={17} />
    </button>
  );

  const historyActionsNode = (
    <ToolbarGroup label="历史与缩放" className="topbar-action-group--history">
      <ToolbarButton label={undoLabel} icon={<Undo2 size={18} />} disabled={!canUndo} onClick={handleUndo} />
      <ToolbarButton label={redoLabel} icon={<Redo2 size={18} />} disabled={!canRedo} onClick={handleRedo} />
    </ToolbarGroup>
  );

  const projectActionsNode = (
    <>
      {projectId && <WorkbenchBackButton onClick={() => void handleBackToWorkbench()} />}
      {projectExportActions}
      <ToolbarGroup label="界面主题" className="topbar-action-group--theme">
        <SkinSelector skin={skin} onChange={setSkin} />
        <ThemeToggle mode={themeMode} resolvedTheme={resolvedTheme} onChange={setThemeMode} />
      </ToolbarGroup>
    </>
  );

  const workflowNavNode = (
    <WorkflowStageStepper
      activeId={activeStage}
      project={project}
      progress={workflowProgress}
      onChange={handleWorkflowStageChange}
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
    const notice = resolveMissingProjectNotice(projectMissing);
    return (
      <main className="workbench-shell">
        <section
          className="workbench-error workbench-error--recover"
          role="alert"
          data-missing-project={notice.kind}
          data-store-health={projectMissing.health}
        >
          <span className="workbench-brand-mark"><MapPinned size={22} /></span>
          <strong>{notice.title}</strong>
          <p>{notice.detail}</p>
          <div className="workbench-error-actions">
            <button type="button" className="primary-button" aria-label="返回项目列表" onClick={() => { window.location.hash = "#/"; }}>
              返回项目列表
            </button>
          </div>
        </section>
      </main>
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

  const buildStageSlots = (stage: WorkflowStageId): StageSlots => {
    switch (stage) {
      case "data":
        return {
          rightRail: (
            <DataUploadRail
              project={project}
              summary={dataHealth}
              issues={dataIssues}
              dataWorkspaceProps={dataWorkspaceProps}
              assetPanelProps={mapStyleAssetPanelProps}
              onCreateDecoration={handleCreateDecoration}
              onSelectStudent={setSelectedStudentId}
            />
          ),
          workspace: (
            <DataUploadWorkspace
              project={project}
              summary={dataHealth}
              issues={dataIssues}
              dataWorkspaceProps={{ ...dataWorkspaceProps, hideDataExpression: true, hideTemplateDownload: true }}
              assetPanelProps={mapStyleAssetPanelProps}
              onCreateDecoration={handleCreateDecoration}
              onSelectStudent={setSelectedStudentId}
            />
          ),
        };
      case "map":
        return {
          rightRail: (
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
          ),
          workspace: (
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
            onMoveProvinceTexture={moveProvinceTexture}
            onResizeMapImage={resizeMapImage}
            onAddUserAsset={addUserAsset}
            onUndo={handleUndo}
            onRedo={handleRedo}
          />
          ),
        };
      case "frame": {
        return {
          stageActions: (
            <>
              <ToolbarButton label="刷新展示框位置" icon={<RefreshCw size={18} />} onClick={refreshDisplayFramePositions} />
            </>
          ),
          rightRail: (
            <CardsInspector
              cards={project.cards}
              userFonts={userFonts}
              onPatch={(patch) => patchScene({ type: "cards" }, patch)}
              onReset={() => resetSceneTarget({ type: "cards" })}
              mode="global"
              collapsible
            />
          ),
          workspace: (
            <ReferenceCardStyleWorkspace
              cards={project.cards}
              onPatch={(patch) => patchScene({ type: "cards" }, patch)}
            />
          ),
        };
      }
      case "export":
        return {
          rightRail: (
            <DeliveryRail
              project={renderProject}
              dataIssues={dataIssues}
              layoutIssues={contentLayoutIssues}
              resourceIssues={resourceHealthIssues.filter((issue) => issue.kind === "resource")}
              fontIssues={resourceHealthIssues.filter((issue) => issue.kind === "font")}
              pngScale={posterExport.pngScale}
              transparentExport={posterExport.transparentExport}
              includeResources={posterExport.includeResourcesInProjectExport}
              exportState={posterExport.exportState}
              exportError={posterExport.exportError}
              onPngScaleChange={posterExport.setPngScale}
              onTransparentExportChange={posterExport.setTransparentExport}
              onIncludeResourcesChange={posterExport.setIncludeResourcesInProjectExport}
              onLocate={locateDeliveryIssue}
              onExportPng={() => void posterExport.exportPng()}
              onExportSvg={posterExport.exportSvg}
              onExportProjectPackage={posterExport.exportProjectPackage}
              onRetry={posterExport.retryLastExport}
            />
          ),
          workspace: (
          <DeliveryWorkspace
            project={renderProject}
            posterRef={posterRef}
            userFonts={userFonts}
            dataIssues={dataIssues}
            layoutIssues={contentLayoutIssues}
            resourceIssues={resourceHealthIssues.filter((issue) => issue.kind === "resource")}
            fontIssues={resourceHealthIssues.filter((issue) => issue.kind === "font")}
            pngScale={posterExport.pngScale}
            transparentExport={posterExport.transparentExport}
            includeResources={posterExport.includeResourcesInProjectExport}
            exportState={posterExport.exportState}
            exportError={posterExport.exportError}
            onPngScaleChange={posterExport.setPngScale}
            onTransparentExportChange={posterExport.setTransparentExport}
            onIncludeResourcesChange={posterExport.setIncludeResourcesInProjectExport}
            onLocate={locateDeliveryIssue}
            onExportPng={() => void posterExport.exportPng()}
            onExportSvg={posterExport.exportSvg}
            onExportProjectPackage={posterExport.exportProjectPackage}
            onRetry={posterExport.retryLastExport}
          />
          ),
        };
      case "content":
        return {
          stageActions: (
            <>
              <ToolbarButton label="刷新展示框位置" icon={<RefreshCw size={18} />} onClick={refreshDisplayFramePositions} />
              <ToolbarButton label="返回地图样式" icon={<MapPinned size={18} />} onClick={() => {
                setActiveStage("map");
                setActivePanel("map");
              }} />
            </>
          ),
          rightRail: (
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
          ),
          workspace: (
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
            onMoveText={moveText}
            onMoveAsset={moveAsset}
            onResizeAsset={resizeAsset}
            onMoveProvinceTexture={moveProvinceTexture}
            onResizeMapImage={resizeMapImage}
            onCardPositionsResolved={captureCardPositions}
            onMoveCard={moveCard}
            onMoveGuests={moveGuests}
          />
          ),
        };
    }
  };

  if (activeStage !== "content" || !legacyEditorEnabled) {
    const slots = buildStageSlots(activeStage);
    return (
      <StudioLayoutTemplate
        theme={resolvedTheme}
        skin={skin}
        stage={activeStage}
        assistantEntry={assistantEntryButton}
        historyActions={historyActionsNode}
        stageActions={slots.stageActions}
        projectActions={projectActionsNode}
        workflowNav={workflowNavNode}
        leftRail={studioAssistantRail}
        rightRail={slots.rightRail}
        rightRailLabel={STAGE_METADATA[activeStage].rightRailLabel}
        drawerOpen={assistantDrawerOpen}
        onDrawerClose={() => setAssistantDrawerOpen(false)}
      >
        {slots.workspace}
      </StudioLayoutTemplate>
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
            <ZoomControls
              zoomPercent={zoomPercent}
              onZoomOut={() => setZoomPercent((v) => Math.max(25, v - 10))}
              onZoomIn={() => setZoomPercent((v) => Math.min(300, v + 10))}
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
            <button className="primary-button" onClick={() => void posterExport.exportPng()} disabled={posterExport.exportingPng}>
              <ImageDown size={16} /> {posterExport.exportingPng ? "导出中..." : "导出 PNG"}
            </button>
          </ToolbarGroup>
        </div>
      </header>


      {posterExport.showProjectExportDialog && (
        <div className="dialog-backdrop" onMouseDown={() => posterExport.setShowProjectExportDialog(false)}>
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
              <button type="button" aria-label="关闭导出工程确认" onClick={() => posterExport.setShowProjectExportDialog(false)}>×</button>
            </header>
            <label className="export-resource-option boolean-control checkbox-row">
              <input
                type="checkbox"
                aria-label="导出时包含资源包"
                checked={posterExport.includeResourcesInProjectExport}
                onChange={(event) => posterExport.setIncludeResourcesInProjectExport(event.target.checked)}
              />
              <span>
                <strong>包含资源包</strong>
                <small>一并打包地图背景、地图贴图、素材和字体；导入后会立刻同步到画布与素材库。</small>
              </span>
            </label>
            {!posterExport.includeResourcesInProjectExport && (
              <p className="export-resource-warning">未包含资源包时，其他设备可能缺少素材库条目和自定义字体。</p>
            )}
            <footer>
              <button type="button" className="secondary-button" onClick={() => posterExport.setShowProjectExportDialog(false)}>取消</button>
              <button type="button" className="primary-button" aria-label="确认导出工程" onClick={posterExport.exportProjectPackage}>确认导出</button>
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
                onChange={(view) => commitProjectTransaction(changeDataViewTransaction(view))}
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
                onApplyBackground={applyBackgroundAsset}
                onCreateLandmark={handleCreateLandmark}
                onCreateDecoration={handleCreateDecoration}
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
                onApplyProvinceThemes={applyProvinceThemes}
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
                <button className="wide-button workflow-export-button" type="button" onClick={() => void posterExport.exportPng()} disabled={posterExport.exportingPng}><ImageDown size={16} />{posterExport.exportingPng ? "导出中..." : "导出 PNG"}</button>
                <CompactButton icon={<Download size={14} aria-hidden />} onClick={posterExport.exportSvg}>导出 SVG</CompactButton>
                <CompactButton icon={<Save size={14} aria-hidden />} onClick={() => void overwriteBrowserStorage()} disabled={syncState.status === "saving"}>保存到本机</CompactButton>
                <CompactButton icon={<PackageOpen size={14} aria-hidden />} onClick={posterExport.openProjectExportDialog}>导出工程</CompactButton>
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
                  onMoveText={moveText}
                  onMoveAsset={moveAsset}
                  onResizeAsset={resizeAsset}
                  mapSelected={selection.type === "map"}
                  onMoveProvinceTexture={moveProvinceTexture}
                  onResizeMapImage={resizeMapImage}
                  onCardPositionsResolved={captureCardPositions}
                  selectedStudentId={selectedStudentId}
                  onSelectStudent={setSelectedStudentId}
                  onMoveCard={moveCard}
                  onMoveGuests={moveGuests}
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
