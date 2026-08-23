/**
 * 解析数字输入草稿并钳制到 [min, max]。
 *
 * - 空字符串 / 非法数字返回 null（调用方应忽略本次提交，让输入框回弹到外部值）；
 * - 越界值钳制到边界后返回，而不是静默忽略——与 RangeNumberControl 行为一致。
 */
export function clampNumberDraft(draft: string, min: number, max: number): number | null {
  if (draft.trim() === "") return null;
  const next = Number(draft);
  if (!Number.isFinite(next)) return null;
  return Math.min(max, Math.max(min, next));
}
