/**
 * 学生数据中心的操作反馈分成两个常驻 live region：
 * 失败/阻断类消息进入 role="alert"（assertive），
 * 成功与过程信息保留在 role="status"（polite）。
 * 这里按消息文案中的失败关键词做纯函数判定，便于单测。
 */
const FAILURE_MARKERS = [
  "失败", "没有", "请先", "不能为空", "校验问题", "无法",
  // 体积超限与解析超时同样是阻断：漏了这几个词，最该打断人的两条消息只会被轻声念过去。
  "过大", "超时", "损坏", "不支持",
] as const;

export function isImportFailureMessage(text: string): boolean {
  return FAILURE_MARKERS.some((marker) => text.includes(marker));
}
