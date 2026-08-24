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
import { loadInitialProject, loadBrowserState } from "./lib/app-initialization";
import { CHINA_PROVINCE_ADJACENCY } from "./lib/map-data";
import {
  provinceNames,
  dataViews,
  type ActivePanel,
} from "./lib/app-constants";
import {
  buildProvinceSummary,
  type DataViewId,
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
  createEditorCanvasActions,
  type CardPositions,
} from "./lib/editor-canvas-actions";
import { createEditorLibraryActions } from "./lib/editor-library-actions";
import { buildAssetUsageLabels } from "./lib/resource-library";
import { createEditorNavigationActions } from "./lib/editor-navigation-actions";
import { loadStoredRenderSettings } from "./lib/editor-chrome";
import { useEditorChromeEffects } from "./lib/editor-chrome-effects";
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
import { DeliveryRail, DeliveryWorkspace } from "./components/workspaces/DeliveryWorkspace";

import { ActionGroup, CompactButton, SegmentedControl, ToolbarButton, ToolbarGroup } from "./components/StudioUi";
import { CardsInspector } from "./components/inspector/CardsInspector";
import { ZoomControls } from "./components/ZoomControls";
import { WorkflowStepper } from "./components/WorkflowStepper";
import {
  WORKFLOW_STAGE_TO_LEGACY_PANEL,
  deriveWorkflowStageProgress,
  type WorkflowStageId,
} from "./lib/workflow-stages";
import { deriveStageOverviewModel } from "./lib/stage-overview";
import { STAGE_METADATA } from "./lib/stage-metadata";
import { LEGACY_EDITOR_STORAGE_KEY, loadWorkspaceSession } from "./lib/workspace-session";
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
  redoTransaction,
  undoTransaction,
  type ProjectDocument,
  type ProjectTransaction,
} from "./lib/project-document";
import { STYLE_LAYER_TARGETS } from "./lib/catalog-usage";

import { createSystemTemplate } from "./lib/template-document";
import {
  loadCustomTemplates,
  type CustomTemplateRecord,
} from "./lib/template-store";
import { createTemplateCaptureAction } from "./lib/editor-template-capture-action";
import { createProjectResetActions } from "./lib/editor-project-reset-actions";
import { PosterCanvas } from "./components/canvas/PosterCanvas";
import { type ProvinceAppearance, type SceneSelection } from "./lib/scene-document";

