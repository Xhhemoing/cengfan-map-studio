import type { DataHealthSummary, DataIssue } from "./data-health";
import { deriveFixedDisplayFrameFromCardSettings, normalizeDisplayFrame } from "./display-frame";
import type { LayoutHealthIssue } from "./layout-health";
import type { ProjectDocument } from "./project-document";
import type { ResourceHealthIssue } from "./resource-health";
import type { WorkflowStepStatus } from "./workflow-progress";
import type { WorkflowStageId, WorkflowStageProgress } from "./workflow-stages";

/**
 * 左栏「本阶段」总览的数据契约（T2）。
 *
 * 设计约束（评审要求）：
 * - 派生层只读：derive 函数只接收已有派生数据（dataHealth/issues/…），不触碰 setter/refs/hook。
 * - 每张卡回答「当前阶段最需要做的决定是什么」，优先异常/缺失/待处理，其次才是状态回显。
 * - 模型可 JSON 序列化，不含函数与可变对象。
 */

export type StageOverviewSeverity = "ok" | "warning" | "info";

/** 与 DeliveryWorkspace 的 DeliveryIssue 结构兼容的最小联合。 */
export type StageOverviewDeliveryIssue =
  | { kind: "data"; issue: DataIssue }
  | { kind: "layout"; issue: LayoutHealthIssue }
  | { kind: "resource"; issue: ResourceHealthIssue };

export type StageOverviewAction =
  | { kind: "data-diagnostics" }
  | { kind: "locate-layout"; issue: LayoutHealthIssue }
  | { kind: "locate-delivery"; issue: StageOverviewDeliveryIssue }
  | { kind: "elements" }
  | { kind: "stage"; stage: WorkflowStageId }
  | { kind: "export-png" };

export interface StageOverviewCard {
  id: string;
  /** 卡片标题：回答「当前阶段最需要做的决定是什么」。 */
  question: string;
  /** 状态文本。 */
  status: string;
  severity: StageOverviewSeverity;
  /** 点击卡片执行的跳转/定位动作。 */
  action?: StageOverviewAction;
}

export interface StageOverviewModel {
  stage: WorkflowStageId;
  progressStatus: WorkflowStepStatus;
  cards: StageOverviewCard[];
}

export interface StageOverviewInput {
  stage: WorkflowStageId;
  project: ProjectDocument;
  stageProgress: Record<WorkflowStageId, WorkflowStageProgress>;
  dataHealth: DataHealthSummary;
  dataIssues: DataIssue[];
  layoutIssues: LayoutHealthIssue[];
  resourceIssues: ResourceHealthIssue[];
  dataViewLabel: string;
  exportState: "idle" | "exporting" | "success" | "error";
}

export const MAX_OVERVIEW_CARDS = 4;

const EXPORT_STATE_LABELS = {
  idle: "尚未导出",
  exporting: "正在导出…",
  success: "上次导出成功",
  error: "上次导出失败，可重试",
} as const;

export function deriveStageOverviewModel(input: StageOverviewInput): StageOverviewModel {
  return {
    stage: input.stage,
    progressStatus: input.stageProgress[input.stage].status,
    cards: deriveStageOverviewCards(input),
  };
}

export function deriveStageOverviewCards(input: StageOverviewInput): StageOverviewCard[] {
  switch (input.stage) {
    case "template":
      return templateCards(input);
    case "data":
      return dataCards(input);
    case "map":
      return mapCards(input);
    case "frame":
      return frameCards(input);
    case "content":
      return contentCards(input);
    case "export":
      return exportCards(input);
  }
}

function templateCards(input: StageOverviewInput): StageOverviewCard[] {
  if (input.project.templateId) {
    return [{ id: "template-chosen", question: "已选择模板", status: `模板 ${input.project.templateId} 已应用`, severity: "ok" }];
  }
  return [{ id: "template-pick", question: "选择视觉模板", status: "尚未选择模板，海报缺少视觉基础", severity: "warning" }];
}

function dataCards(input: StageOverviewInput): StageOverviewCard[] {
  const h = input.dataHealth;
  const cards: StageOverviewCard[] = [];
  if (h.missingRequired > 0) {
    cards.push({ id: "data-missing", question: "补全缺失字段", status: `${h.missingRequired} 条记录缺少姓名/院校/城市`, severity: "warning", action: { kind: "data-diagnostics" } });
  }
  if (h.duplicate > 0) {
    cards.push({ id: "data-duplicate", question: "处理重复记录", status: `${h.duplicate} 组重复记录`, severity: "warning", action: { kind: "data-diagnostics" } });
  }
  if (h.unresolved > 0) {
    cards.push({ id: "data-unresolved", question: "定位未识别城市", status: `${h.unresolved} 人无法定位到地图`, severity: "warning", action: { kind: "data-diagnostics" } });
  }
  if (h.hidden > 0) {
    cards.push({ id: "data-hidden", question: "隐藏记录", status: `${h.hidden} 条记录已隐藏，不出现在海报`, severity: "info" });
  }
  if (cards.length === 0) {
    cards.push({ id: "data-clean", question: "名单数据健康", status: `${h.visible} 人 · 无缺失、无重复、全部可定位`, severity: "ok" });
  }
  return cards.slice(0, MAX_OVERVIEW_CARDS);
}

