import type { ActivePanel } from "./app-constants";
import type { StyleLayerTarget } from "./catalog-usage";
import {
  resolveDeliveryIssueNavigation,
  resolveLayoutIssueSelection,
  resolveWorkflowPanelNavigation,
  resolveWorkflowStageNavigation,
  styleLayerSelection,
  type EditorDeliveryIssue,
} from "./editor-navigation";
import type { ProjectDocument } from "./project-document";
import type { SceneSelection } from "./scene-document";
import type { StageOverviewAction } from "./stage-overview";
import type { WorkflowStageId } from "./workflow-stages";
import type { WorkflowStepId } from "./workflow-progress";

/**
 * 编辑器内的导航动作:哪里跳到哪里由 `editor-navigation` 的纯解析决定,这一层只负责
 * 把解析结果落到状态上,以及那几处「跳转顺带做点别的」的接线。
 */

/** 全局设置里这三个分区是导航会主动打开的,是 GlobalSettingsSection 的子集。 */
export type EditorSettingsSection = "canvas" | "cards" | "advanced";

export interface EditorNavigationActionDeps {
  project: ProjectDocument;
  activeStage: WorkflowStageId;
  /** 记下离开前停在哪个非数据阶段,数据阶段是个「侧入口」,不该顶掉来路。 */
  rememberStage(stage: WorkflowStageId): void;
  setSelection(selection: SceneSelection): void;
  setSelectedStudentId(id: string | null): void;
  setActiveStage(stage: WorkflowStageId): void;
  setActivePanel(panel: ActivePanel): void;
  setActiveWorkflowStep(step: WorkflowStepId): void;
  setSettingsSection(section: EditorSettingsSection | null): void;
  /** 顶栏项目菜单是个 <details>,协作面板挂在它里面。 */
  toggleProjectMenu(): void;
  setCollaborationOpen(open: boolean): void;
  exportPng(): void;
  /**
   * 旧版编辑器仍以「全局设置」承载画布/展示框/渲染三块设置;新版把它们拆进了
   * 名单/版式/内容三个阶段,同一个入口按钮在两条路径上要落到不同的地方。
   */
  legacyEditorEnabled?: boolean;
}

export function createEditorNavigationActions(deps: EditorNavigationActionDeps) {
  const { setSelection, setActivePanel, setActiveStage, setActiveWorkflowStep, setSettingsSection } = deps;

  const selectScene = (next: SceneSelection) => {
    setSelection(next);
  };

  const locateLayoutIssue = (issue: { id: string }) => {
    const next = resolveLayoutIssueSelection(deps.project, issue);
    if (next) setSelection(next);
  };

  const locateDeliveryIssue = (item: EditorDeliveryIssue) => {
    const navigation = resolveDeliveryIssueNavigation(deps.project, item);
    if (!navigation) return;
    if (navigation.studentId !== undefined) deps.setSelectedStudentId(navigation.studentId);
    if (navigation.selection) setSelection(navigation.selection);
    setActiveStage(navigation.stage);
    setActivePanel(navigation.panel);
  };

  const openGlobalData = () => {
    if (deps.activeStage !== "data") deps.rememberStage(deps.activeStage);
    setSettingsSection(null);
    setActivePanel("roster");
    setActiveWorkflowStep("roster");
    setActiveStage("data");
  };

  const changeWorkflowStage = (stage: WorkflowStageId) => {
    setSettingsSection(null);
    if (stage !== "data") deps.rememberStage(stage);
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

  const openDataDiagnostics = () => {
    if (deps.legacyEditorEnabled) {
      setSettingsSection("cards");
      return;
    }
    openGlobalData();
  };

  const openTopbarProjectMenu = () => {
    deps.toggleProjectMenu();
  };

  return {
    selectScene,
    locateLayoutIssue,
    locateDeliveryIssue,
    openGlobalData,
    openDataDiagnostics,
    openTopbarProjectMenu,

    selectStyleLayer: (target: StyleLayerTarget) => {
      setSelection(styleLayerSelection(target));
    },

    /**
     * 旧版内容编辑器里点省份要顺手把素材面板带出来;地图阶段有自己的工作台,
     * 不能被这条旧接线拽走。
     */
    selectLegacyScene: (next: SceneSelection) => {
      selectScene(next);
      if (deps.activeStage === "content" && next.type === "province") setActivePanel("assets");
    },

    changeWorkflowStage,

    changeWorkflowPanel: (panel: ActivePanel) => {
      const navigation = resolveWorkflowPanelNavigation(panel);
      setActiveStage(navigation.stage);
      if (panel === "roster") {
        openGlobalData();
        return;
      }
      setActivePanel(panel);
      setActiveWorkflowStep(navigation.step);
    },

    openStudioSettings: () => {
      if (deps.legacyEditorEnabled) {
        setActiveWorkflowStep("layout");
        setSettingsSection("canvas");
        return;
      }
      changeWorkflowStage("frame");
    },

    openCollaborationSettings: () => {
      deps.toggleProjectMenu();
      deps.setCollaborationOpen(true);
    },

    openRenderSettings: () => {
      if (deps.legacyEditorEnabled) {
        setSettingsSection("advanced");
        return;
      }
      changeWorkflowStage("content");
    },

    /** 阶段总览卡片上的按钮:每种动作都落到上面某一条既有导航。 */
    runStageOverviewAction: (action: StageOverviewAction) => {
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
        deps.exportPng();
        return;
      }
    },
  };
}
