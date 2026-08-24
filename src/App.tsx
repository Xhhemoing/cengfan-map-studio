import { Bot, MapPinned, Redo2, Undo2 } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import {
  loadInitialProject,
  loadBrowserValue,
  WorkbenchBackButton,
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
} from "./lib/project-data";
import { createId } from "./lib/ids";

import { AssistantConversationProvider } from "./components/AgentAssistant";
import { ProjectMenu } from "./components/ProjectMenu";
import { WorkflowStageStepper } from "./components/WorkflowStageStepper";
import { StudioAssistantRail } from "./components/StudioAssistantRail";

import "./components/workflow-workspaces.css";
import { GlobalSettingsScreen, type GlobalSettingsSection } from "./components/GlobalSettingsScreen";
import type { DeliveryIssue } from "./components/workspaces/DeliveryWorkspace";

import { ToolbarButton, ToolbarGroup } from "./components/StudioUi";
import {
  WORKFLOW_STAGE_TO_LEGACY_PANEL,
  deriveWorkflowStageProgress,
  type WorkflowStageId,
} from "./lib/workflow-stages";
import { deriveStageOverviewModel, type StageOverviewAction } from "./lib/stage-overview";
import { LEGACY_EDITOR_STORAGE_KEY } from "./lib/workspace-session";
import { resolveDeliveryIssueLocation } from "./lib/delivery-target";
import { ThemeToggle } from "./components/ThemeToggle";
import { SkinSelector } from "./components/SkinSelector";
import { buildDataHealthSummary, listDataIssues } from "./lib/data-health";
import { computeWorkflowProgress, type WorkflowStepId } from "./lib/workflow-progress";
import {
  applyTransaction,
  createProjectDocument,
  redoTransaction,
  undoTransaction,
  type ProjectDocument,
  type ProjectTransaction,
} from "./lib/project-document";

import { createSystemTemplate } from "./lib/template-document";
import {
  applyCustomTemplateToProject,
  type CustomTemplateRecord,
} from "./lib/template-store";
import { createDecorationElement } from "./lib/asset-elements";
import type { SceneSelection } from "./lib/scene-document";
import { type StudioAsset } from "./lib/assets";
import { usePosterExport } from "./lib/usePosterExport";
import { listResourceHealthIssues } from "./lib/resource-health";

import { DEFAULT_GRID_SIZE } from "./lib/grid";
import { renderIntervalMs } from "./lib/render-settings";
import { useCollaborationSync } from "./hooks/use-collaboration-sync";
import { useResourceLibrary } from "./hooks/use-resource-library";
import { useSceneActions } from "./hooks/use-scene-actions";
import { useStudioChrome } from "./hooks/use-studio-chrome";
import { useUndoRedoShortcuts } from "./hooks/use-undo-redo-shortcuts";
import { useWorkspacePersistence } from "./hooks/use-workspace-persistence";
import { useWorkspaceSessionAutosave, useWorkspaceSessionState } from "./hooks/use-workspace-session";
import {
  buildCustomTemplateDraft,
  createAppendStudentsTransaction,
  createApplySystemTemplateTransaction,
  createDataViewTransaction,
  createReplaceStudentsTransaction,
  createStudentDeleteTransaction,
  createStudentUpdateTransaction,
  createStudentVisibilityToggleTransaction,
  createStudentsVisibilityTransaction,
  deriveSessionSelection,
  describeProjectHistory,
  listContentLayoutIssues,
  resolveLayoutIssueSelection,
  type StudentEditPatch,
} from "./lib/studio-editor-helpers";
import type { StageSlotsContext } from "./components/studio-editor/stage-slots";
import { LegacyEditorChrome } from "./components/studio-editor/LegacyEditorChrome";
import { StudioStageScreen } from "./components/studio-editor/StudioStageScreen";

