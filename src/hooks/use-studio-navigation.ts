/**
 * 编辑器导航状态：工作流阶段 / 旧版面板 / 全局设置分区的切换，
 * 数据、排版与交付问题的「定位」跳转，以及左栏阶段总览卡片的动作分派。
 * 自 App.tsx 提取（Round 4），行为保持一致。
 */
import { useRef, useState } from "react";
import type { GlobalSettingsSection } from "../components/GlobalSettingsScreen";
import type { DeliveryIssue } from "../components/workspaces/DeliveryWorkspace";
import type { ActivePanel } from "../lib/app-constants";
import { loadBrowserValue } from "../lib/app-initialization";
import { resolveDeliveryIssueLocation } from "../lib/delivery-target";
import type { LayoutHealthIssue } from "../lib/layout-health";
import type { ProjectDocument } from "../lib/project-document";
import type { SceneSelection } from "../lib/scene-document";
import type { StageOverviewAction } from "../lib/stage-overview";
import { resolveLayoutIssueSelection } from "../lib/studio-editor-helpers";
import { LEGACY_EDITOR_STORAGE_KEY } from "../lib/workspace-session";
import type { WorkflowStepId } from "../lib/workflow-progress";
import { WORKFLOW_STAGE_TO_LEGACY_PANEL, type WorkflowStageId } from "../lib/workflow-stages";

export interface UseStudioNavigationOptions {
  project: ProjectDocument;
  /** 上次会话记录的阶段（useWorkspaceSessionState），作为初始阶段。 */
  sessionStage: WorkflowStageId;
  setSelection: (next: SceneSelection) => void;
  setSelectedStudentId: (id: string | null) => void;
  /** 打开协作面板（useCollaborationSync 的 setCollaborationOpen）。 */
  onOpenCollaborationPanel: (open: boolean) => void;
  onExportPng: () => void;
}

export function useStudioNavigation({
  project,
  sessionStage,
  setSelection,
  setSelectedStudentId,
  onOpenCollaborationPanel,
  onExportPng,
}: UseStudioNavigationOptions) {
  const [legacyEditorEnabled] = useState(() => typeof window !== "undefined"
    && loadBrowserValue(() => window.localStorage.getItem(LEGACY_EDITOR_STORAGE_KEY) === "1", false));
  const [activePanel, setActivePanel] = useState<ActivePanel>(() => WORKFLOW_STAGE_TO_LEGACY_PANEL[sessionStage] ?? "roster");
  const [activeStage, setActiveStage] = useState<WorkflowStageId>(() => legacyEditorEnabled ? "content" : sessionStage);
  const lastNonTemplateStageRef = useRef<WorkflowStageId>(activeStage === "data" ? "content" : activeStage);
  const [activeWorkflowStep, setActiveWorkflowStep] = useState<WorkflowStepId>("roster");
  const [globalSettingsSection, setGlobalSettingsSection] = useState<GlobalSettingsSection | null>(null);

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
    onOpenCollaborationPanel(true);
  };
  const openDataDiagnostics = () => {
    setGlobalSettingsSection("cards");
  };
  const openRenderSettings = () => {
    setGlobalSettingsSection("advanced");
  };

  /** 体检报告随附 targets 时优先按原始 id 定位——卡片分组键含 ":" 时拆拼接 id 会认错对象。 */
  const locateLayoutIssue = (issue: Pick<LayoutHealthIssue, "id" | "targets">) => {
    const next = resolveLayoutIssueSelection(project, issue.id, issue.targets);
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
      onExportPng();
      return;
    }
  };

  return {
    legacyEditorEnabled,
    activePanel,
    setActivePanel,
    activeStage,
    setActiveStage,
    activeWorkflowStep,
    setActiveWorkflowStep,
    globalSettingsSection,
    setGlobalSettingsSection,
    openGlobalData,
    handleWorkflowStageChange,
    openStudioSettings,
    openTopbarProjectMenu,
    openCollaborationSettings,
    openDataDiagnostics,
    openRenderSettings,
    locateLayoutIssue,
    locateDeliveryIssue,
    handleStageOverviewAction,
  };
}

export type StudioNavigation = ReturnType<typeof useStudioNavigation>;
