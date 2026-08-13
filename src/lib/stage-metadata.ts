import type { WorkflowStageId } from "./workflow-stages";

/**
 * 阶段 shell 槽位元数据（T1 模板化）。
 *
 * 只承载「编辑器外壳」需要的静态信息；阶段的 label/description 等
 * 语义信息继续以 WORKFLOW_STAGES 为单一事实源，此处不重复。
 */
export interface StageShellMetadata {
  /** 右栏（检查器/编辑工具）标题，也用作右侧抽屉的 aria-label。 */
  rightRailLabel: string;
}

export const STAGE_METADATA = {
  template: { rightRailLabel: "模板列表" },
  data: { rightRailLabel: "数据质量与素材" },
  map: { rightRailLabel: "地图对象属性" },
  frame: { rightRailLabel: "展示框公共样式" },
  content: { rightRailLabel: "内容对象属性" },
  export: { rightRailLabel: "导出与检查" },
} satisfies Record<WorkflowStageId, StageShellMetadata>;
