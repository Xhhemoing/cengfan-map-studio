import type { AgentToolCall } from "./agent-risk";
import { record } from "./agent-tool-contract";

export type LocalIntent = { kind: "actions"; calls: Array<Omit<AgentToolCall, "id">> } | { kind: "needs-input" | "unsupported"; message: string };
/** Deliberately finite grammar. A partially understood request must never become a global edit. */
export function interpretLocalIntent(message: string, digest: Record<string, unknown>): LocalIntent {
  const text = message.trim().replace(/[。！!？?]+$/u, "").replace(/^(?:请帮我|帮我|请)(?:把|将)?/u, "").replace(/^(?:把|将)/u, "").trim();
  if (/(不要|不许|不能|不改|不动|别|保持|保留|除了|仅|只|这个|这些|这里|那里|刚才|之前|选中|左边|右边|附近|锁定)/u.test(text)) {
    return { kind: "needs-input", message: "这条需求包含范围、保留要求或指代。本地规则未作修改；请使用明确的选区任务或连接完整 AI 服务。" };
  }
  const action = (name: string, args: Record<string, unknown>): LocalIntent => ({ kind: "actions", calls: [{ name, arguments: args }] });
  if (/^(?:检查|诊断)(?:一下)?(?:布局|排版)(?:问题)?$/u.test(text)) return action("check_health", {});
  if (/^(?:查看|列出)(?:展示框|卡片)(?:样式|模板)$/u.test(text)) return action("list_card_styles", {});
  const grouping = text.match(/^(?:按|切换到|改为)(省份|城市|大学|院校)(?:分组|视图)$/u);
  if (grouping) return action("set_data_view", { view: ({ 省份: "province", 城市: "city", 大学: "university", 院校: "university" } as Record<string, string>)[grouping[1]!] });
  if (/^(?:(?:展示框|卡片|名单)(?:变得|改为|变|更)?)?紧凑(?:一点|些)?$/u.test(text)) return action("update_cards", { patch: { compactLayout: true } });
  const scale = text.match(/^(?:地图|map)(?:再)?(缩小|放大|小一点|大一点|小些|大些)(?:一点|一些|点|些)?$/iu);
  if (scale) {
    const current = record(digest.map) ? digest.map.scale : undefined;
    if (typeof current !== "number" || !Number.isFinite(current)) return { kind: "needs-input", message: "未读取到地图当前缩放值，本地规则未作修改。" };
    const ratio = /^(?:缩小|小)/u.test(scale[1]!) ? 0.85 : 1.15;
    return action("update_map", { patch: { scale: Math.min(3, Math.max(0.1, Number((current * ratio).toFixed(2)))) } });
  }
  return { kind: "unsupported", message: "本地规则未识别完整需求，未作修改。支持“地图缩小一点”“按城市分组”“展示框紧凑一点”“检查布局”；复杂调整需要完整 AI 服务。" };
}
