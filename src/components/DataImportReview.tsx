import { useMemo } from "react";
import type { ImportReviewRow } from "../lib/data-workspace";
import { findDuplicateStudentGroups } from "../lib/data-duplicate";
import type { ExcelImportResult } from "../lib/binary-import";
// 标签表要覆盖包括省份在内的全部列,识别面板才能为每条映射显示中文名。
import type { StudentColumn } from "../lib/import-aliases";
import { ActionButton, ActionGroup, CompactButton, PanelHeader } from "./StudioUi";

export type ExcelRecognition = Pick<
  ExcelImportResult,
  "headerRowIndex" | "columnMappings" | "unmappedHeaders" | "missingRequiredFields"
>;

/** 一条被跳过的源行:行号 + 原文 + 原因,三者缺一用户就无法回到表格里修。 */
export interface ImportSkip {
  sourceLine: number;
  rawLine: string;
  reason: string;
}

export interface ImportOutcome {
  title: string;
  success: number;
  skipped: ImportSkip[];
  warnings: string[];
}

const studentColumnLabels: Record<StudentColumn, string> = {
  name: "学生姓名",
  university: "录取院校",
  city: "城市",
  locationScope: "去向类型",
  province: "省份",
};

export function ExcelRecognitionPanel({ recognition }: { recognition: ExcelRecognition }) {
  if (recognition.headerRowIndex === undefined) return null;
  return (
    <section className="import-recognition" aria-label="Excel 表头识别结果">
      <PanelHeader title="表头识别" meta={`第 ${recognition.headerRowIndex + 1} 行`} />
      <div className="import-recognition__grid">
        {recognition.columnMappings.map((mapping) => (
          <div key={mapping.field} className="import-recognition__row">
            <span>{mapping.sourceHeader}</span>
            <strong>{studentColumnLabels[mapping.field]}</strong>
            <small>{mapping.samples.length > 0 ? mapping.samples.join("、") : "暂无代表数据"}</small>
          </div>
        ))}
      </div>
      {recognition.unmappedHeaders.length > 0 && (
        <p className="import-recognition__note">未使用：{recognition.unmappedHeaders.join("、")}</p>
      )}
      {recognition.missingRequiredFields.length > 0 && (
        <p className="import-recognition__warning">缺少必填列：{recognition.missingRequiredFields.map((field) => studentColumnLabels[field]).join("、")}</p>
      )}
    </section>
  );
}

/** 去向类型中文名:与导出模板的「中国去向 / 海外去向」一致,同一份数据不该两处叫法不同。 */
const locationScopeLabels: Record<NonNullable<ImportReviewRow["locationScope"]>, string> = {
  china: "中国去向",
  international: "海外去向",
};

/**
 * 候选行的省份与去向类型说明:只回显解析结果,没解析到就返回空串,不补默认词。
 * 目的是让省份错列在导入前就看得见,而不是导入后才在名单里发现。
 */
function describeCandidateScope(row: ImportReviewRow): string {
  const parts: string[] = [];
  const province = row.province?.trim();
  if (province) parts.push(`省份 ${province}`);
  if (row.locationScope) parts.push(locationScopeLabels[row.locationScope]);
  return parts.join(" · ");
}

export function ImportCandidateReview({
  rows,
  unparsedCount,
  onToggleRow,
  onApply,
}: {
  rows: ImportReviewRow[];
  unparsedCount: number;
  onToggleRow: (index: number, accepted: boolean) => void;
  onApply: (mode: "append" | "replace") => void;
}) {
  const summary = useMemo(() => {
    const duplicateIds = new Set(
      findDuplicateStudentGroups(
        rows.map((row, index) => ({
          id: `${row.sourceLine}-${index}`,
          name: row.name,
          university: row.university,
          city: row.city,
          locationScope: row.locationScope,
        })),
      ).flatMap((group) => group.studentIds),
    );
    const valid = rows.filter((row) => row.name.trim() && row.university.trim() && row.city.trim());
    return {
      valid: valid.length,
      missing: rows.length - valid.length,
      duplicate: rows.filter((row, index) => duplicateIds.has(`${row.sourceLine}-${index}`)).length,
    };
  }, [rows]);

  if (rows.length === 0) return null;

  return (
    <div className="import-review">
      <PanelHeader title="确认候选" meta={`有效 ${summary.valid} · 未识别 ${unparsedCount} · 缺失字段 ${summary.missing} · 重复 ${summary.duplicate}`} />
      <div className="review-list">
        {rows.map((row, index) => {
          const scope = describeCandidateScope(row);
          return (
            <label key={`${row.sourceLine}-${index}`} className="review-row">
              <input
                type="checkbox"
                checked={row.accepted}
                onChange={(event) => onToggleRow(index, event.target.checked)}
              />
              <span>
                <strong>{row.name}</strong>
                <small>
                  {row.university} · {row.city}
                </small>
                {/* 省份/去向类型单独一行,缺省时整行不渲染,避免留下空占位。 */}
                {scope && <small className="review-row__scope">{scope}</small>}
              </span>
            </label>
          );
        })}
      </div>
      <ActionGroup label="确认导入" className="review-actions">
        <ActionButton onClick={() => onApply("append")}>
          追加导入
        </ActionButton>
        <CompactButton variant="secondary" onClick={() => onApply("replace")}>
          替换全部
        </CompactButton>
      </ActionGroup>
    </div>
  );
}

export function ImportOutcomePanel({ outcome, summary }: { outcome: ImportOutcome; summary: string }) {
  return (
    <section className="import-review import-outcome" aria-label="导入结果">
      <PanelHeader title={outcome.title} meta={summary} />
      {outcome.skipped.length > 0 ? (
        <div className="review-list import-outcome__list">
          {outcome.skipped.map((skip, index) => (
            <div key={`${skip.sourceLine}-${index}`} className="import-outcome__row">
              <strong>第 {skip.sourceLine} 行</strong>
              <span>{skip.rawLine || "（空行）"}</span>
              <small>{skip.reason}</small>
            </div>
          ))}
        </div>
      ) : (
        <p className="panel-note import-outcome__empty">没有被跳过的行</p>
      )}
      {outcome.warnings.length > 0 && (
        <p className="panel-note import-outcome__warnings">提醒：{outcome.warnings.join("；")}</p>
      )}
    </section>
  );
}
