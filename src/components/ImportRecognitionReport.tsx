import { Download } from "lucide-react";
import type { ExcelImportResult } from "../lib/binary-import";
import type { UnparsedLine } from "../lib/import-data";
import { describeHeaderAliases, describeStudentColumns, STUDENT_COLUMN_LABELS } from "../lib/student-columns";
import { CompactButton, PanelHeader } from "./StudioUi";

/** 识别回执只关心表头元数据，候选行由确认列表另行渲染。 */
export type ExcelRecognition = Pick<
  ExcelImportResult,
  "headerRowIndex" | "columnMappings" | "unmappedHeaders" | "missingRequiredFields"
>;

/** 未导入行最多列几条：一份 60 行的名单全废时不该把整个面板刷满。 */
const UNPARSED_PREVIEW_LIMIT = 20;

/**
 * 导入之后的两块只读回执：认出来的表头映射，和被跳过的行。
 * 缺必填列时不再只报术语——点名缺哪一列、回显认得的中文别名、把模板递到手边。
 */
export function ImportRecognitionReport({
  recognition,
  unparsedRows,
  hideTemplateDownload = false,
  onDownloadTemplate,
}: {
  recognition: ExcelRecognition | null;
  unparsedRows: readonly UnparsedLine[];
  hideTemplateDownload?: boolean;
  onDownloadTemplate: () => void;
}) {
  return (
    <>
      {recognition?.headerRowIndex !== undefined && (
        <section className="import-recognition" aria-label="Excel 表头识别结果">
          <PanelHeader title="表头识别" meta={`第 ${recognition.headerRowIndex + 1} 行`} />
          <div className="import-recognition__grid">
            {recognition.columnMappings.map((mapping) => (
              <div key={mapping.field} className="import-recognition__row">
                <span>{mapping.sourceHeader}</span>
                <strong>{STUDENT_COLUMN_LABELS[mapping.field]}</strong>
                <small>{mapping.samples.length > 0 ? mapping.samples.join("、") : "暂无代表数据"}</small>
              </div>
            ))}
          </div>
          {recognition.unmappedHeaders.length > 0 && (
            <p className="import-recognition__note">这些列没用上：{recognition.unmappedHeaders.join("、")}</p>
          )}
          {recognition.missingRequiredFields.length > 0 && (
            <div className="import-recognition__warning">
              <p className="import-recognition__warning-title">
                这张表里没有「{describeStudentColumns(recognition.missingRequiredFields)}」这一列，所以一个人都没导进来。
              </p>
              <ul className="import-recognition__warning-fixes">
                {recognition.missingRequiredFields.map((field) => (
                  <li key={field}>
                    把某一列的表头改成「{STUDENT_COLUMN_LABELS[field]}」就行；写成 {describeHeaderAliases(field)} 也认得。
                  </li>
                ))}
              </ul>
              {!hideTemplateDownload && (
                <CompactButton
                  variant="secondary"
                  aria-label="下载 XLSX 模板重新整理表格"
                  icon={<Download size={14} aria-hidden />}
                  onClick={onDownloadTemplate}
                >
                  下载模板重新整理
                </CompactButton>
              )}
            </div>
          )}
        </section>
      )}

      {unparsedRows.length > 0 && (
        <section className="import-unparsed" aria-label="未导入的行">
          <PanelHeader title="未导入的行" meta={`${unparsedRows.length} 行被跳过`} />
          <ul className="import-unparsed__list">
            {unparsedRows.slice(0, UNPARSED_PREVIEW_LIMIT).map((row, index) => (
              <li key={`${row.sourceLine}-${index}`} className="import-unparsed__row">
                <strong>第 {row.sourceLine} 行</strong>
                <span>{row.reason}</span>
                <small>{row.rawLine || "（空行）"}</small>
              </li>
            ))}
          </ul>
          {unparsedRows.length > UNPARSED_PREVIEW_LIMIT && (
            <p className="import-recognition__note">仅显示前 {UNPARSED_PREVIEW_LIMIT} 行，共 {unparsedRows.length} 行未导入</p>
          )}
        </section>
      )}
    </>
  );
}
