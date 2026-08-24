import { Download, FileUp, Table2 } from "lucide-react";
import { useState } from "react";
import { confirmImportCandidates, type ImportReviewRow } from "../lib/data-workspace";
import { parseStudentText, type ImportCandidate, type UnparsedLine } from "../lib/import-data";
import { createImportTemplateSheets, parseExcelWorkbook, parseOcrLikeText } from "../lib/binary-import";
import { buildRosterExportSheets, createRosterExportFilename } from "../lib/roster-export";
import { requestAiParseData, type ParseDataResult } from "../lib/ai-client";
import { SPREADSHEET_IMPORT_LIMIT, checkImportFileSize } from "../lib/import-file-limits";
import { decodeCsvBytes, isCsvFile } from "../lib/csv-decode";
import type { Student } from "../lib/project-data";
import type { StudentIssue } from "../lib/student-data";
import { ConfirmDialog } from "./workbench/ConfirmDialog";
import { FileDropzone } from "./FileDropzone";
import {
  ExcelRecognitionPanel,
  ImportCandidateReview,
  ImportOutcomePanel,
  type ExcelRecognition,
  type ImportOutcome,
  type ImportSkip,
} from "./DataImportReview";
import { AiUploadConsentDialog, AiUploadConsentMemo, useAiUploadConsent } from "./DataImportConsent";
import { ActionButton, ActionGroup, CompactButton, PanelHeader } from "./StudioUi";

const UNCHECKED_REASON = "未勾选，未导入";

/** 拒绝上送后用它替换来源说明，让回显里看得出原文没有离开本机。 */
const LOCAL_ONLY_NOTE = "（原文未发送）";

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

/** 表名太多时只点名前几张，剩下的用「等」收尾，避免状态栏被一长串表名撑爆。 */
const SKIPPED_SHEET_PREVIEW = 3;

/**
 * 没被读取的工作表提示：与「另有 N 行未识别」同一口径，
 * 让「名单在第二张、封面在第一张」这类工作簿里没读的表在提示里看得见。
 */
function describeSkippedSheets(names: readonly string[]): string {
  if (names.length === 0) return "";
  const preview = names.slice(0, SKIPPED_SHEET_PREVIEW).join("、");
  return `，另有 ${names.length} 张工作表未读取（${preview}${names.length > SKIPPED_SHEET_PREVIEW ? " 等" : ""}）`;
}