function mapCards(input: StageOverviewInput): StageOverviewCard[] {
  const h = input.dataHealth;
  const cards: StageOverviewCard[] = [];
  if (h.unresolved > 0) {
    cards.push({ id: "map-fit", question: "数据与地图适配", status: `${h.unresolved} 人无法定位，地图上会缺少对应卡片`, severity: "warning", action: { kind: "data-diagnostics" } });
  } else {
    cards.push({ id: "map-fit", question: "数据与地图适配", status: "所有去向均可定位", severity: "ok" });
  }
  const manual = input.dataIssues.filter((item) => item.kind === "manual-province").length;
  if (manual > 0) {
    cards.push({ id: "map-manual", question: "省份覆盖", status: `${manual} 人使用手动省份覆盖（优先于自动定位）`, severity: "info", action: { kind: "data-diagnostics" } });
  }
  cards.push({ id: "map-view", question: "数据呈现方式", status: input.dataViewLabel, severity: "info" });
  return cards.slice(0, MAX_OVERVIEW_CARDS);
}

function frameCards(input: StageOverviewInput): StageOverviewCard[] {
  const cards: StageOverviewCard[] = [];
  const hasOverflow = input.layoutIssues.length > 0;
  cards.push({
    id: "frame-layout",
    question: "内容是否超出展示框",
    status: hasOverflow ? `${input.layoutIssues.length} 项溢出/遮挡问题` : "无溢出或遮挡",
    severity: hasOverflow ? "warning" : "ok",
    action: hasOverflow ? { kind: "locate-layout", issue: input.layoutIssues[0] } : undefined,
  });
  // 与内容阶段同口径判断展示框是否被自定义。
  const frame = input.project.cards.displayFrame === undefined
    ? deriveFixedDisplayFrameFromCardSettings(input.project.cards)
    : normalizeDisplayFrame(input.project.cards.displayFrame);
  cards.push({
    id: "frame-config",
    question: "展示框配置",
    status: frame.fixed ? "已自定义固定展示框" : "使用默认展示框",
    severity: "info",
  });
  return cards;
}

function contentCards(input: StageOverviewInput): StageOverviewCard[] {
  const cards: StageOverviewCard[] = [];
  if (input.layoutIssues.length > 0) {
    const first = input.layoutIssues[0];
    cards.push({
      id: "content-layout",
      question: "排版问题",
      status: `${input.layoutIssues.length} 项：${first.detail}${input.layoutIssues.length > 1 ? " 等" : ""}`,
      severity: "warning",
      action: { kind: "locate-layout", issue: first },
    });
  } else {
    cards.push({ id: "content-layout", question: "排版健康", status: "未发现溢出、遮挡或文字不可读", severity: "ok" });
  }
  const elementCount = input.project.textElements.length + input.project.assetElements.length;
  cards.push({
    id: "content-elements",
    question: "画布元素",
    status: `${elementCount} 个元素`,
    severity: "info",
    action: { kind: "elements" },
  });
  return cards;
}

function exportCards(input: StageOverviewInput): StageOverviewCard[] {
  const cards: StageOverviewCard[] = [];
  const dataWarnings = input.dataIssues.filter((item) => item.severity === "warning").length;
  if (dataWarnings > 0) {
    cards.push({ id: "export-data", question: "数据告警", status: `${dataWarnings} 项数据告警会影响导出`, severity: "warning", action: { kind: "data-diagnostics" } });
  }
  if (input.layoutIssues.length > 0) {
    cards.push({ id: "export-layout", question: "排版问题", status: `${input.layoutIssues.length} 项排版问题`, severity: "warning", action: { kind: "locate-layout", issue: input.layoutIssues[0] } });
  }
  if (input.resourceIssues.length > 0) {
    cards.push({
      id: "export-resource",
      question: "资源缺失",
      status: `${input.resourceIssues.length} 处资源缺失`,
      severity: "warning",
      action: { kind: "locate-delivery", issue: { kind: "resource", issue: input.resourceIssues[0] } },
    });
  }
  if (cards.length === 0) {
    cards.push({ id: "export-clean", question: "导出检查通过", status: "数据、排版、资源均无问题", severity: "ok" });
  }
  cards.push({
    id: "export-state",
    question: "导出状态",
    status: EXPORT_STATE_LABELS[input.exportState],
    severity: input.exportState === "error" ? "warning" : "info",
    action: input.exportState === "error" ? { kind: "export-png" } : undefined,
  });
  return cards.slice(0, MAX_OVERVIEW_CARDS);
}
