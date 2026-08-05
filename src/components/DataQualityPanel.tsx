import { CheckCircle2, LocateFixed } from "lucide-react";
import type { DataIssue, DataIssueKind } from "../lib/data-health";
import { CompactButton, PanelHeader } from "./StudioUi";

const issueLabels: Record<DataIssueKind, string> = {
  "missing-field": "缺失必要字段",
  "unresolved-location": "城市未匹配",
  "manual-province": "省份覆盖",
  international: "海外去向",
  hidden: "隐藏记录",
  duplicate: "重复记录",
};

export function DataQualityPanel({
  issues,
  onSelectStudent,
}: {
  issues: DataIssue[];
  onSelectStudent: (id: string) => void;
}) {
  return (
    <section className="data-quality-panel" aria-label="数据质量">
      <PanelHeader title="数据质量" meta={`${issues.length} 项状态`} />
      {issues.length === 0 ? (
        <div className="data-quality-empty">
          <CheckCircle2 size={20} aria-hidden />
          <strong>数据状态良好</strong>
          <span>当前名单可以直接进入地图与卡片编辑。</span>
        </div>
      ) : (
        <div className="data-quality-list" role="list" aria-label="数据质量问题">
          {issues.map((issue, index) => (
            <div className={`data-quality-row data-quality-row--${issue.severity}`} key={`${issue.studentId}-${issue.kind}-${index}`} role="listitem">
              <div className="data-quality-row__content">
                <strong>{issue.studentName}</strong>
                <small>{issueLabels[issue.kind]} · {issue.detail}</small>
              </div>
              <CompactButton
                icon={<LocateFixed size={14} aria-hidden />}
                aria-label={`定位${issue.studentName}`}
                variant="secondary"
                onClick={() => onSelectStudent(issue.studentId)}
              >
                定位到名单
              </CompactButton>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
