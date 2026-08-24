import { Download, FileUp } from "lucide-react";
import type { ImportReviewRow } from "../lib/data-workspace";
import type { ExcelImportResult } from "../lib/binary-import";
import type { UnparsedLine } from "../lib/import-data";
import { FileDropzone } from "./FileDropzone";
import { ActionButton, ActionGroup, CompactButton, PanelHeader } from "./StudioUi";
import { ROSTER_FILE_ACCEPT, studentColumnLabels } from "./data-workspace-fields";

export type ExcelRecognition = Pick<
  ExcelImportResult,
  "headerRowIndex" | "columnMappings" | "unmappedHeaders" | "missingRequiredFields"
>;

export interface CandidateSummary {
  valid: number;
  missing: number;
  duplicate: number;
}

const UNPARSED_PREVIEW_LIMIT = 3;

/**
 * Roster ingest panel: pasted text, the local/AI/OCR-text parsers, workbook
 * upload, header recognition and the candidate review list.
 *
 * The OCR entry point deliberately only parses text that the user already
 * extracted elsewhere — this app never reads images, and the copy says so.
 */
export function DataWorkspaceImportPanel({
  importText,
  onChangeImportText,
  expanded,
  onToggleExpanded,
  isAiParsing,
  onParseText,
  onParseOcrText,
  onParseWithAi,
  onPasteHtmlTable,
  onImportDirectly,
  onSelectWorkbook,
  onDownloadTemplate,
  hideTemplateDownload,
  excelRecognition,
  reviewRows,
  onToggleReviewRow,
  candidateSummary,
  unparsedCount,
  unparsedRows,
  onApplyImport,
}: {
  importText: string;
  onChangeImportText: (value: string) => void;
  expanded: boolean;
  onToggleExpanded: () => void;
  isAiParsing: boolean;
  onParseText: () => void;
  onParseOcrText: () => void;
  onParseWithAi: () => void;
  /** Reads a `<table>` off the clipboard; returns whether it took the paste over. */
  onPasteHtmlTable: (html: string) => boolean;
  onImportDirectly: () => void;
  onSelectWorkbook: (file: File) => void;
  onDownloadTemplate: () => void;
  hideTemplateDownload: boolean;
  excelRecognition: ExcelRecognition | null;
  reviewRows: ImportReviewRow[];
  onToggleReviewRow: (index: number, accepted: boolean) => void;
  candidateSummary: CandidateSummary;
  unparsedCount: number;
  unparsedRows: UnparsedLine[];
  onApplyImport: (mode: "append" | "replace") => void;
}) {
  const previewedUnparsed = unparsedRows.slice(0, UNPARSED_PREVIEW_LIMIT);
  return (
    <>
      <div className="import-box">
        <button
          type="button"
          className="wide-button secondary import-toggle"
          aria-label={expanded ? "收起导入名单" : "展开导入名单"}
          aria-expanded={expanded}
          onClick={onToggleExpanded}
        >
          {expanded ? "收起导入" : "展开导入 · 文本 / Excel"}
        </button>
        {expanded && (
          <>
            <PanelHeader
              title="导入名单文本"
              meta="每行一位：学生姓名 · 就读院校 · 城市 · 去向类型（可选：海外）"
            />
            <p className="panel-note" data-import-ocr-note>
              可粘贴 OCR 软件识别出的文字。本工具只解析文本，不读取图片；名单在图片里请先用 OCR 工具转成文字再粘贴。
            </p>
            <p className="panel-note" data-import-html-note>
              从网页或在线表格里直接复制整张表格粘贴进来，会按表格的行列识别，合并单元格也会自动补齐。
            </p>
            <textarea
              value={importText}
              onChange={(event) => onChangeImportText(event.target.value)}
              onPaste={(event) => {
                const html = event.clipboardData?.getData("text/html") ?? "";
                if (html && onPasteHtmlTable(html)) event.preventDefault();
              }}
              placeholder={"林舟 北京大学 北京\n周晴，哈佛大学，美国·波士顿，海外"}
              rows={5}
            />
            <ActionGroup label="导入处理" className="review-actions">
              <CompactButton icon={<FileUp size={14} aria-hidden />} onClick={onParseText}>识别文本</CompactButton>
              <CompactButton variant="secondary" aria-label="智能识别名单" onClick={onParseWithAi} disabled={isAiParsing}>
                {isAiParsing ? "智能识别中..." : "智能识别名单"}
              </CompactButton>
              <CompactButton
                variant="secondary"
                aria-label="识别粘贴的 OCR 文本"
                title="解析已粘贴的 OCR 文字，不支持直接上传图片"
                onClick={onParseOcrText}
              >
                识别 OCR 文本
              </CompactButton>
              <ActionButton onClick={onImportDirectly} disabled={isAiParsing}>
                {isAiParsing ? "识别并导入中..." : "一键识别并导入"}
              </ActionButton>
            </ActionGroup>
            <div className="file-import-row">
              <FileDropzone
                id="data-excel-upload"
                label="导入 Excel"
                hint="XLSX / CSV · 点击或拖拽"
                accept={ROSTER_FILE_ACCEPT}
                variant="secondary"
                icon={<FileUp size={16} aria-hidden />}
                onFile={onSelectWorkbook}
              />
              {!hideTemplateDownload && (
                <CompactButton
                  variant="secondary"
                  aria-label="下载学生数据 XLSX 模板"
                  icon={<Download size={16} aria-hidden />}
                  onClick={onDownloadTemplate}
                >
                  下载 XLSX 模板
                </CompactButton>
              )}
            </div>
          </>
        )}
      </div>

      {excelRecognition?.headerRowIndex !== undefined && (
        <section className="import-recognition" aria-label="Excel 表头识别结果">
          <PanelHeader title="表头识别" meta={`第 ${excelRecognition.headerRowIndex + 1} 行`} />
          <div className="import-recognition__grid">
            {excelRecognition.columnMappings.map((mapping) => (
              <div key={mapping.field} className="import-recognition__row">
                <span>{mapping.sourceHeader}</span>
                <strong>{studentColumnLabels[mapping.field]}</strong>
                <small>{mapping.samples.length > 0 ? mapping.samples.join("、") : "暂无代表数据"}</small>
              </div>
            ))}
          </div>
          {excelRecognition.unmappedHeaders.length > 0 && (
            <p className="import-recognition__note">未使用：{excelRecognition.unmappedHeaders.join("、")}</p>
          )}
          {excelRecognition.missingRequiredFields.length > 0 && (
            <p className="import-recognition__warning">
              缺少必填列：{excelRecognition.missingRequiredFields.map((field) => studentColumnLabels[field]).join("、")}
            </p>
          )}
        </section>
      )}

      {unparsedRows.length > 0 && (
        <p className="panel-note" data-import-unparsed>
          未识别 {unparsedRows.length} 行（不会被导入）：
          {previewedUnparsed.map((row) => `第 ${row.sourceLine} 行 ${row.reason}`).join("；")}
          {unparsedRows.length > previewedUnparsed.length ? " 等" : ""}
        </p>
      )}

      {reviewRows.length > 0 && (
        <div className="import-review">
          <PanelHeader
            title="确认候选"
            meta={`有效 ${candidateSummary.valid} · 未识别 ${unparsedCount} · 缺失字段 ${candidateSummary.missing} · 重复 ${candidateSummary.duplicate}`}
          />
          <div className="review-list">
            {reviewRows.map((row, index) => (
              <label key={`${row.sourceLine}-${index}`} className="review-row">
                <input
                  type="checkbox"
                  checked={row.accepted}
                  onChange={(event) => onToggleReviewRow(index, event.target.checked)}
                />
                <span>
                  <strong>{row.name}</strong>
                  <small>
                    {row.university} · {row.city}
                    {row.locationScope === "international" ? " · 海外" : ""}
                  </small>
                </span>
              </label>
            ))}
          </div>
          <ActionGroup label="确认导入" className="review-actions">
            <ActionButton onClick={() => onApplyImport("append")}>
              追加导入
            </ActionButton>
            <CompactButton variant="secondary" onClick={() => onApplyImport("replace")}>
              替换全部
            </CompactButton>
          </ActionGroup>
        </div>
      )}
    </>
  );
}
