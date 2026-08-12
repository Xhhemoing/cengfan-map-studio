import type { DataHealthSummary } from "../../lib/data-health";

export function GlobalDataStatus({ summary }: { summary: DataHealthSummary }) {
  return (
    <header className="global-data-header">
      <div className="global-data-header__status" aria-label="工程数据状态">
        <span><strong>{summary.visible}</strong> 可见</span>
        <span><strong>{summary.unresolved}</strong> 未匹配</span>
        <span><strong>{summary.hidden}</strong> 隐藏</span>
      </div>
    </header>
  );
}