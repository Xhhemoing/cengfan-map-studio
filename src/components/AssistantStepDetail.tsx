import type { AgentStep } from "../lib/agent-session";

const LABELS: Record<string, string> = { fontSize: "字号", maxWidth: "框宽", gap: "间距", background: "背景", textColor: "文字颜色", showCount: "显示人数", scale: "地图比例", x: "横坐标", y: "纵坐标", width: "宽度", height: "高度", columns: "列数", padding: "内边距" };
function valueLabel(value: unknown): string {
  if (typeof value === "boolean") return value ? "开启" : "关闭";
  if (typeof value === "number") return Number.isInteger(value) ? String(value) : value.toFixed(1);
  if (value === null || value === undefined) return "默认";
  return typeof value === "object" ? "自定义值" : String(value).slice(0, 100);
}

/** Facts come from successful tool results, never from the model's prose. */
export function AssistantStepDetail({ step }: { step: AgentStep }) {
  let result: Record<string, unknown>;
  try { result = JSON.parse(step.result.content) as Record<string, unknown>; } catch { return null; }
  if (!result || typeof result !== "object") return null;
  const lines: string[] = [];
  if (result.noop === true || result.noOp === true) lines.push("当前值已符合要求，无需修改");
  const changes = result.diff ?? result.changes;
  if (Array.isArray(changes)) for (const item of changes.slice(0, 6)) {
    if (!item || typeof item !== "object") continue;
    const change = item as { field?: unknown; path?: unknown; before?: unknown; after?: unknown; requested?: unknown; normalized?: unknown };
    const field = String(change.field ?? change.path ?? "属性").split(".").at(-1)!;
    lines.push(`${LABELS[field] ?? field}：${valueLabel(change.before)} → ${valueLabel(change.after)}${change.normalized === true ? "（已调整至允许值）" : ""}`);
  }
  if (result.normalized === true || result.clamped === true) lines.push("已按允许范围调整参数，以实际值为准");
  if (typeof result.movedCount === "number") lines.push(`移动 ${result.movedCount} 个展示框`);
  if (typeof result.unchangedCount === "number") lines.push(`保留 ${result.unchangedCount} 个展示框`);
  if (Array.isArray(result.scopeIds)) lines.push(`作用于 ${result.scopeIds.length} 个展示框`);
  if (Array.isArray(result.movedIds)) lines.push(`移动 ${result.movedIds.length} 个展示框`);
  if (result.measurementStatus === "estimated") lines.push("文字尺寸仍为估算，待字体就绪后复核");
  if (result.metrics && typeof result.metrics === "object") {
    const metrics = result.metrics as { before?: Record<string, unknown>; after?: Record<string, unknown> };
    const labels: Record<string, string> = { issueCount: "排版问题", overlapCount: "重叠", crossingCount: "连线交叉", connectorConflicts: "连线冲突", outOfBoundsCount: "越界", movedCount: "移动框数", minFontSize: "最小字号", totalMovement: "总移动距离" };
    for (const [key, label] of Object.entries(labels)) if (typeof metrics.before?.[key] === "number" && typeof metrics.after?.[key] === "number") lines.push(`${label} ${valueLabel(metrics.before[key])} → ${valueLabel(metrics.after[key])}`);
  }
  if (typeof result.summary === "string") lines.push(result.summary.slice(0, 180));
  return lines.length ? <small className="assistant-step-detail">{lines.join("；")}</small> : null;
}
