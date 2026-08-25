import { CheckCircle2, FilterX, LocateFixed } from "lucide-react";
import { dataIssueKindLabel, resolveDataIssueId, type DataIssue } from "../lib/data-health";
import { CompactButton, PanelHeader } from "./StudioUi";

/**
 * `issues` is whatever the caller decided to show, so an empty list means one
 * of two very different things. Unfiltered it really is a clean roster; under a
 * filter it only means this bucket is empty, and saying 数据状态良好 there would
 * report a roster full of unresolved cities as ready to publish. A filtered
 * panel therefore names its filter instead, and offers a way out of it when the
 * caller has one.
 */
export function DataQualityPanel({
  issues,
  onSelectStudent,
  filterLabel,
  onClearFilter,
  totalIssues,
}: {
  issues: DataIssue[];
  onSelectStudent: (id: string) => void;
  /** Set when `issues` is a subset, e.g. one bucket opened from the overview. */
  filterLabel?: string;
  onClearFilter?: () => void;
  /** How many issues the roster has in total, so the filter can say what it hides. */
  totalIssues?: number;
}) {
  const hiddenCount = Math.max((totalIssues ?? issues.length) - issues.length, 0);
  const meta = filterLabel
    ? `已筛选「${filterLabel}」· ${issues.length} 项${hiddenCount > 0 ? `，另有 ${hiddenCount} 项未显示` : ""}`
    : `${issues.length} 项状态`;
  const clearFilter = filterLabel && onClearFilter ? (
    <CompactButton
      icon={<FilterX size={14} aria-hidden />}
      variant="secondary"
      aria-label={`清除筛选：${filterLabel}`}
      data-clear-issue-filter="true"
      onClick={onClearFilter}
    >
      清除筛选
    </CompactButton>
  ) : null;

  return (
    <section className="data-quality-panel" aria-label="数据质量">
      <PanelHeader title="数据质量" meta={meta} actions={clearFilter} />
      {issues.length === 0 ? (
        <div className="data-quality-empty">
          {filterLabel ? (
            <>
              <FilterX size={20} aria-hidden />
              <strong>没有「{filterLabel}」记录</strong>
              <span>
                {hiddenCount > 0
                  ? `名单中还有 ${hiddenCount} 项其他状态需要查看。`
                  : "当前视图没有匹配的记录。"}
              </span>
            </>
          ) : (
            <>
              <CheckCircle2 size={20} aria-hidden />
              <strong>数据状态良好</strong>
              <span>当前名单可以直接进入地图与卡片编辑。</span>
            </>
          )}
        </div>
      ) : (
        <div className="data-quality-list" role="list" aria-label="数据质量问题">
          {issues.map((issue) => {
            const issueId = resolveDataIssueId(issue);
            return (
              <div
                className={`data-quality-row data-quality-row--${issue.severity}`}
                key={issueId}
                data-issue-id={issueId}
                role="listitem"
              >
                <div className="data-quality-row__content">
                  <strong>{issue.studentName}</strong>
                  <small>{dataIssueKindLabel(issue.kind)} · {issue.detail}</small>
                </div>
                <CompactButton
                  icon={<LocateFixed size={14} aria-hidden />}
                  aria-label={`定位${issue.studentName}`}
                  variant="secondary"
                  data-locate-issue={issueId}
                  onClick={() => onSelectStudent(issue.studentId)}
                >
                  定位到名单
                </CompactButton>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
