/**
 * 学生数据中心的操作反馈分成两个常驻 live region：
 * 失败/阻断类消息进入 role="alert"（assertive），
 * 成功与过程信息保留在 role="status"（polite）。
 * 这里按消息文案中的失败关键词做纯函数判定，便于单测。
 */
const FAILURE_MARKERS = [
  "失败", "没有", "请先", "不能为空", "校验问题", "无法",
  // 体积、超时、文件损坏与能力缺失这几类阻断只报现象、不带「失败」二字，
  // 漏掉它们时用户在 role="status" 里等一条永远不会来的成功消息。
  "过大", "超时", "损坏", "不支持",
] as const;

export function isImportFailureMessage(text: string): boolean {
  return FAILURE_MARKERS.some((marker) => text.includes(marker));
}
