import { useState } from "react";

/**
 * 撤销/重做的读屏播报状态（WCAG 4.1.3 状态消息），与顶栏 HistoryActionsGroup /
 * 经典编辑器顶栏相同的模式：撤销/重做本身零反馈，按钮 aria-label 的静默更新
 * 不会被读出，点击时用点击前的标签播报「已撤销：某步骤 / 已重做：某步骤」。
 * 返回的 announcement 在两次播报之间切换一个隐形 NBSP 后缀，保证连续撤销
 * 两个同名步骤时 DOM 文本仍有变化（aria-live 不会复读完全相同的文本）。
 * 调用方需把 announcement 渲染进一个持久存在的 sr-only polite live region。
 * （独立成文件供 HistoryControls 与 GlobalSettingsScreen 复用同一模式。）
 */
export function useHistoryAnnouncement(): {
  announce: (label: string) => void;
  announcement: string;
} {
  const [state, setState] = useState({ text: "", tick: 0 });
  const announce = (label: string) =>
    setState((prev) => ({ text: `已${label}`, tick: prev.tick + 1 }));
  return {
    announce,
    announcement: state.tick % 2 === 1 ? `${state.text}\u00A0` : state.text,
  };
}
