import { AlertTriangle, CheckCircle2, Copy, Eye, EyeOff, Globe2, MapPin } from "lucide-react";
import type { DataHealthSummary, DataIssueKind } from "../lib/data-health";
import { PanelHeader } from "./StudioUi";

const actionableIssues: Partial<Record<keyof DataHealthSummary, { kind: DataIssueKind; label: string }>> = {
  hidden: { kind: "hidden", label: "查看隐藏记录" },
  international: { kind: "international", label: "查看海外去向" },
  unresolved: { kind: "unresolved-location", label: "查看未匹配城市" },
  missingRequired: { kind: "missing-field", label: "查看缺失字段" },
  duplicate: { kind: "duplicate", label: "查看重复记录" },
};

export function DataOverview({
  summary,
  dataViewLabel,
  onOpenIssues,
}: {
  summary: DataHealthSummary;
  dataViewLabel: string;
  onOpenIssues: (kind: DataIssueKind) => void;
}) {
  const metrics: Array<{ id: keyof DataHealthSummary; label: string; value: number; icon: typeof MapPin }> = [
    { id: "total", label: "总记录", value: summary.total, icon: MapPin },
    { id: "visible", label: "可见记录", value: summary.visible, icon: Eye },
    { id: "hidden", label: "隐藏记录", value: summary.hidden, icon: EyeOff },
    { id: "unresolved", label: "未匹配城市", value: summary.unresolved, icon: AlertTriangle },
    { id: "international", label: "海外去向", value: summary.international, icon: Globe2 },
    { id: "missingRequired", label: "缺失字段", value: summary.missingRequired, icon: AlertTriangle },
    { id: "duplicate", label: "重复记录", value: summary.duplicate ?? 0, icon: Copy },
  ];

  return (
    <section className="data-overview" aria-label="数据总览">
      <PanelHeader title="数据总览" meta={`当前呈现：${dataViewLabel}`} />
      <div className="data-overview__metrics">
        {metrics.map(({ id, label, value, icon: Icon }) => {
          const action = actionableIssues[id];
          const content = (
            <>
              <Icon size={15} aria-hidden />
              <strong>{value}</strong>
              <span>{label}</span>
            </>
          );
          return action ? (
            <button
              key={id}
              type="button"
              className={`data-overview__metric data-overview__metric--${id}`}
              aria-label={action.label}
              onClick={() => onOpenIssues(action.kind)}
            >
              {content}
            </button>
          ) : (
            <div key={id} className={`data-overview__metric data-overview__metric--${id}`}>
              {content}
            </div>
          );
        })}
      </div>
      <div className="data-overview__status" data-status={summary.unresolved || summary.missingRequired || (summary.duplicate ?? 0) ? "warning" : "ready"}>
        {summary.unresolved || summary.missingRequired || (summary.duplicate ?? 0) ? <AlertTriangle size={16} aria-hidden /> : <CheckCircle2 size={16} aria-hidden />}
        <span>
          {summary.unresolved || summary.missingRequired || (summary.duplicate ?? 0)
            ? `还有 ${summary.unresolved + summary.missingRequired + (summary.duplicate ?? 0)} 项数据需要检查`
            : "数据状态良好，可以继续编辑"}
        </span>
      </div>
    </section>
  );
}
