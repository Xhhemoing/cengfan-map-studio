import { useEffect } from "react";

/**
 * Cmd/Ctrl+Z 撤销、Shift+Cmd/Ctrl+Z 或 Cmd/Ctrl+Y 重做；
 * 输入控件与可编辑区域内不拦截。与提取前的 App 内联效果一致：
 * 不带依赖数组，每次渲染重新绑定以捕获最新的撤销/重做闭包。
 */
export function useUndoRedoShortcuts(onUndo: () => void, onRedo: () => void): void {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select" || target?.isContentEditable) {
        return;
      }
      const key = event.key.toLowerCase();
      const mod = event.metaKey || event.ctrlKey;
      if (!mod) return;
      if (key === "z" && !event.shiftKey) {
        event.preventDefault();
        onUndo();
        return;
      }
      if ((key === "z" && event.shiftKey) || key === "y") {
        event.preventDefault();
        onRedo();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });
}
