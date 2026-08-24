import { useRef, useState } from "react";

import { AssistantConversationProvider } from "./components/AgentAssistant";
import { StudioAssistantRail } from "./components/StudioAssistantRail";
import { WorkflowStageStepper } from "./components/WorkflowStageStepper";
import "./components/workflow-workspaces.css";

import { GlobalSettingsRoute } from "./components/studio-editor/GlobalSettingsRoute";
import { LegacyEditorChrome } from "./components/studio-editor/LegacyEditorChrome";
import type { StageSlotsContext } from "./components/studio-editor/stage-slots";
import { StudioStageScreen } from "./components/studio-editor/StudioStageScreen";
import { ProjectLoadingScreen, ProjectMissingScreen } from "./components/studio-editor/StudioStatusScreens";
import {
  AssistantEntryButton,
  HistoryActionsGroup,
  ProjectActionsGroup,
  ProjectMenuGroup,
} from "./components/studio-editor/StudioTopbarActions";
import {
  buildAssetPanelProps,
  buildDataWorkspaceProps,
  buildStageSlotsContext,
} from "./components/studio-editor/workspace-props";

import { useCollaborationSync } from "./hooks/use-collaboration-sync";
import { useProjectActions } from "./hooks/use-project-actions";
import { useProjectCommits } from "./hooks/use-project-commits";
import { useProjectHealth } from "./hooks/use-project-health";
import { useResourceLibrary } from "./hooks/use-resource-library";
import { useSceneActions } from "./hooks/use-scene-actions";
import { useStudioChrome } from "./hooks/use-studio-chrome";
import { useStudioNavigation } from "./hooks/use-studio-navigation";
import { useWorkspacePersistence } from "./hooks/use-workspace-persistence";
import { useWorkspaceSessionAutosave, useWorkspaceSessionState } from "./hooks/use-workspace-session";

import { DEFAULT_GRID_SIZE } from "./lib/grid";
import { buildProvinceSummary, type DataViewId } from "./lib/project-data";
import { renderIntervalMs } from "./lib/render-settings";
import type { SceneSelection } from "./lib/scene-document";
import { createDataViewTransaction, deriveSessionSelection } from "./lib/studio-editor-helpers";
import { usePosterExport } from "./lib/usePosterExport";

