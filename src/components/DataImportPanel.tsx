import { Download, FileUp, Table2 } from "lucide-react";
import { useState } from "react";
import { confirmImportCandidates, type ImportReviewRow } from "../lib/data-workspace";
import { parseStudentText, type ImportCandidate, type UnparsedLine } from "../lib/import-data";
import { createImportTemplateSheets, parseExcelWorkbookRows, parseOcrLikeText } from "../lib/binary-import";
import { buildRosterExportSheets, createRosterExportFilename } from "../lib/roster-export";
import { requestAiParseData, type ParseDataResult } from "../lib/ai-client";
import type { Student } from "../lib/project-data";
import type { StudentIssue } from "../lib/student-data";
import { FileDropzone } from "./FileDropzone";
import {
  ExcelRecognitionPanel,
  ImportCandidateReview,
  ImportOutcomePanel,
  type ExcelRecognition,
  type ImportOutcome,
  type ImportSkip,
} from "./DataImportReview";
import { ActionButton, ActionGroup, CompactButton, PanelHeader } from "./StudioUi";

const UNCHECKED_REASON = "未勾选，未导入";

/**
 * 把 `confirmImportCandidates` 的拒收结果还原成逐行明细:未勾选的行与校验失败的行
 * 都要带上行号、原文和原因,导入回显才不会只剩一个数字。
 * issue.studentIndex 是勾选行的下标,所以只在勾选行上推进计数。
 */
function collectSkips(rows: ImportReviewRow[], issues: StudentIssue[]): ImportSkip[] {
  const errorsByAcceptedIndex = new Map<number, string[]>();
  for (const issue of issues) {
    if (issue.level !== "error" || issue.studentIndex === undefined) continue;
    const messages = errorsByAcceptedIndex.get(issue.studentIndex) ?? [];
    messages.push(issue.message);
    errorsByAcceptedIndex.set(issue.studentIndex, messages);
  }

  const skips: ImportSkip[] = [];
  let acceptedIndex = 0;
  for (const row of rows) {
    if (!row.accepted) {
      skips.push({ sourceLine: row.sourceLine, rawLine: row.rawLine, reason: UNCHECKED_REASON });
      continue;
    }
    const messages = errorsByAcceptedIndex.get(acceptedIndex);
    acceptedIndex += 1;
    if (messages?.length) {
      skips.push({ sourceLine: row.sourceLine, rawLine: row.rawLine, reason: messages.join("；") });
    }
  }
  return skips;
}

function collectWarnings(issues: StudentIssue[]): string[] {
  return issues.filter((issue) => issue.level === "warning").map((issue) => issue.message);
}

function mergeSkips(unparsed: UnparsedLine[], skips: ImportSkip[]): ImportSkip[] {
  return [...unparsed, ...skips].sort((left, right) => left.sourceLine - right.sourceLine);
}

function importOutcomeSummary(success: number, skipped: number): string {
  return `成功 ${success} · 跳过 ${skipped}`;
}

