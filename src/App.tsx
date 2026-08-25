import {
  Bot,
  Redo2,
  Undo2,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { loadInitialProject, loadBrowserState } from "./lib/app-initialization";
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
import { useStableCallbacks } from "./lib/stable-callbacks";
import { loadStoredRenderSettings } from "./lib/editor-chrome";
import { useEditorChromeEffects } from "./lib/editor-chrome-effects";
import { resolveRenderedTemplate } from "./lib/rendered-template";
import { editorProjectStore } from "./lib/editor-project-store";
import type { MissingProjectObservation } from "./lib/missing-project-notice";

import { AssistantConversationProvider } from "./components/AgentAssistant";
import { ProjectMenu } from "./components/ProjectMenu";
import { WorkbenchBackButton } from "./components/WorkbenchBackButton";
import { WorkflowStageStepper } from "./components/WorkflowStageStepper";
import { StudioAssistantRail } from "./components/StudioAssistantRail";

import "./components/workflow-workspaces.css";
import type { GlobalSettingsSection } from "./components/GlobalSettingsScreen";
import type { ContentAssetPanelProps } from "./components/workspaces/ContentLayoutWorkspace";
import { ExportProjectDialog } from "./components/editor/ExportProjectDialog";
import { GlobalSettingsShell } from "./components/editor/GlobalSettingsShell";
import { LegacyEditorInspector } from "./components/editor/LegacyEditorInspector";
import { LegacyEditorSidebar } from "./components/editor/LegacyEditorSidebar";
import { LegacyEditorStage } from "./components/editor/LegacyEditorStage";
import { LegacyEditorTopbar } from "./components/editor/LegacyEditorTopbar";
import { MissingProjectShell } from "./components/editor/MissingProjectShell";
import { ProjectLoadingShell } from "./components/editor/ProjectLoadingShell";
import { EditorTopbarActions } from "./components/editor/EditorTopbarActions";
import { StageLayoutScreen } from "./components/editor/StageLayoutScreen";

import { ToolbarButton, ToolbarGroup } from "./components/StudioUi";
import {
  WORKFLOW_STAGE_TO_LEGACY_PANEL,
  deriveWorkflowStageProgress,
  type WorkflowStageId,
} from "./lib/workflow-stages";
import { deriveStageOverviewModel } from "./lib/stage-overview";
import { LEGACY_EDITOR_STORAGE_KEY, loadWorkspaceSession } from "./lib/workspace-session";
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
import {
  loadCustomTemplates,
  type CustomTemplateRecord,
} from "./lib/template-store";
import { createContentAssetPanelProps } from "./lib/editor-asset-panel-props";
import { createEditorTemplateActions } from "./lib/editor-template-actions";
import { createProjectResetActions } from "./lib/editor-project-reset-actions";
import { type SceneSelection } from "./lib/scene-document";

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

  const summary = buildProvinceSummary(renderProject.students);
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
    getProjectName: () => projectRecord.nameRef.current,
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
  // 与 canvasActions 同理:PosterCanvas 按 prop 身份 memo,回调必须身份稳定。
  const captureCardPositions = useCallback((positions: CardPositions) => {
    resolvedCardPositionsRef.current = positions;
  }, []);

  // 卡片位置只在事件处理器与事务 apply 里读写,渲染期不取值;react-hooks/refs 看不穿
  // 工厂函数这层间接,与下方 createWorkspaceSync 同理按行豁免。
  // eslint-disable-next-line react-hooks/refs
  const canvasActions = useStableCallbacks(createEditorCanvasActions({
    project,
    selection,
    readCardPositions: () => resolvedCardPositionsRef.current,
    clearCardPositions: () => { resolvedCardPositionsRef.current = null; },
    commitProject,
    commitTransaction: commitProjectTransaction,
    setSelection,
    setStatusMessage,
    snap: maybeSnap,
  }));
  const {
    addNote,
    addText,
    applyBackgroundAsset,
    applyCustomTemplateRecord,
    applyFont,
    applyProvinceThemes,
    applySystemTemplate,
    createDecoration,
    createLandmark,
    moveAsset,
    moveCard,
    moveGuests,
    moveProvinceTexture,
    moveText,
    patchScene,
    refreshDisplayFramePositions,
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

  const libraryActions = createEditorLibraryActions({
    project,
    userAssets,
    userFonts,
    setUserAssets,
    setUserFonts,
    setStatusMessage,
    commitProject,
  });
  const {
    addUserAsset,
    deleteUserAsset,
    deleteUserFont,
    exportResourcePack,
    importResourcePack,
    replaceUserAsset,
    uploadUserFont,
  } = libraryActions;

  const assetUsageById = useMemo(() => buildAssetUsageLabels(project, userAssets), [project, userAssets]);

  // rememberStage 只在阶段切换的事件处理器里写 ref,渲染期不碰;react-hooks/refs 看不穿
  // 工厂函数这层间接,与上面的画布动作同理按行豁免。
  // eslint-disable-next-line react-hooks/refs
  const navigationActions = useStableCallbacks(createEditorNavigationActions({
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
    legacyEditorEnabled,
  }));
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

  const templateActions = createEditorTemplateActions({
    project,
    currentTemplateId: template,
    customTemplates,
    setCustomTemplates,
    applySystemTemplate,
    applyCustomTemplateRecord,
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

  const contentAssetPanelProps: ContentAssetPanelProps = createContentAssetPanelProps({
    project,
    provinceNames,
    dataProvinces: summary.map((item) => item.province),
    userAssets,
    assetUsageById,
    createDecoration,
    applyBackgroundAsset,
    applyProvinceThemes,
    addUserAsset,
    replaceUserAsset,
    deleteUserAsset,
    exportResourcePack,
    importResourcePack,
    setSelection,
    patchScene,
    reportStatus: setStatusMessage,
  });

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
      exportState={posterExport.exportState}
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
      onExportPng={() => void posterExport.exportPng()}
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
      advancedMode={legacyEditorEnabled ? "legacy-settings" : "stage-nav"}
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
    <ToolbarGroup label="历史" className="topbar-action-group--history">
      <ToolbarButton label={undoLabel} icon={<Undo2 size={18} />} disabled={!canUndo} onClick={handleUndo} />
      <ToolbarButton label={redoLabel} icon={<Redo2 size={18} />} disabled={!canRedo} onClick={handleRedo} />
    </ToolbarGroup>
  );

  const projectActionsNode = (
    <EditorTopbarActions
      backButton={projectId ? <WorkbenchBackButton onClick={() => void backToWorkbench()} /> : null}
      exportActions={projectExportActions}
      appearance={{ skin, themeMode, resolvedTheme, onSkinChange: setSkin, onThemeChange: setThemeMode }}
      onCopyEnvironment={() => setStatusMessage("已复制环境信息")}
    />
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
    return <ProjectLoadingShell />;
  }

  if (projectMissing) {
    return <MissingProjectShell observation={projectMissing} />;
  }
  if (globalSettingsSection) {
    return (
      <GlobalSettingsShell
        section={globalSettingsSection}
        theme={resolvedTheme}
        skin={skin}
        project={project}
        userFonts={userFonts}
        templateActions={templateActions}
        dataWorkspaceProps={dataWorkspaceProps}
        workflowNav={workflowNavNode}
        backButton={projectId ? <WorkbenchBackButton onClick={() => void backToWorkbench()} /> : null}
        canUndo={canUndo}
        canRedo={canRedo}
        undoLabel={undoLabel}
        redoLabel={redoLabel}
        workflowProgress={workflowProgress}
        workflowActiveStep={activeWorkflowStep}
        themeMode={themeMode}
        onThemeChange={setThemeMode}
        onClose={() => setGlobalSettingsSection(null)}
        onUndo={handleUndo}
        onRedo={handleRedo}
        onPatch={patchScene}
        onReset={resetSceneTarget}
        onApplyFont={applyFont}
        onUploadFont={uploadUserFont}
        onDeleteUserFont={deleteUserFont}
        onOpenGlobalData={openGlobalData}
      />
    );
  }

  if (activeStage !== "content" || !legacyEditorEnabled) {
    return (
      <StageLayoutScreen
        stage={activeStage}
        theme={resolvedTheme}
        skin={skin}
        assistantEntry={assistantEntryButton}
        historyActions={historyActionsNode}
        projectActions={projectActionsNode}
        workflowNav={workflowNavNode}
        leftRail={studioAssistantRail}
        drawerOpen={assistantDrawerOpen}
        onDrawerClose={() => setAssistantDrawerOpen(false)}
        project={project}
        renderProject={renderProject}
        dataHealth={dataHealth}
        dataIssues={dataIssues}
        layoutIssues={contentLayoutIssues}
        resourceHealthIssues={resourceHealthIssues}
        dataWorkspaceProps={dataWorkspaceProps}
        assetPanelProps={contentAssetPanelProps}
        userAssets={userAssets}
        userFonts={userFonts}
        selection={selection}
        selectedStudentId={selectedStudentId}
        canUndo={canUndo}
        canRedo={canRedo}
        undoLabel={undoLabel}
        redoLabel={redoLabel}
        posterRef={posterRef}
        posterExport={posterExport}
        onPatch={patchScene}
        onReset={resetSceneTarget}
        onSelect={selectScene}
        onSelectStudent={setSelectedStudentId}
        onChangeDataView={dataWorkspaceProps.onChangeDataView}
        onAddUserAsset={addUserAsset}
        onCardPositionsResolved={captureCardPositions}
        onMoveProvinceTexture={moveProvinceTexture}
        onResizeMapImage={resizeMapImage}
        onMoveText={moveText}
        onMoveAsset={moveAsset}
        onResizeAsset={resizeAsset}
        onMoveCard={moveCard}
        onMoveGuests={moveGuests}
        templateActions={templateActions}
        onApplyFont={applyFont}
        onUploadFont={uploadUserFont}
        onDeleteUserFont={deleteUserFont}
        onUndo={handleUndo}
        onRedo={handleRedo}
        onRefreshPositions={refreshDisplayFramePositions}
        onLocateDeliveryIssue={locateDeliveryIssue}
      />
    );
  }


  return (
    <main className="app-shell" data-editor-theme={resolvedTheme} data-editor-skin={skin}>
      <LegacyEditorTopbar
        workflowNav={workflowNavNode}
        legacyActivePanel={activePanel}
        workflowProgress={workflowProgress}
        backButton={projectId ? <WorkbenchBackButton onClick={() => void backToWorkbench()} /> : null}
        projectExportActions={projectExportActions}
        canUndo={canUndo}
        canRedo={canRedo}
        undoLabel={undoLabel}
        redoLabel={redoLabel}
        zoomPercent={zoomPercent}
        inspectorOpen={mobileInspectorOpen}
        skin={skin}
        themeMode={themeMode}
        resolvedTheme={resolvedTheme}
        posterExport={posterExport}
        onChangeLegacyPanel={changeWorkflowPanel}
        onUndo={handleUndo}
        onRedo={handleRedo}
        onZoomPercentChange={setZoomPercent}
        onToggleInspector={() => setMobileInspectorOpen((open) => !open)}
        onSkinChange={setSkin}
        onThemeChange={setThemeMode}
        layoutMode={project.cards.layoutMode}
        onRefreshPositions={refreshDisplayFramePositions}
      />

      <ExportProjectDialog posterExport={posterExport} />

      <section
        className="workspace"
        style={workspaceStyle}
        data-editor-resizing={resizingPanel ? "true" : undefined}
        data-resizing-panel={resizingPanel ?? undefined}
      >
        <LegacyEditorSidebar
          assistantRail={studioAssistantRail}
          activePanel={activePanel}
          project={project}
          dataView={dataView}
          summary={summary}
          selection={selection}
          userAssets={userAssets}
          assetUsageById={assetUsageById}
          customTemplates={customTemplates}
          resolvedTemplate={resolvedTemplate}
          exportWarnings={exportWarnings}
          dataWorkspaceProps={dataWorkspaceProps}
          posterExport={posterExport}
          syncStatus={syncState.status}
          onChangeDataView={dataWorkspaceProps.onChangeDataView}
          onPatchScene={patchScene}
          onResetScene={resetSceneTarget}
          onSetSelection={setSelection}
          onSetActivePanel={setActivePanel}
          onReportStatus={setStatusMessage}
          onApplySystemTemplate={applySystemTemplate}
          onApplyCustomTemplate={applyCustomTemplateRecord}
          onSaveTemplate={templateActions.onSaveTemplate}
          onApplyBackground={applyBackgroundAsset}
          onCreateLandmark={createLandmark}
          onCreateDecoration={createDecoration}
          onApplyProvinceThemes={applyProvinceThemes}
          onAddUserAsset={addUserAsset}
          onReplaceUserAsset={replaceUserAsset}
          onDeleteUserAsset={deleteUserAsset}
          onExportResourcePack={exportResourcePack}
          onImportResourcePack={importResourcePack}
          onSaveLocal={() => void overwriteBrowserStorage()}
          onAddText={addText}
          onAddNote={addNote}
          onSelectStyleLayer={selectStyleLayer}
        />

        <LegacyEditorStage
          stageRef={stageRef}
          project={project}
          renderProject={renderProject}
          posterRef={posterRef}
          zoomPercent={zoomPercent}
          selection={selection}
          selectedStudentId={selectedStudentId}
          userFonts={userFonts}
          showGrid={showGrid}
          gridSize={gridSize}
          renderIntervalMs={resolvedRenderInterval}
          canvasActions={canvasActions}
          onSelect={selectLegacyScene}
          onSelectStudent={setSelectedStudentId}
          onCardPositionsResolved={captureCardPositions}
        />

        <LegacyEditorInspector
          open={mobileInspectorOpen}
          project={project}
          renderProject={renderProject}
          summary={summary}
          selection={selection}
          userFonts={userFonts}
          syncState={syncState}
          statusMessage={statusMessage}
          canvasActions={canvasActions}
          libraryActions={libraryActions}
          onOpenGlobalSettings={setGlobalSettingsSection}
        />

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
