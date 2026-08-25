import type { ProjectDocument } from "./project-document";

/** 顶栏历史按钮的可用状态与文案。 */
export interface HistoryActionLabels {
  canUndo: boolean;
  canRedo: boolean;
  undoLabel: string;
  redoLabel: string;
}

/**
 * 按钮文案要说出「撤销的是哪一步」。历史条目没带标签时退回中性说法,
 * 而不是让按钮显示一个空的冒号。
 */
export function describeHistoryActions(project: ProjectDocument): HistoryActionLabels {
  const { past, future } = project.history;
  const canUndo = past.length > 0;
  const canRedo = future.length > 0;
  return {
    canUndo,
    canRedo,
    undoLabel: canUndo ? `撤销：${past[past.length - 1]?.label ?? "上一步"}` : "暂无可撤销操作",
    redoLabel: canRedo ? `重做：${future[0]?.label ?? "下一步"}` : "暂无可重做操作",
  };
}

/** 只取快捷键判定需要的字段,测试不必造一个完整的 KeyboardEvent。 */
export interface EditorShortcutEvent {
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  target: EventTarget | null;
}

/**
 * 撤销/重做快捷键。输入控件里的 Cmd+Z 属于输入法与浏览器自己的撤销栈,
 * 抢过来会把用户正在打的字连同工程一起回退,所以先让路。
 */
export function matchEditorHistoryShortcut(event: EditorShortcutEvent): "undo" | "redo" | null {
  const target = event.target as HTMLElement | null;
  const tag = target?.tagName?.toLowerCase();
  if (tag === "input" || tag === "textarea" || tag === "select" || target?.isContentEditable) return null;
  if (!(event.metaKey || event.ctrlKey)) return null;
  const key = event.key.toLowerCase();
  if (key === "z" && !event.shiftKey) return "undo";
  if ((key === "z" && event.shiftKey) || key === "y") return "redo";
  return null;
}