export function DataImportPanel({
  students,
  onAppendStudents,
  onReplaceStudents,
  onMessage,
  requestAiParse = requestAiParseData,
  confirmReplace,
  hideTemplateDownload = false,
  defaultExpanded = true,
}: {
  students: Student[];
  onAppendStudents: (students: Student[]) => void;
  onReplaceStudents: (students: Student[]) => void;
  onMessage: (message: string) => void;
  requestAiParse?: (input: { text: string; source: "paste" | "ocr" }) => Promise<ParseDataResult>;
  confirmReplace: (input: { currentCount: number; nextCount: number }) => boolean;
  hideTemplateDownload?: boolean;
  defaultExpanded?: boolean;
}) {
  const [showImport, setShowImport] = useState(defaultExpanded);
  const [importText, setImportText] = useState("");
  const [reviewRows, setReviewRows] = useState<ImportReviewRow[]>([]);
  const [unparsedRows, setUnparsedRows] = useState<UnparsedLine[]>([]);
  const [excelRecognition, setExcelRecognition] = useState<ExcelRecognition | null>(null);
  const [outcome, setOutcome] = useState<ImportOutcome | null>(null);
  const [isAiParsing, setIsAiParsing] = useState(false);
  const [replaceConfirmation, setReplaceConfirmation] = useState<{ currentCount: number; nextCount: number } | null>(null);

  const setCandidates = (
    candidates: ImportCandidate[],
    unparsed: UnparsedLine[],
    sourceLabel: string,
    recognition?: ExcelRecognition,
  ) => {
    setExcelRecognition(recognition?.headerRowIndex !== undefined ? recognition : null);
    setUnparsedRows(unparsed);
    setOutcome(null);
    if (candidates.length === 0) {
      onMessage(`没有从${sourceLabel}识别到可导入数据`);
      setReviewRows([]);
      return;
    }
    setReviewRows(candidates.map((candidate) => ({ ...candidate, accepted: true })));
    onMessage(
      `从${sourceLabel}识别到 ${candidates.length} 条候选${unparsed.length ? `，另有 ${unparsed.length} 行未识别` : ""}`,
    );
  };

  const prepareImport = () => {
    const parsed = parseStudentText(importText);
    setCandidates(parsed.candidates, parsed.unparsed, "文本");
  };

  const prepareOcrImport = () => {
    const parsed = parseOcrLikeText(importText);
    setCandidates(parsed.candidates, parsed.unparsed, "OCR 文本");
  };

  const prepareAiImport = async () => {
    if (!importText.trim()) {
      onMessage("请先粘贴需要智能识别的名单");
      return;
    }
    setIsAiParsing(true);
    try {
      const parsed = await requestAiParse({ text: importText, source: "paste" });
      setCandidates(parsed.candidates, parsed.unparsed, `智能识别（${parsed.provider}）`);
    } catch (error) {
      onMessage(error instanceof Error ? error.message : "智能识别失败");
    } finally {
      setIsAiParsing(false);
    }
  };

  const downloadImportTemplate = async () => {
    try {
      const XLSX = await import("xlsx");
      const template = createImportTemplateSheets();
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(template.data), "学生数据");
      XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(template.guide), "填写说明");
      XLSX.writeFile(workbook, "蹭饭图-学生数据导入模板.xlsx");
      onMessage("已下载学生数据导入模板");
    } catch (error) {
      onMessage(error instanceof Error ? error.message : "模板下载失败");
    }
  };

  const exportRoster = async () => {
    if (students.length === 0) {
      onMessage("当前名单为空，没有可导出的学生数据");
      return;
    }
    try {
      const XLSX = await import("xlsx");
      const sheets = buildRosterExportSheets(students);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(sheets.data), "学生数据");
      XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(sheets.guide), "填写说明");
      XLSX.writeFile(workbook, createRosterExportFilename());
      onMessage(`已导出 ${students.length} 条学生名单，可修改后再次导入`);
    } catch (error) {
      onMessage(error instanceof Error ? error.message : "名单导出失败");
    }
  };

  const handleExcelFile = async (file: File | null) => {
    if (!file) return;
    setExcelRecognition(null);
    try {
      const XLSX = await import("xlsx");
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: "array" });
      const firstSheetName = workbook.SheetNames[0];
      if (!firstSheetName) {
        onMessage("Excel 中没有工作表");
        return;
      }
      const sheet = workbook.Sheets[firstSheetName];
      const rows = XLSX.utils.sheet_to_json<(string | number)[]>(sheet, {
        header: 1,
        defval: "",
      });
      const matrix = rows.map((row) =>
        (Array.isArray(row) ? row : []).map((cell) => String(cell ?? "").trim()),
      );
      const parsed = parseExcelWorkbookRows(matrix);
      setCandidates(parsed.candidates, parsed.unparsed, `Excel（${file.name}）`, parsed);
    } catch (error) {
      onMessage(error instanceof Error ? error.message : "Excel 解析失败");
    }
  };

  const applyImport = (mode: "append" | "replace") => {
    const result = confirmImportCandidates(reviewRows);
    const next = result.students;
    const skipped = mergeSkips(unparsedRows, collectSkips(reviewRows, result.issues));
    const warnings = collectWarnings(result.issues);
    if (next.length === 0) {
      setOutcome({ title: "导入未执行", success: 0, skipped, warnings });
      onMessage(`没有可导入的有效记录，${result.issues.length} 条校验问题 · ${importOutcomeSummary(0, skipped.length)}`);
      return;
    }
    if (mode === "replace") {
      const confirmation = { currentCount: students.length, nextCount: next.length };
      setReplaceConfirmation(confirmation);
      if (!confirmReplace(confirmation)) return;
      onReplaceStudents(next);
    } else onAppendStudents(next);
    setReviewRows([]);
    setExcelRecognition(null);
    setUnparsedRows([]);
    setImportText("");
    setOutcome({ title: mode === "replace" ? "替换导入结果" : "追加导入结果", success: next.length, skipped, warnings });
    onMessage(`已${mode === "replace" ? "替换" : "追加"} ${next.length} 条学生数据 · ${importOutcomeSummary(next.length, skipped.length)}`);
  };

  const importDirectly = async () => {
    if (!importText.trim()) {
      onMessage("请先粘贴名单");
      return;
    }
    setExcelRecognition(null);
    // 本地能整段解析时不必调用智能识别，省一次上游请求。
    const local = parseStudentText(importText);
    let parsed: { candidates: ImportCandidate[]; unparsed: UnparsedLine[] } = local;
    let sourceLabel = "本地文本识别";
    if (local.unparsed.length > 0) {
      setIsAiParsing(true);
      try {
        const aiParsed = await requestAiParse({ text: importText, source: "paste" });
        parsed = { candidates: aiParsed.candidates, unparsed: aiParsed.unparsed };
        sourceLabel = `智能识别（${aiParsed.provider}）`;
      } catch {
        parsed = local;
      } finally {
        setIsAiParsing(false);
      }
    }
    if (parsed.candidates.length === 0) {
      setOutcome({ title: "导入未执行", success: 0, skipped: mergeSkips(parsed.unparsed, []), warnings: [] });
      onMessage(`没有从${sourceLabel}识别到可导入的学生记录 · ${importOutcomeSummary(0, parsed.unparsed.length)}`);
      return;
    }
    const rows: ImportReviewRow[] = parsed.candidates.map((candidate) => ({ ...candidate, accepted: true }));
    const result = confirmImportCandidates(rows);
    const skipped = mergeSkips(parsed.unparsed, collectSkips(rows, result.issues));
    const warnings = collectWarnings(result.issues);
    if (result.students.length === 0) {
      setOutcome({ title: "导入未执行", success: 0, skipped, warnings });
      onMessage(`识别结果无法转换为有效记录 · ${importOutcomeSummary(0, skipped.length)}`);
      return;
    }
    onAppendStudents(result.students);
    setReviewRows([]);
    setUnparsedRows([]);
    setImportText("");
    setOutcome({ title: "一键导入结果", success: result.students.length, skipped, warnings });
    onMessage(
      `已从${sourceLabel}导入 ${result.students.length} 条学生记录 · ${importOutcomeSummary(result.students.length, skipped.length)}`,
    );
  };

  const toggleReviewRow = (index: number, accepted: boolean) => {
    setReviewRows((current) => current.map((row, rowIndex) => (rowIndex === index ? { ...row, accepted } : row)));
  };

  return (
    <>
      <div className="import-box">
        <button
          type="button"
          className="wide-button secondary import-toggle"
          aria-label={showImport ? "收起导入名单" : "展开导入名单"}
          aria-expanded={showImport}
          onClick={() => setShowImport((current) => !current)}
        >
          {showImport ? "收起导入" : "展开导入 / OCR / Excel"}
        </button>
        {showImport && (
          <>
            <PanelHeader title="导入文本" meta="可粘贴 OCR 识别文字；学生姓名 · 就读院校 · 城市 · 去向类型（可选：海外）" />
            <textarea
              value={importText}
              onChange={(event) => setImportText(event.target.value)}
              placeholder={"林舟 北京大学 北京\n周晴，哈佛大学，美国·波士顿，海外"}
              rows={5}
            />
            <ActionGroup label="导入处理" className="review-actions">
              <CompactButton icon={<FileUp size={14} aria-hidden />} onClick={prepareImport}>识别文本</CompactButton>
              <CompactButton variant="secondary" aria-label="智能识别名单" onClick={prepareAiImport} disabled={isAiParsing}>
                {isAiParsing ? "智能识别中..." : "智能识别名单"}
              </CompactButton>
              <CompactButton variant="secondary" onClick={prepareOcrImport}>识别 OCR 文本</CompactButton>
              <ActionButton onClick={importDirectly} disabled={isAiParsing}>
                {isAiParsing ? "识别并导入中..." : "一键识别并导入"}
              </ActionButton>
            </ActionGroup>
            <div className="file-import-row">
              <FileDropzone
                id="data-excel-upload"
                label="导入 Excel"
                hint="XLSX / CSV · 点击或拖拽"
                accept=".xlsx,.xls,.csv"
                variant="secondary"
                icon={<FileUp size={16} aria-hidden />}
                onFile={(file) => { void handleExcelFile(file); }}
              />
              {!hideTemplateDownload && <CompactButton
                variant="secondary"
                aria-label="下载学生数据 XLSX 模板"
                icon={<Download size={16} aria-hidden />}
                onClick={() => { void downloadImportTemplate(); }}
              >
                下载 XLSX 模板
              </CompactButton>}
              <CompactButton
                variant="secondary"
                aria-label="导出学生名单 XLSX"
                title="导出与导入模板同表头的 xlsx，改完可直接再导入"
                icon={<Table2 size={16} aria-hidden />}
                onClick={() => { void exportRoster(); }}
              >
                导出名单 XLSX
              </CompactButton>
            </div>
          </>
        )}
      </div>

      {excelRecognition && <ExcelRecognitionPanel recognition={excelRecognition} />}

      <ImportCandidateReview
        rows={reviewRows}
        unparsedCount={unparsedRows.length}
        onToggleRow={toggleReviewRow}
        onApply={applyImport}
      />

      {outcome && <ImportOutcomePanel outcome={outcome} summary={importOutcomeSummary(outcome.success, outcome.skipped.length)} />}

      {replaceConfirmation && <p className="panel-note data-message">替换摘要：当前 {replaceConfirmation.currentCount} 条，新 {replaceConfirmation.nextCount} 条</p>}
    </>
  );
}
