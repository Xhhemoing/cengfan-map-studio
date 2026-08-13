import type { ReactNode } from "react";
import { StudioEditorShell } from "./StudioEditorShell";
import { StudioTopbar } from "./StudioTopbar";
import { StudioAssistantDrawer } from "./StudioAssistantDrawer";
import type { WorkflowStageId } from "../lib/workflow-stages";

/** 阶段渲染分派返回的槽位（T1）。rightRailLabel 由 STAGE_METADATA 提供，不在此重复。 */
export interface StageSlots {
  /** 阶段专属顶栏动作（如内容阶段的历史/刷新/返回地图样式）。 */
  stageActions?: ReactNode;
  /** 右栏：本阶段具体编辑工具。 */
  rightRail: ReactNode;
  /** 中心画布内容（各阶段 workspace）。 */
  workspace: ReactNode;
}

export type StudioLayoutTemplateProps = {
  /** 编辑器主题（浅色/深色/跟随系统）与皮肤（atelier/classic）。 */
  theme: string;
  skin: string;
  stage: WorkflowStageId;
  /** 顶栏 AI/高级功能入口按钮（移动端唤起抽屉）。 */
  assistantEntry: ReactNode;
  /** 全局高频动作（撤销/重做，所有阶段可见）。 */
  historyActions?: ReactNode;
  /** 阶段专属顶栏动作（如内容阶段的历史/刷新/返回地图样式）。 */
  stageActions?: ReactNode;
  /** 顶栏右侧工程动作（返回工作台/导出/项目菜单/主题皮肤）。 */
  projectActions: ReactNode;
  /** 顶栏六步工作流导航。 */
  workflowNav: ReactNode;
  /** 左栏：AI 助手 + 高级功能总览。 */
  leftRail: ReactNode;
  /** 右栏：本阶段具体编辑工具。 */
  rightRail: ReactNode;
  /** 右栏标题（检查器/编辑工具的 aria-label）。 */
  rightRailLabel: string;
  /** 移动端 AI 抽屉开关状态。 */
  drawerOpen: boolean;
  onDrawerClose: () => void;
  /** 中心画布内容（各阶段 workspace）。 */
  children: ReactNode;
};

/**
 * 全局布局模板（T1 模板化落点）。
 *
 * 所有聚焦阶段的唯一页面外壳：app-shell 容器 + 顶栏（品牌/步骤条/动作组）
 * + 三栏编辑器（左 AI/总览、中画布、右编辑工具）+ 移动端 AI 抽屉。
 * 阶段之间只通过槽位（slots）区分内容，外壳本身完全共用。
 */
export function StudioLayoutTemplate({
  theme,
  skin,
  stage,
  assistantEntry,
  historyActions,
  stageActions,
  projectActions,
  workflowNav,
  leftRail,
  rightRail,
  rightRailLabel,
  drawerOpen,
  onDrawerClose,
  children,
}: StudioLayoutTemplateProps) {
  return (
    <div className="app-shell" data-editor-theme={theme} data-editor-skin={skin}>
      <StudioTopbar
        assistantEntry={assistantEntry}
        historyActions={historyActions}
        stageActions={stageActions}
        projectActions={projectActions}
        workflowNav={workflowNav}
      />
      <StudioEditorShell stage={stage} leftRail={leftRail} rightRail={rightRail} rightRailLabel={rightRailLabel}>
        {children}
      </StudioEditorShell>
      <StudioAssistantDrawer open={drawerOpen} onClose={onDrawerClose} label="AI 助手与高级功能">
        {leftRail}
      </StudioAssistantDrawer>
    </div>
  );
}
