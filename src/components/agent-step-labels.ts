import type { AgentStep } from '../lib/agent-session';

export function stepLabel(step: AgentStep): string {
  const patch = step.arguments.patch;
  if (patch && typeof patch === "object" && !Array.isArray(patch)) {
    const fields = Object.keys(patch as Record<string, unknown>);
    if (fields.length > 0) return `${step.name}：${fields.join("、")}`;
  }
  if (step.name === "set_data_view") return `切换数据视图：${String(step.arguments.view ?? "")}`;
  if (step.name === "auto_layout") return `自动排版：${String(step.arguments.mode ?? "quadrant")}`;
  return step.name;
}

export function riskLabel(risk: AgentStep["risk"]): string {
  if (risk === "high") return "高风险";
  if (risk === "medium") return "中风险";
  return "低风险";
}
