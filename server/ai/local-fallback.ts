import { parseStudentText } from "../../src/lib/import-data";
import { chooseLayoutStrategy } from "../../src/lib/layout-strategy";
import type {
  EditorCommandPayload,
  ParseDataRequest,
  ProposeEditsRequest,
} from "./schemas";

function commandId(prefix: string): string {
  return `cmd-${prefix}-${Math.random().toString(36).slice(2, 10)}`;
}

export function localParseData(request: ParseDataRequest) {
  const parsed = parseStudentText(request.text);
  return {
    provider: "local-fallback",
    source: request.source,
    candidates: parsed.candidates,
    unparsed: parsed.unparsed,
  };
}

export function localProposeEdits(request: ProposeEditsRequest) {
  const message = request.message.trim();
  const isQuestion =
    message.includes("为什么") ||
    message.includes("怎么") ||
    message.endsWith("？") ||
    message.endsWith("?");

  if (isQuestion && !message.includes("改成") && !message.includes("切换")) {
    const strategy = chooseLayoutStrategy(request.projectSummary.studentCount);
    return {
      provider: "local-fallback",
      mode: "explain" as const,
      explanation: `当前有 ${request.projectSummary.studentCount} 名学生，模板为 ${request.projectSummary.templateId}，视图为 ${request.projectSummary.dataView}。若显得拥挤，建议使用 ${strategy.cardPreset} 卡片与 ${strategy.grouping} 分组。`,
      commands: [] as EditorCommandPayload[],
    };
  }

  const commands: EditorCommandPayload[] = [];

  if (message.includes("城市")) {
    commands.push({
      id: commandId("city"),
      type: "setDataView",
      label: "切换为城市分组",
      risk: "medium",
      before: request.projectSummary.dataView,
      after: "city",
      reason: "用户要求按城市展示",
    });
  }

  if (message.includes("院校") || message.includes("大学")) {
    commands.push({
      id: commandId("university"),
      type: "setDataView",
      label: "切换为院校分组",
      risk: "medium",
      before: request.projectSummary.dataView,
      after: "university",
      reason: "用户要求按院校展示",
    });
  }

  if (message.includes("紧凑")) {
    commands.push({
      id: commandId("compact"),
      type: "setCardPreset",
      label: "切换为紧凑卡片",
      risk: "low",
      before: request.projectSummary.cardPreset,
      after: "compact",
      reason: "用户要求更紧凑的版式",
    });
  }

  if (message.includes("放大") || message.includes("地图更大")) {
    commands.push({
      id: commandId("map-scale"),
      type: "setMapScale",
      label: "放大地图",
      risk: "low",
      before: 1,
      after: 1.12,
      reason: "用户要求地图更突出",
    });
  }

  if (message.includes("水彩") || message.includes("风景")) {
    commands.push({
      id: commandId("scenery"),
      type: "setTemplate",
      label: "切换到山河风景模板",
      risk: "medium",
      before: request.projectSummary.templateId,
      after: "scenery",
      reason: "用户要求风景风格",
    });
  }

  if (message.includes("只显示学生和院校") || message.includes("隐藏城市")) {
    commands.push({
      id: commandId("fields"),
      type: "setVisibleFields",
      label: "隐藏城市字段",
      risk: "low",
      before: ["name", "university", "city"],
      after: ["name", "university"],
      reason: "用户要求减少字段",
    });
  }

  if (commands.length === 0) {
    const strategy = chooseLayoutStrategy(request.projectSummary.studentCount);
    commands.push({
      id: commandId("auto"),
      type: "setCardPreset",
      label: `按人数建议使用 ${strategy.cardPreset} 卡片`,
      risk: "low",
      before: request.projectSummary.cardPreset,
      after: strategy.cardPreset,
      reason: "未识别明确指令，给出人数自适应建议",
    });
  }

  return {
    provider: "local-fallback",
    mode: "proposal" as const,
    explanation: `已根据“${message}”生成 ${commands.length} 条可勾选修改建议。`,
    commands,
  };
}

export function localExplain(message: string, studentCount: number) {
  return {
    provider: "local-fallback",
    mode: "explain" as const,
    explanation: `关于“${message}”：当前 ${studentCount} 人适合单班海报。优先保证每人出现一次，再用紧凑卡片和省份/城市分组控制密度。`,
    commands: [] as EditorCommandPayload[],
  };
}
