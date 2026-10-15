import type { ProjectDocument } from "./project-document";

export type RiskLevel = "low" | "medium" | "high";

export interface AgentToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface RiskAssessment {
  level: RiskLevel;
  reason: string;
}

function hasManualPositions(project: ProjectDocument): boolean {
  return Object.keys(project.cards.positions ?? {}).length > 0;
}

export function classifyAgentCall(project: ProjectDocument, call: AgentToolCall): RiskAssessment {
  const { name, arguments: args } = call;
  if (name === "manage_students") {
    const action = String(args.action ?? "");
    if (action === "update_fact") return { level: "high", reason: "改写学生姓名、院校或城市事实字段" };
    if (action === "remove_duplicate") return { level: "high", reason: "删除重复学生记录" };
    return { level: "low", reason: "显示或隐藏学生记录，可撤销" };
  }
  if (name === "auto_layout") {
    return hasManualPositions(project) && args.preservePositions !== true
      ? { level: "high", reason: "自动排版会丢弃手工卡片位置" }
      : { level: "medium", reason: "自动排版会重新计算卡片位置" };
  }
  if (name === "update_asset") {
    const patch = (args.patch ?? {}) as Record<string, unknown>;
    return patch.visibility === false
      ? { level: "high", reason: "隐藏贴图元素" }
      : { level: "low", reason: "调整贴图样式或位置" };
  }
  if (name === "set_data_view") return { level: "medium", reason: "切换数据分组视图" };
  if (name === "apply_card_style") return { level: "medium", reason: args.mode === "visual-and-layout" ? "修改展示框外观与分组布局" : "应用展示框样式并可能改变尺寸" };
  if (name === "update_cards") {
    const patch = (args.patch ?? args) as Record<string, unknown>;
    if (["preset", "presentation", "visibleFields", "layoutMode", "columns", "fontSize", "fieldFonts", "fieldTypography", "maxWidth", "padding", "horizontalPadding", "bottomPadding", "gap", "compactLayout", "expressionTemplates", "nameFormat"].some((key) => key in patch)) {
      return { level: "medium", reason: "改变卡片布局结构" };
    }
  }
  if (name === "update_map") {
    const patch = (args.patch ?? args) as Record<string, unknown>;
    if (["x", "y", "width", "height", "scale"].some((key) => key in patch)) {
      return { level: "medium", reason: "改变地图尺寸或位置" };
    }
  }
  return { level: "low", reason: "单项样式调整" };
}

export function highestRisk(assessments: RiskAssessment[]): RiskLevel {
  if (assessments.some((assessment) => assessment.level === "high")) return "high";
  if (assessments.some((assessment) => assessment.level === "medium")) return "medium";
  return "low";
}