/**
 * 编辑器组合根：只负责把各领域 hook（持久化 / 协作 / 提交 / 导航 / 检查 /
 * 场景 / 资源 / 工程动作）的状态与命令接线到四个页面之一——加载壳、
 * 全局设置、聚焦阶段（StudioStageScreen）或旧版编辑器（LegacyEditorChrome）。
 */
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
  const workspaceSession = useWorkspaceSessionState();
  const [selection, setSelection] = useState<SceneSelection>(() => deriveSessionSelection(workspaceSession));
  const [selectedStudentId, setSelectedStudentId] = useState<string | null>(null);
  const [showGrid] = useState(false);
  const [gridSize] = useState(DEFAULT_GRID_SIZE);
  const posterRef = useRef<SVGSVGElement>(null);
  const [assistantDrawerOpen, setAssistantDrawerOpen] = useState(false);
  const assistantEntryRef = useRef<HTMLButtonElement>(null);
  const chrome = useStudioChrome();
  const resolvedRenderInterval = renderIntervalMs(renderSettings);

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

  const commits = useProjectCommits({
    project,
    setProject,
    collaboration,
    markWorkspacePending: () => workspaceSync.markPending(),
  });
  const { commitProject, commitProjectTransaction, history } = commits;

  const renderProject = commits.agentPreview ?? project;
  const summary = buildProvinceSummary(renderProject.students);

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

  const nav = useStudioNavigation({
    project,
    sessionStage: workspaceSession.stage,
    setSelection,
    setSelectedStudentId,
    onOpenCollaborationPanel: collaboration.setCollaborationOpen,
    onExportPng: () => void posterExport.exportPng(),
  });
  useWorkspaceSessionAutosave(workspaceSession, nav.activeStage, selection);

  const health = useProjectHealth({
    project,
    userAssets,
    userFonts,
    activeStage: nav.activeStage,
    dataView: renderProject.dataView,
    exportState: posterExport.exportState,
  });

  const scene = useSceneActions({ project, showGrid, gridSize, commitProject, commitProjectTransaction, setStatusMessage });
  const resources = useResourceLibrary({ project, userAssets, setUserAssets, userFonts, setUserFonts, commitProject, setStatusMessage });
  const actions = useProjectActions({
    project,
    customTemplates,
    setCustomTemplates,
    setProject,
    commitProject,
    setStatusMessage,
    setSelection,
    setSelectedStudentId,
    setActivePanel: nav.setActivePanel,
    setActiveWorkflowStep: nav.setActiveWorkflowStep,
    setActiveStage: nav.setActiveStage,
  });

  const handleSceneSelect = (next: SceneSelection) => {
    setSelection(next);
  };
  const changeDataView = (view: DataViewId) => commitProjectTransaction(createDataViewTransaction(view));
  const saveLocal = () => void overwriteBrowserStorage();
  const backToWorkbench = () => void handleBackToWorkbench();

  // posterRef 在对象字面量上补齐：react-hooks/refs 允许 ref 进入字面量/JSX，
  // 但禁止渲染期把 ref 作为普通函数实参传递。
  const editorContext: StageSlotsContext = {
    posterRef,
    ...buildStageSlotsContext({
      project,
      renderProject,
      selection,
      selectedStudentId,
      userAssets,
      userFonts,
      health,
      dataWorkspaceProps: buildDataWorkspaceProps({
        project,
        selectedStudentId,
        onSelectStudent: setSelectedStudentId,
        onChangeDataView: changeDataView,
        commitTransaction: commitProjectTransaction,
      }),
      assetPanelProps: buildAssetPanelProps({
        project,
        summary,
        userAssets,
        resources,
        scene,
        setSelection,
        setStatusMessage,
        onApplyBackground: actions.applyBackgroundAsset,
      }),
      posterExport,
      history,
      scene,
      resources,
      onUndo: commits.handleUndo,
      onRedo: commits.handleRedo,
      onSelect: handleSceneSelect,
      onSelectStudent: setSelectedStudentId,
      onChangeDataView: changeDataView,
      onCreateDecoration: actions.handleCreateDecoration,
      onLocateDeliveryIssue: nav.locateDeliveryIssue,
      onBackToMapStage: () => {
        nav.setActiveStage("map");
        nav.setActivePanel("map");
      },
    }),
  };

  const projectMenuNode = (
    <ProjectMenuGroup
      collaboration={collaboration}
      posterExport={posterExport}
      syncStatus={syncState.status}
      onNewProject={actions.createNewProject}
      onRestoreLocal={actions.restoreLocalProject}
      onSaveLocal={saveLocal}
    />
  );

  const studioAssistantRail = (
    <StudioAssistantRail
      project={project}
      assets={userAssets}
      syncStatus={syncState.status}
      collaboration={{ roomId: collaboration.roomId, status: collaboration.collaborationStatus, participantCount: collaboration.roomParticipants.length }}
      dataIssueCount={health.dataIssues.length}
      renderIntervalMs={resolvedRenderInterval}
      onOpenSettings={nav.openStudioSettings}
      onOpenProject={nav.openTopbarProjectMenu}
      onOpenCollaboration={nav.openCollaborationSettings}
      onOpenDataDiagnostics={nav.openDataDiagnostics}
      onOpenRenderSettings={nav.openRenderSettings}
      selection={selection}
      layoutIssues={health.contentLayoutIssues}
      onSelectElement={handleSceneSelect}
      onLocateLayoutIssue={nav.locateLayoutIssue}
      onPreview={commits.setAgentPreview}
      onCommit={commitProjectTransaction}
      stageOverview={health.stageOverview}
      onStageOverviewAction={nav.handleStageOverviewAction}
    />
  );

  if (projectId && projectLoading) return <ProjectLoadingScreen />;
  if (projectMissing) return <ProjectMissingScreen />;

  if (nav.globalSettingsSection) {
    return (
      <GlobalSettingsRoute
        ctx={editorContext}
        section={nav.globalSettingsSection}
        chrome={chrome}
        activeStage={nav.activeStage}
        workflowProgress={health.workflowProgress}
        workflowActiveStep={nav.activeWorkflowStep}
        projectId={projectId}
        currentTemplateId={renderProject.templateId}
        customTemplates={customTemplates}
        onStageChange={nav.handleWorkflowStageChange}
        onBackToWorkbench={backToWorkbench}
        onClose={() => nav.setGlobalSettingsSection(null)}
        onApplyTemplate={actions.applySystemTemplate}
        onApplyCustomTemplate={actions.applyCustomTemplateRecord}
        onSaveTemplate={actions.saveCurrentTemplate}
        onOpenGlobalData={nav.openGlobalData}
      />
    );
  }

  if (nav.activeStage !== "content" || !nav.legacyEditorEnabled) {
    return (
      <StudioStageScreen
        theme={chrome.resolvedTheme}
        skin={chrome.skin}
        stage={nav.activeStage}
        ctx={editorContext}
        assistantEntry={
          <AssistantEntryButton open={assistantDrawerOpen} onOpen={() => setAssistantDrawerOpen(true)} buttonRef={assistantEntryRef} />
        }
        historyActions={<HistoryActionsGroup history={history} onUndo={commits.handleUndo} onRedo={commits.handleRedo} />}
        projectActions={
          <ProjectActionsGroup showBack={Boolean(projectId)} onBack={backToWorkbench} projectMenu={projectMenuNode} chrome={chrome} />
        }
        workflowNav={
          <WorkflowStageStepper activeId={nav.activeStage} project={project} progress={health.workflowProgress} onChange={nav.handleWorkflowStageChange} />
        }
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
      activeStage={nav.activeStage}
      activePanel={nav.activePanel}
      workflowProgress={health.workflowProgress}
      projectId={projectId}
      summary={summary}
      syncState={syncState}
      statusMessage={statusMessage}
      customTemplates={customTemplates}
      showGrid={showGrid}
      gridSize={gridSize}
      renderIntervalMs={resolvedRenderInterval}
      assistantRail={studioAssistantRail}
      projectActions={projectMenuNode}
      commitProject={commitProject}
      onStatusMessage={setStatusMessage}
      onActivePanelChange={nav.setActivePanel}
      onStageChange={nav.handleWorkflowStageChange}
      onSetActiveStage={nav.setActiveStage}
      onSetActiveWorkflowStep={nav.setActiveWorkflowStep}
      onOpenGlobalData={nav.openGlobalData}
      onOpenGlobalSettings={nav.setGlobalSettingsSection}
      onApplySystemTemplate={actions.applySystemTemplate}
      onApplyCustomTemplate={actions.applyCustomTemplateRecord}
      onSaveTemplate={actions.saveCurrentTemplate}
      onSaveLocal={saveLocal}
      onBackToWorkbench={backToWorkbench}
    />
  );
}

export function App({ projectId }: { projectId?: string }) {
  return <AssistantConversationProvider><StudioApp projectId={projectId} /></AssistantConversationProvider>;
}