function StudioApp({ projectId }: { projectId?: string }) {
  const {
    project,
    setProject,
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
    overwriteBrowserStorage,
    handleBackToWorkbench,
  } = useWorkspacePersistence({ projectId });
  const [agentPreview, setAgentPreview] = useState<ProjectDocument | null>(null);
  const workspaceSession = useWorkspaceSessionState();
  const [selection, setSelection] = useState<SceneSelection>(() => deriveSessionSelection(workspaceSession));
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  const [showGrid] = useState(false);
  const [gridSize] = useState(DEFAULT_GRID_SIZE);

  const posterRef = useRef<SVGSVGElement>(null);
  const [activePanel, setActivePanel] = useState<ActivePanel>(() => WORKFLOW_STAGE_TO_LEGACY_PANEL[workspaceSession.stage] ?? "roster");
  const [legacyEditorEnabled] = useState(() => typeof window !== "undefined"
    && loadBrowserValue(() => window.localStorage.getItem(LEGACY_EDITOR_STORAGE_KEY) === "1", false));
  const [activeStage, setActiveStage] = useState<WorkflowStageId>(() => legacyEditorEnabled ? "content" : workspaceSession.stage);
  const lastNonTemplateStageRef = useRef<WorkflowStageId>(activeStage === "data" ? "content" : activeStage);
  const [assistantDrawerOpen, setAssistantDrawerOpen] = useState(false);
  const assistantEntryRef = useRef<HTMLButtonElement>(null);
  const [activeWorkflowStep, setActiveWorkflowStep] = useState<WorkflowStepId>("roster");
  const [globalSettingsSection, setGlobalSettingsSection] = useState<GlobalSettingsSection | null>(null);
  const chrome = useStudioChrome();
  const { themeMode, setThemeMode, skin, setSkin, resolvedTheme } = chrome;

  const resolvedRenderInterval = renderIntervalMs(renderSettings);
  const workflowProgress = useMemo(() => computeWorkflowProgress(project), [project]);
  useWorkspaceSessionAutosave(workspaceSession, activeStage, selection);
  const dataHealth = useMemo(() => buildDataHealthSummary(project), [project]);
  const dataIssues = useMemo(() => listDataIssues(project), [project]);
  const resourceHealthIssues = useMemo(
    () => listResourceHealthIssues(project, userAssets, userFonts),
    [project, userAssets, userFonts],
  );
  const resourceIssues = useMemo(
    () => resourceHealthIssues.filter((issue) => issue.kind === "resource"),
    [resourceHealthIssues],
  );
  const fontIssues = useMemo(
    () => resourceHealthIssues.filter((issue) => issue.kind === "font"),
    [resourceHealthIssues],
  );

  const renderProject = agentPreview ?? project;

  const template = renderProject.templateId;
  const dataView = renderProject.dataView;
  const summary = buildProvinceSummary(renderProject.students);

  const collaboration = useCollaborationSync({
    latestWorkspaceRef,
    workspace: { project, assets: userAssets, fonts: userFonts, customTemplates, renderSettings },
    setProject,
    setUserAssets,
    setUserFonts,
    setCustomTemplates,
    setRenderSettings,
    markWorkspacePending: () => workspaceSync.markPending(),
  });

  const commitProject = (next: ProjectDocument) => {
    if (!collaboration.canEdit) {
      collaboration.setCollaborationMessage("当前仅查看，无法修改此工程");
      return;
    }
    setProject(next);
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

  const { canUndo, canRedo, undoLabel, redoLabel } = describeProjectHistory(project.history);

  const handleUndo = () => {
    if (!canUndo) return;
    commitProject(undoTransaction(project));
  };

  const handleRedo = () => {
    if (!canRedo) return;
    commitProject(redoTransaction(project));
  };

  useUndoRedoShortcuts(handleUndo, handleRedo);

  const {
    captureCardPositions,
    refreshDisplayFramePositions,
    patchScene,
    applyFont,
    resetSceneTarget,
    applyProvinceThemes,
    moveProvinceTexture,
    resizeMapImage,
    moveTextElement,
    moveAssetElement,
    resizeAssetElement,
    moveCardPosition,
    moveGuestsPanel,
  } = useSceneActions({ project, showGrid, gridSize, commitProject, commitProjectTransaction, setStatusMessage });

  const {
    assetUsageById,
    addUserAsset,
    replaceUserAsset,
    deleteUserAsset,
    deleteUserFont,
    uploadUserFont,
    exportResourcePack,
    importResourcePack,
  } = useResourceLibrary({ project, userAssets, setUserAssets, userFonts, setUserFonts, commitProject, setStatusMessage });

  const handleSceneSelect = (next: SceneSelection) => {
    setSelection(next);
  };

  const locateLayoutIssue = (issue: { id: string }) => {
    const next = resolveLayoutIssueSelection(project, issue.id);
    if (next) setSelection(next);
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

  const contentLayoutIssues = useMemo(() => listContentLayoutIssues(project), [project]);

  const applySystemTemplate = (templateId: MapTemplateId) => {
    commitProject(applyTransaction(project, createApplySystemTemplateTransaction(templateId)));
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
    const record = buildCustomTemplateDraft(project, name, scope);
    const next = [record, ...customTemplates].slice(0, 20);
    setCustomTemplates(next);
    setStatusMessage(`已保存模板：${record.name}`);
  };

  const createNewProject = () => {
    if (!window.confirm("新建项目会清空当前未保存修改，是否继续？")) return;
    const next = createProjectDocument({ students: [], templateId: "original", dataView: "province" });
    setProject(next);
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
    const legacyPanel = WORKFLOW_STAGE_TO_LEGACY_PANEL[stage];
    if (!legacyPanel) return;
    setActivePanel(legacyPanel);
    setActiveWorkflowStep(stage === "map" ? "presentation" : stage === "frame" ? "layout" : stage === "export" ? "export" : "local");
  };

  const changeDataView = (view: DataViewId) => commitProjectTransaction(createDataViewTransaction(view));

  const dataWorkspaceProps = {
    students: project.students,
    dataView: project.dataView,
    onChangeDataView: changeDataView,
    onAppendStudents: (records: typeof project.students) => commitProjectTransaction(createAppendStudentsTransaction(records)),
    onReplaceStudents: (records: typeof project.students) => commitProjectTransaction(createReplaceStudentsTransaction(records)),
    onUpdateStudent: (id: string, patch: StudentEditPatch) => commitProjectTransaction(createStudentUpdateTransaction(id, patch)),
    onToggleVisibility: (id: string) => commitProjectTransaction(createStudentVisibilityToggleTransaction(id)),
    onDeleteStudent: (id: string) => commitProjectTransaction(createStudentDeleteTransaction(id)),
    onSetStudentsVisibility: (visibility: boolean) => commitProjectTransaction(createStudentsVisibilityTransaction(visibility)),
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

  const applyBackgroundAsset = (asset: StudioAsset) => {
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
  };

  const mapStyleAssetPanelProps: StageSlotsContext["assetPanelProps"] = {
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
      ownClientId={collaboration.clientId}
      roomReadonly={collaboration.roomReadonly}
      roomClosed={collaboration.roomClosed}
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
      resourceIssues,
      dataViewLabel: dataViews.find((view) => view.id === dataView)?.name ?? dataView,
      exportState: posterExport.exportState,
    }),
    [activeStage, project, workflowProgress, dataHealth, dataIssues, contentLayoutIssues, resourceIssues, dataView, posterExport.exportState],
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
    return (
      <main className="workbench-shell">
        <section className="workbench-error workbench-error--recover" role="alert">
          <span className="workbench-brand-mark"><MapPinned size={22} /></span>
          <strong>项目不存在或已删除</strong>
          <p>这个链接指向的项目已经不在本机项目列表中了。可以回到项目列表继续编辑其他项目。</p>
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

  const editorContext: StageSlotsContext = {
    project,
    renderProject,
    selection,
    selectedStudentId,
    userAssets,
    userFonts,
    dataHealth,
    dataIssues,
    layoutIssues: contentLayoutIssues,
    resourceIssues,
    fontIssues,
    dataWorkspaceProps,
    assetPanelProps: mapStyleAssetPanelProps,
    posterExport,
    posterRef,
    canUndo,
    canRedo,
    undoLabel,
    redoLabel,
    onUndo: handleUndo,
    onRedo: handleRedo,
    onSelect: handleSceneSelect,
    onSelectStudent: setSelectedStudentId,
    onPatchScene: patchScene,
    onResetScene: resetSceneTarget,
    onChangeDataView: changeDataView,
    onAddUserAsset: addUserAsset,
    onCreateDecoration: handleCreateDecoration,
    onCardPositionsResolved: captureCardPositions,
    onMoveProvinceTexture: moveProvinceTexture,
    onResizeMapImage: resizeMapImage,
    onRefreshDisplayFramePositions: refreshDisplayFramePositions,
    onLocateDeliveryIssue: locateDeliveryIssue,
    onBackToMapStage: () => {
      setActiveStage("map");
      setActivePanel("map");
    },
    onApplyFont: applyFont,
    onUploadFont: uploadUserFont,
    onDeleteUserFont: deleteUserFont,
    onMoveText: moveTextElement,
    onMoveAsset: moveAssetElement,
    onResizeAsset: resizeAssetElement,
    onMoveCard: moveCardPosition,
    onMoveGuests: moveGuestsPanel,
  };

  if (activeStage !== "content" || !legacyEditorEnabled) {
    return (
      <StudioStageScreen
        theme={resolvedTheme}
        skin={skin}
        stage={activeStage}
        ctx={editorContext}
        assistantEntry={assistantEntryButton}
        historyActions={historyActionsNode}
        projectActions={projectActionsNode}
        workflowNav={workflowNavNode}
        leftRail={studioAssistantRail}
        drawerOpen={assistantDrawerOpen}
        onDrawerClose={() => setAssistantDrawerOpen(false)}
      />
    );
  }

  return (
    <LegacyEditorChrome
      ctx={editorContext}
      chrome={chrome}
      activeStage={activeStage}
      activePanel={activePanel}
      workflowProgress={workflowProgress}
      projectId={projectId}
      summary={summary}
      syncState={syncState}
      statusMessage={statusMessage}
      customTemplates={customTemplates}
      showGrid={showGrid}
      gridSize={gridSize}
      renderIntervalMs={resolvedRenderInterval}
      assistantRail={studioAssistantRail}
      projectActions={projectExportActions}
      commitProject={commitProject}
      onStatusMessage={setStatusMessage}
      onActivePanelChange={setActivePanel}
      onStageChange={handleWorkflowStageChange}
      onSetActiveStage={setActiveStage}
      onSetActiveWorkflowStep={setActiveWorkflowStep}
      onOpenGlobalData={openGlobalData}
      onOpenGlobalSettings={setGlobalSettingsSection}
      onApplySystemTemplate={applySystemTemplate}
      onApplyCustomTemplate={applyCustomTemplateRecord}
      onSaveTemplate={saveCurrentTemplate}
      onSaveLocal={() => void overwriteBrowserStorage()}
      onBackToWorkbench={() => void handleBackToWorkbench()}
    />
  );
}

export function App({ projectId }: { projectId?: string }) {
  return <AssistantConversationProvider><StudioApp projectId={projectId} /></AssistantConversationProvider>;
}