/** 等待用户在替换确认框里表态的一批导入结果，确认前不碰名单。 */
type PendingReplace = {
  students: Student[];
  skipped: ImportSkip[];
  warnings: string[];
  currentCount: number;
};

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
  /** 省略即由面板自己弹确认框；测试与嵌入方可以注入同步判定来跳过对话框。 */
  confirmReplace?: (input: { currentCount: number; nextCount: number }) => boolean;
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
  const [pendingReplace, setPendingReplace] = useState<PendingReplace | null>(null);
  const consent = useAiUploadConsent(onMessage);
  const aiBusy = isAiParsing || consent.isAsking;

  const setCandidates = (
    candidates: ImportCandidate[],
    unparsed: UnparsedLine[],
    sourceLabel: string,
    recognition?: ExcelRecognition,
    /** 追加在成功/跳过口径之后的补充说明，目前用于点名没被读取的工作表。 */
    note = "",
  ) => {
    setExcelRecognition(recognition?.headerRowIndex !== undefined ? recognition : null);
    setUnparsedRows(unparsed);
    setOutcome(null);
    // 换了一批候选，上一次的替换摘要就过期了，避免旧数字残留误导用户。
    setReplaceConfirmation(null);
    if (candidates.length === 0) {
      onMessage(`没有从${sourceLabel}识别到可导入数据${note}`);
      setReviewRows([]);
      return;
    }
    setReviewRows(candidates.map((candidate) => ({ ...candidate, accepted: true })));
    onMessage(
      `从${sourceLabel}识别到 ${candidates.length} 条候选${unparsed.length ? `，另有 ${unparsed.length} 行未识别` : ""}${note}`,
    );
  };

  const prepareImport = () => {
    const parsed = parseStudentText(importText);
    setCandidates(parsed.candidates, parsed.unparsed, "文本");
  };

  const prepareOcrImport = async () => {
    const local = parseOcrLikeText(importText);
    // 和「一键识别并导入」同一条升级路径：本地 OCR 规则能读全就不请求上游，
    // 读不全时才交给智能识别，并按 ocr 来源告知服务端(截图排版和粘贴文本的噪声不同)。
    if (!importText.trim() || local.unparsed.length === 0) {
      setCandidates(local.candidates, local.unparsed, "OCR 文本");
      return;
    }
    if (!(await consent.requestConsent("ocr"))) {
      setCandidates(local.candidates, local.unparsed, `OCR 文本${LOCAL_ONLY_NOTE}`);
      return;
    }
    setIsAiParsing(true);
    try {
      const aiParsed = await requestAiParse({ text: importText, source: "ocr" });
      setCandidates(aiParsed.candidates, aiParsed.unparsed, `OCR 智能识别（${aiParsed.provider}）`);
    } catch {
      // 没有可用 AI 或上游失败时退回纯本地结果，行为与升级前一致。
      setCandidates(local.candidates, local.unparsed, "OCR 文本");
    } finally {
      setIsAiParsing(false);
    }
  };

  const prepareAiImport = async () => {
    if (!importText.trim()) {
      onMessage("请先粘贴需要智能识别的名单");
      return;
    }
    if (!(await consent.requestConsent("paste"))) {
      // 拒绝上送时退回本地规则，未识别的行照实留在回显里。
      const local = parseStudentText(importText);
      setCandidates(local.candidates, local.unparsed, `本地文本识别${LOCAL_ONLY_NOTE}`);
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
    // 体积在读入前就判掉：`XLSX.read` 是同步的，超大文件会把标签页卡到无法操作。
    const oversized = checkImportFileSize(file, SPREADSHEET_IMPORT_LIMIT);
    if (oversized) {
      onMessage(oversized);
      return;
    }
    setExcelRecognition(null);
    const isCsv = isCsvFile(file);
    try {
      const XLSX = await import("xlsx");
      const buffer = await file.arrayBuffer();
      // CSV 是纯文本，编码得自己定：直接把字节丢给 xlsx，GBK 表头会读成乱码，
      // 而乱码列看上去仍是「合法但认不出的表头」，名单会带着乱码进候选。
      const decoded = isCsv ? decodeCsvBytes(buffer) : null;
      const workbook = decoded ? XLSX.read(decoded.text, { type: "string" }) : XLSX.read(buffer, { type: "array" });
      // 整本工作簿都读进来交给选表逻辑：教务导出常把封面/汇总排在第一张，只读第一张会丢掉真名单。
      const sheets = workbook.SheetNames.flatMap((name) => {
        const sheet = workbook.Sheets[name];
        if (!sheet) return [];
        const rows = XLSX.utils.sheet_to_json<(string | number)[]>(sheet, {
          header: 1,
          defval: "",
        });
        return [{
          name,
          rows: rows.map((row) => (Array.isArray(row) ? row : []).map((cell) => String(cell ?? "").trim())),
        }];
      });
      const parsed = parseExcelWorkbook(sheets);
      if (!parsed) {
        onMessage(isCsv ? "CSV 中没有数据" : "Excel 中没有工作表");
        return;
      }
      // 点名 GB18030：真遇到编码猜错时，用户能从提示里看出该换个编码另存。
      const encodingNote = decoded?.encoding === "gb18030" ? " · 按 GB18030 解码" : "";
      setCandidates(
        parsed.candidates,
        parsed.unparsed,
        isCsv ? `CSV（${file.name}${encodingNote}）` : `Excel（${file.name} · 工作表「${parsed.sheetName}」）`,
        parsed,
        describeSkippedSheets(parsed.skippedSheetNames),
      );
    } catch (error) {
      onMessage(error instanceof Error ? error.message : `${isCsv ? "CSV" : "Excel"} 解析失败`);
    }
  };

  const landImport = (mode: "append" | "replace", next: Student[], skipped: ImportSkip[], warnings: string[]) => {
    if (mode === "replace") onReplaceStudents(next);
    else onAppendStudents(next);
    setReviewRows([]);
    setExcelRecognition(null);
    setUnparsedRows([]);
    setImportText("");
    // 导入已经落地，替换摘要只服务于"确认前"的提示，落地后清掉。
    setReplaceConfirmation(null);
    setPendingReplace(null);
    setOutcome({ title: mode === "replace" ? "替换导入结果" : "追加导入结果", success: next.length, skipped, warnings });
    onMessage(`已${mode === "replace" ? "替换" : "追加"} ${next.length} 条学生数据 · ${importOutcomeSummary(next.length, skipped.length)}`);
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
      if (confirmReplace) {
        if (!confirmReplace(confirmation)) return;
      } else {
        setPendingReplace({ students: next, skipped, warnings, currentCount: students.length });
        return;
      }
    }
    landImport(mode, next, skipped, warnings);
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
      if (await consent.requestConsent("paste")) {
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
      } else sourceLabel = `本地文本识别${LOCAL_ONLY_NOTE}`;
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
    setReplaceConfirmation(null);
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
        {/* 模板下载留在折叠外：折叠态下用户也要能拿到导入模板，不必先展开导入区。 */}
        <div className="import-box__entry">
          <button
            type="button"
            className="wide-button secondary import-toggle"
            aria-label={showImport ? "收起导入名单" : "展开导入名单"}
            aria-expanded={showImport}
            onClick={() => setShowImport((current) => !current)}
          >
            {showImport ? "收起导入" : "展开导入 / OCR / Excel"}
          </button>
          {!hideTemplateDownload && (
            <CompactButton
              variant="secondary"
              aria-label="下载学生数据 XLSX 模板"
              icon={<Download size={16} aria-hidden />}
              onClick={() => { void downloadImportTemplate(); }}
            >
              下载 XLSX 模板
            </CompactButton>
          )}
        </div>
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
              <CompactButton variant="secondary" aria-label="智能识别名单" onClick={prepareAiImport} disabled={aiBusy}>
                {isAiParsing ? "智能识别中..." : "智能识别名单"}
              </CompactButton>
              <CompactButton variant="secondary" onClick={prepareOcrImport} disabled={aiBusy}>
                {isAiParsing ? "OCR 识别中..." : "识别 OCR 文本"}
              </CompactButton>
              <ActionButton onClick={importDirectly} disabled={aiBusy}>
                {isAiParsing ? "识别并导入中..." : "一键识别并导入"}
              </ActionButton>
            </ActionGroup>
            <AiUploadConsentMemo gate={consent} />
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

      <AiUploadConsentDialog gate={consent} />

      {excelRecognition && <ExcelRecognitionPanel recognition={excelRecognition} />}

      <ImportCandidateReview
        rows={reviewRows}
        unparsedCount={unparsedRows.length}
        onToggleRow={toggleReviewRow}
        onApply={applyImport}
      />

      {outcome && <ImportOutcomePanel outcome={outcome} summary={importOutcomeSummary(outcome.success, outcome.skipped.length)} />}

      {replaceConfirmation && <p className="panel-note data-message">替换摘要：当前 {replaceConfirmation.currentCount} 条，新 {replaceConfirmation.nextCount} 条</p>}

      {pendingReplace && (
        <ConfirmDialog
          title="替换全部学生名单？"
          description={`当前 ${pendingReplace.currentCount} 条名单会被 ${pendingReplace.students.length} 条新记录整体覆盖，替换后无法用撤销找回被删掉的行。`}
          confirmLabel="替换全部"
          tone="danger"
          onConfirm={() => landImport("replace", pendingReplace.students, pendingReplace.skipped, pendingReplace.warnings)}
          onCancel={() => {
            setPendingReplace(null);
            onMessage("已取消替换，名单未改动");
          }}
        />
      )}
    </>
  );
}
