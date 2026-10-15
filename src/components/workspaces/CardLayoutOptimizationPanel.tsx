import { useId } from "react";
import { Check, LayoutTemplate, LoaderCircle, X } from "lucide-react";
import type { CardLayoutGoal, CardLayoutProposal } from "../../lib/card-layout-proposals";
import type { CardLayoutOptimizationController } from "../../lib/use-card-layout-optimization";
import "./card-layout-optimization.css";

export interface CardLayoutOptimizationPanelProps {
  controller: CardLayoutOptimizationController;
  onApply: (proposal: CardLayoutProposal) => void;
  canEdit?: boolean;
}

const goals: Array<{ id: CardLayoutGoal; label: string; detail: string }> = [
  { id: "balanced", label: "均衡简洁", detail: "兼顾连接线与画面分布" },
  { id: "readable", label: "名单易读", detail: "保留字号，优先消除正文遮挡" },
  { id: "map-clear", label: "地图清楚", detail: "让展示框避开地图主体" },
];

export function CardLayoutOptimizationPanel({ controller: c, onApply, canEdit = true }: CardLayoutOptimizationPanelProps) {
  const contentId = useId();
  const headingId = useId();
  if (!c.open) return (
    <button type="button" className="card-layout-optimization__entry" onClick={() => c.setOpen(true)}>
      <LayoutTemplate size={17} aria-hidden="true" />智能整理展示框
    </button>
  );

  return (
    <section className="card-layout-optimization" aria-labelledby={headingId}>
      <div className="card-layout-optimization__heading">
        <strong id={headingId}>智能整理展示框</strong>
        <button type="button" aria-label="关闭智能整理" onClick={c.close}><X size={17} aria-hidden="true" /></button>
      </div>
      <p>先比较方案，应用后可一步撤销。</p>
      <label htmlFor={`${contentId}-scope`}>调整范围
        <select id={`${contentId}-scope`} value={c.scope} onChange={(e) => c.setScope(e.target.value as "all" | "selected")} disabled={c.pending}>
          <option value="all">全部展示框</option>
          <option value="selected" disabled={c.selectedCount === 0}>仅选中的 {c.selectedCount} 个框</option>
        </select>
      </label>
      {c.scope === "selected" && <p className="card-layout-optimization__hint">范围外的框保持原位；锁定框始终不移动。</p>}
      <label htmlFor={`${contentId}-goal`}>整理目标
        <select id={`${contentId}-goal`} value={c.goal} onChange={(e) => c.setGoal(e.target.value as CardLayoutGoal)} disabled={c.pending}>
          {goals.map((goal) => <option key={goal.id} value={goal.id}>{goal.label}</option>)}
        </select>
        <small>{goals.find((goal) => goal.id === c.goal)?.detail}</small>
      </label>
      <label className="card-layout-optimization__check">
        <input type="checkbox" checked={c.preserveManual} onChange={(e) => c.setPreserveManual(e.target.checked)} disabled={c.pending} />
        保留手动调整的位置
      </label>
      <button type="button" className="wide-button" onClick={() => void c.generate()} disabled={c.pending || !canEdit || (c.scope === "selected" && c.selectedCount === 0)}>
        {c.pending ? <LoaderCircle className="spin" size={16} aria-hidden="true" /> : <LayoutTemplate size={16} aria-hidden="true" />}
        {c.pending ? "正在比较方案…" : "生成排布方案"}
      </button>
      {c.pending && <button type="button" className="secondary-button" onClick={c.cancel}>取消计算</button>}
      {c.error && <p className="card-layout-optimization__error" role="alert">{c.error}</p>}
      {c.stale && <p className="card-layout-optimization__error" role="status">项目或调整范围已变化，请重新生成方案。</p>}
      {c.proposals.length > 0 && (
        <div className="card-layout-optimization__proposals" role="group" aria-label="排布候选方案">
          {c.proposals.map((proposal) => (
            <button key={proposal.id} type="button" className="card-layout-optimization__proposal" aria-pressed={c.selectedId === proposal.id} disabled={c.stale} onClick={() => c.preview(proposal.id)}>
              <strong>{proposal.title}</strong>
              <span>{proposal.status === "feasible" ? `移动 ${proposal.metrics.movedCount} 个框` : proposal.status === "proven-infeasible" ? "存在明确约束冲突" : "未找到可行方案"}</span>
              <small>重叠 {proposal.metrics.overlapCount} · 越界 {proposal.metrics.outOfBoundsCount} · 连线交叉 {proposal.metrics.connectorConflicts}</small>
              <small>{proposal.explanation}</small>
            </button>
          ))}
          <div className="card-layout-optimization__actions">
            <button type="button" className="secondary-button" onClick={c.showOriginal} aria-pressed={c.selectedId === null}>查看原版</button>
            <button type="button" className="wide-button" disabled={!canEdit || c.stale || !c.selectedProposal || c.selectedProposal.status !== "feasible"} onClick={() => { if (c.selectedProposal) onApply(c.selectedProposal); }}><Check size={16} aria-hidden="true" />应用当前方案</button>
          </div>
          <p className="card-layout-optimization__hint">{c.selectedId ? "画布正在预览建议，尚未应用。" : "画布显示原版。"}{c.selectedProposal?.measurementStatus === "measured" ? "文字已按当前字体测量。" : "文字尺寸仍为估算，请在交付前检查实际效果。"}</p>
        </div>
      )}
    </section>
  );
}