import { InspectorPanel } from "./components/inspector/InspectorPanel";
import { MapInspector } from "./components/inspector/MapInspector";
import { loadUserFonts, type UserFont } from "./lib/fonts";
import {
  loadUserAssets,
  type UserAsset,
} from "./lib/assets";
import { usePosterExport } from "./lib/usePosterExport";
import {
  loadStudioSkin,
  loadThemeMode,
  resolveTheme,
  type ThemeMode,
} from "./lib/theme";
import {
  getPanelWidthBounds,
  normalizeEditorPanelLayout,
  readEditorPanelLayout,
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
import { useEditorProjectRecord } from "./lib/editor-project-record";
import { useWorkspaceSaveLifecycle } from "./lib/editor-save-lifecycle";
import { useEditorWorkspaceHydration } from "./lib/editor-workspace-hydration";
import { restoredSceneSelection } from "./lib/editor-workspace-state";
import { useEditorCollaboration } from "./lib/editor-collaboration-wiring";

function StudioApp({ projectId }: { projectId?: string }) {
  const [browserStores] = useState(() => createBrowserWorkspaceStores());
  const [initialWorkspace] = useState(() => loadBrowserWorkspaceMirror(browserStores.mirror));
  const [project, setProject] = useState<ProjectDocument>(() => initialWorkspace?.project ?? loadInitialProject());
  const [previewCommands, setPreviewCommands] = useState<EditorCommand[]>([]);
  const [agentPreview, setAgentPreview] = useState<ProjectDocument | null>(null);
  const [workspaceSession] = useState(() => loadBrowserState(
    () => loadWorkspaceSession(window.localStorage),
    loadWorkspaceSession(null),
  ));
  const [selection, setSelection] = useState<SceneSelection>(() => restoredSceneSelection(workspaceSession));
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  const [syncState, setSyncState] = useState<LocalWorkspaceOverwriteState>({
    status: initialWorkspace ? "saved" : "idle",
    savedAt: initialWorkspace?.exportedAt ?? null,
  });
  const [customTemplates, setCustomTemplates] = useState<CustomTemplateRecord[]>(
    () => initialWorkspace?.customTemplates ?? loadBrowserState(loadCustomTemplates, []),
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
  const [userFonts, setUserFonts] = useState<UserFont[]>(
    () => initialWorkspace?.fonts ?? loadBrowserState(loadUserFonts, []),
  );
  const [userAssets, setUserAssets] = useState<UserAsset[]>(
    () => initialWorkspace?.assets ?? loadBrowserState(loadUserAssets, []),
  );
  const [showGrid] = useState(false);
  const [gridSize] = useState(DEFAULT_GRID_SIZE);
  const [renderSettings, setRenderSettings] = useState<RenderSettings>(() => initialWorkspace
    ? initialWorkspace.renderSettings
    : loadStoredRenderSettings(() => typeof window === "undefined" ? null : window.localStorage));
  const [zoomPercent, setZoomPercent] = useState(100);
  const [collaborationClientId] = useState(() => createId("collab-client"));

  const { record: projectRecord, workspaceSync } = useEditorProjectRecord({
    projectId,
    stores: browserStores,
    projectStore: editorProjectStore,
    onStateChange: setSyncState,
  });
  const posterRef = useRef<SVGSVGElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const [activePanel, setActivePanel] = useState<ActivePanel>(() => WORKFLOW_STAGE_TO_LEGACY_PANEL[workspaceSession.stage] ?? "roster");
  const [legacyEditorEnabled] = useState(
    () => loadBrowserState(() => window.localStorage.getItem(LEGACY_EDITOR_STORAGE_KEY) === "1", false),
  );
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
  const resolvedTheme = resolveTheme(themeMode, prefersDark);
  useEditorChromeEffects({
    workspaceSession,
    activeStage,
    selection,
    themeMode,
    skin,
    resolvedTheme,
    panelLayout,
    userFonts,
    setPrefersDark,
    setPanelLayout,
  });
  const workflowProgress = useMemo(() => computeWorkflowProgress(project), [project]);
  const dataHealth = useMemo(() => buildDataHealthSummary(project), [project]);
  const dataIssues = useMemo(() => listDataIssues(project), [project]);
  const exportWarnings = useMemo(() => listStudentWarnings(project), [project]);
  const resourceHealthIssues = useMemo(
    () => listResourceHealthIssues(project, userAssets, userFonts),
    [project, userAssets, userFonts],
  );
  const viewportWidth = typeof window === "undefined" ? 1440 : window.innerWidth;
  const sidebarBounds = getPanelWidthBounds("sidebar", viewportWidth, panelLayout.inspectorWidth);
  const inspectorBounds = getPanelWidthBounds("inspector", viewportWidth, panelLayout.sidebarWidth);
  const workspaceStyle = {
    "--sidebar-width": `${panelLayout.sidebarWidth}px`,
    "--inspector-width": `${panelLayout.inspectorWidth}px`,
  } as CSSProperties;

  const updatePanelWidth = (side: PanelSide, value: number) => {
    setPanelLayout((current) => normalizeEditorPanelLayout({
      ...current,
      [side === "sidebar" ? "sidebarWidth" : "inspectorWidth"]: value,
    }, viewportWidth));
  };

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

  const { readWorkspace, hasLocalEdits } = useEditorWorkspaceHydration({
    project,
    assets: userAssets,
    fonts: userFonts,
    customTemplates,
    renderSettings,
    projectId,
    browserStores,
    initialExportedAt: initialWorkspace?.exportedAt,
    projectStore: editorProjectStore,
    record: projectRecord,
    workspaceSync,
    sink: {
      setProject,
      setUserAssets,
      setUserFonts,
      setCustomTemplates,
      setRenderSettings,
      clearPreviewCommands: () => setPreviewCommands([]),
      setSyncState,
      setProjectMissing,
      setProjectLoading,
      reportStatus: setStatusMessage,
    },
  });

  const collaboration = useEditorCollaboration({
    clientId: collaborationClientId,
    project,
    assets: userAssets,
    fonts: userFonts,
    customTemplates,
    renderSettings,
    readWorkspace,
    workspaceSync,
    sink: {
      setProject,
      setUserAssets,
      setUserFonts,
      setCustomTemplates,
      setRenderSettings,
      clearPreviewCommands: () => setPreviewCommands([]),
    },
  });

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

  const resolvedCardPositionsRef = useRef<CardPositions | null>(null);
  const captureCardPositions = (positions: CardPositions) => {
    resolvedCardPositionsRef.current = positions;
  };

  // 卡片位置只在事件处理器与事务 apply 里读写,渲染期不取值;react-hooks/refs 看不穿
  // 工厂函数这层间接,与下方 createWorkspaceSync 同理按行豁免。
  // eslint-disable-next-line react-hooks/refs
  const canvasActions = createEditorCanvasActions({
    project,
    selection,
    readCardPositions: () => resolvedCardPositionsRef.current,
    clearCardPositions: () => { resolvedCardPositionsRef.current = null; },
    commitProject,
    commitTransaction: commitProjectTransaction,
    setSelection,
    setStatusMessage,
    snap: maybeSnap,
  });
  const {
    addNote,
    addText,
    applyBackgroundAsset,
    applyCustomTemplateRecord,
    applyFont,
    applyProvinceThemes,
    applySystemTemplate,
    changeAssetLayer,
    createDecoration,
    createLandmark,
    duplicateAsset,
    moveAsset,
    moveCard,
    moveGuests,
    moveProvinceTexture,
    moveText,
    patchScene,
    refreshDisplayFramePositions,
    removeAsset,
    removeText,
    resetSceneTarget,
    resizeAsset,
    resizeMapImage,
  } = canvasActions;

  const { backToWorkbench, overwriteBrowserStorage } = useWorkspaceSaveLifecycle({
    projectId,
    projectLoading,
    projectMissing: Boolean(projectMissing),
    record: projectRecord,
    workspaceSync,
    readWorkspace,
    hasLocalEdits,
    reportStatus: setStatusMessage,
  });

  const {
    addUserAsset,
    deleteUserAsset,
    deleteUserFont,
    exportResourcePack,
    importResourcePack,
    replaceUserAsset,
    uploadUserFont,
  } = createEditorLibraryActions({
    project,
    userAssets,
    userFonts,
    setUserAssets,
    setUserFonts,
    setStatusMessage,
    commitProject,
  });

  const assetUsageById = useMemo(() => buildAssetUsageLabels(project, userAssets), [project, userAssets]);

  // rememberStage 只在阶段切换的事件处理器里写 ref,渲染期不碰;react-hooks/refs 看不穿
  // 工厂函数这层间接,与上面的画布动作同理按行豁免。
  // eslint-disable-next-line react-hooks/refs
  const navigationActions = createEditorNavigationActions({
    project,
    activeStage,
    rememberStage: (stage: WorkflowStageId) => { lastNonTemplateStageRef.current = stage; },
    setSelection,
    setSelectedStudentId,
    setActiveStage,
    setActivePanel,
    setActiveWorkflowStep,
    setSettingsSection: setGlobalSettingsSection,
    toggleProjectMenu: () => {
      const menu = document.querySelector<HTMLDetailsElement>(".topbar .project-menu");
      if (menu) menu.open = !menu.open;
    },
    setCollaborationOpen: collaboration.setCollaborationOpen,
    exportPng: () => void posterExport.exportPng(),
  });
  const {
    changeWorkflowPanel,
    changeWorkflowStage,
    locateDeliveryIssue,
    locateLayoutIssue,
    openCollaborationSettings,
    openDataDiagnostics,
    openGlobalData,
    openRenderSettings,
    openStudioSettings,
    openTopbarProjectMenu,
    runStageOverviewAction,
    selectLegacyScene,
    selectScene,
    selectStyleLayer,
  } = navigationActions;

  const contentLayoutIssues = useMemo(() => checkLayoutHealth(buildProjectLayoutHealthInput(project)), [project]);

  const saveCurrentTemplate = createTemplateCaptureAction({
    project,
    customTemplates,
    setCustomTemplates,
    reportStatus: setStatusMessage,
  });

  const { createNewProject, restoreLocalProject } = createProjectResetActions({
    setProject,
    clearPreviewCommands: () => setPreviewCommands([]),
    setSelection,
    setSelectedStudentId,
    setActivePanel,
    setActiveWorkflowStep,
    setActiveStage,
    reportStatus: setStatusMessage,
  });

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
      roomPersistFailureAt={collaboration.roomPersistFailureAt}
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
      onSelectElement={selectScene}
      onLocateLayoutIssue={locateLayoutIssue}
      onPreview={setAgentPreview}
      onCommit={commitProjectTransaction}
      stageOverview={stageOverview}
      onStageOverviewAction={runStageOverviewAction}
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
      {projectId && <WorkbenchBackButton onClick={() => void backToWorkbench()} />}
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
      onChange={changeWorkflowStage}
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
            <WorkflowStageStepper activeId={activeStage} project={project} progress={workflowProgress} onChange={changeWorkflowStage} />
          </div>
          <div className="topbar-actions">
            {projectId && <WorkbenchBackButton onClick={() => void backToWorkbench()} />}
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
        onUploadFont={uploadUserFont}
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
              onCreateDecoration={createDecoration}
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
              onCreateDecoration={createDecoration}
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
            onSelect={selectScene}
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
              onUploadFont={uploadUserFont}
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
            onSelect={selectScene}
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
            onUploadFont={uploadUserFont}
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
          <WorkflowStageStepper activeId={activeStage} project={project} progress={workflowProgress} onChange={changeWorkflowStage} />
          <div className="topbar-workflow__legacy" aria-hidden="true">
            <WorkflowStepper activeId={activePanel} progress={workflowProgress} onChange={changeWorkflowPanel} />
          </div>
        </div>
        <div className="topbar-actions">
          {projectId && <WorkbenchBackButton onClick={() => void backToWorkbench()} />}
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
                onCreateLandmark={createLandmark}
                onCreateDecoration={createDecoration}
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
                  onSelect={selectLegacyScene}
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
            onUploadFont={uploadUserFont}
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
