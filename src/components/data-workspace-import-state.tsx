import { useMemo, useState } from "react";
import { confirmImportCandidates, type ImportReviewRow } from "../lib/data-workspace";
import { findDuplicateStudentGroups } from "../lib/data-duplicate";
import {
  createImportTemplateSheets,
  parseExcelWorkbookRows,
  parseHtmlTableRows,
  parseOcrLikeText,
  rowsToTabText,
} from "../lib/binary-import";
import { parseStudentText, type ImportCandidate, type UnparsedLine } from "../lib/import-data";
import type { ParseDataResult } from "../lib/ai-client";
import type { Student } from "../lib/project-data";
import type { CandidateSummary, ExcelRecognition } from "./data-workspace-import-panel";

export interface RosterImportOptions {
  students: Student[];
  onAppendStudents: (students: Student[]) => void;
  onReplaceStudents: (students: Student[]) => void;
  requestAiParse: (input: { text: string; source: "paste" | "ocr" }) => Promise<ParseDataResult>;
  confirmReplace: (input: { currentCount: number; nextCount: number }) => boolean;
  onMessage: (message: string) => void;
}

/**
 * Roster ingest state machine shared by every import entry point (local text,
 * AI, pasted OCR text and workbooks). Kept out of the DataWorkspace component
 * so the composer only wires panels together.
 */
export function useRosterImport({
  students,
  onAppendStudents,
  onReplaceStudents,
  requestAiParse,
  confirmReplace,
  onMessage,
}: RosterImportOptions) {
  const [importText, setImportText] = useState("");
  const [reviewRows, setReviewRows] = useState<ImportReviewRow[]>([]);
  const [excelRecognition, setExcelRecognition] = useState<ExcelRecognition | null>(null);
  const [unparsedRows, setUnparsedRows] = useState<UnparsedLine[]>([]);
  const [isAiParsing, setIsAiParsing] = useState(false);
  const [replaceConfirmation, setReplaceConfirmation] = useState<{ currentCount: number; nextCount: number } | null>(null);

  const candidateSummary = useMemo<CandidateSummary>(() => {
    const duplicateIds = new Set(findDuplicateStudentGroups(reviewRows.map((row, index) => ({
      id: `${row.sourceLine}-${index}`,
      name: row.name,
      university: row.university,
      city: row.city,
      locationScope: row.locationScope,
    }))).flatMap((group) => group.studentIds));
    const valid = reviewRows.filter((row) => row.name.trim() && row.university.trim() && row.city.trim());
    return {
      valid: valid.length,
      missing: reviewRows.length - valid.length,
      duplicate: reviewRows.filter((_, index) => duplicateIds.has(`${reviewRows[index]!.sourceLine}-${index}`)).length,
    };
  }, [reviewRows]);

  const setCandidates = (
    candidates: ImportCandidate[],
    unparsed: UnparsedLine[],
    sourceLabel: string,
    recognition?: ExcelRecognition,
  ) => {
    setExcelRecognition(recognition?.headerRowIndex !== undefined ? recognition : null);
    setUnparsedRows(unparsed);
    if (candidates.length === 0) {
      onMessage(`没有从${sourceLabel}识别到可导入数据`);
      setReviewRows([]);
      return;
    }
    setReviewRows(candidates.map((candidate) => ({ ...candidate, accepted: true })));
    onMessage(`从${sourceLabel}识别到 ${candidates.length} 条候选${unparsed.length ? `，另有 ${unparsed.length} 行未识别` : ""}`);
  };

  const parseText = () => {
    const parsed = parseStudentText(importText);
    setCandidates(parsed.candidates, parsed.unparsed, "文本");
  };

  const parseOcrText = () => {
    const parsed = parseOcrLikeText(importText);
    setCandidates(parsed.candidates, parsed.unparsed, "OCR 文本");
  };

  /**
   * A table copied from a web page (or from a spreadsheet running in one)
   * reaches the clipboard as markup next to a plain-text flavour that often
   * loses the empty cells and the row structure. When the markup holds a
   * table it is read with the workbook engine instead, and the tab-separated
   * rendering is kept in the paste box so the user still sees what arrived.
   *
   * Returns whether the table was taken over, so the caller can suppress the
   * browser's own plain-text paste only when there is something better.
   */
  const pasteHtmlTable = (html: string): boolean => {
    const rows = parseHtmlTableRows(html);
    const text = rows ? rowsToTabText(rows) : "";
    if (!rows || !text.trim()) return false;
    setImportText((current) => (current.trim() ? `${current.replace(/\s+$/, "")}\n${text}` : text));
    const parsed = parseExcelWorkbookRows(rows);
    setCandidates(parsed.candidates, parsed.unparsed, "网页表格", parsed);
    return true;
  };

  const parseWithAi = async () => {
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

  const selectWorkbook = async (file: File | null) => {
    if (!file) return;
    // Stale recognition from a previous file must never outlive this attempt.
    setExcelRecognition(null);
    try {
      const XLSX = await import("xlsx");
      const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
      const firstSheetName = workbook.SheetNames[0];
      if (!firstSheetName) {
        onMessage("Excel 中没有工作表");
        return;
      }
      const sheet = workbook.Sheets[firstSheetName]!;
      const rows = XLSX.utils.sheet_to_json<(string | number)[]>(sheet, {
        header: 1,
        defval: "",
      });
      // Merged 省份/城市 blocks only carry a value in their anchor cell.
      const parsed = parseExcelWorkbookRows(rows, { merges: sheet["!merges"] });
      setCandidates(parsed.candidates, parsed.unparsed, `Excel（${file.name}）`, parsed);
    } catch (error) {
      onMessage(error instanceof Error ? error.message : "Excel 解析失败");
    }
  };

  const downloadTemplate = async () => {
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

  const resetReview = () => {
    setReviewRows([]);
    setExcelRecognition(null);
    setUnparsedRows([]);
    setImportText("");
  };

  const applyImport = (mode: "append" | "replace") => {
    const result = confirmImportCandidates(reviewRows);
    const next = result.students;
    if (next.length === 0) {
      onMessage(`没有可导入的有效记录，${result.issues.length} 条校验问题`);
      return;
    }
    if (mode === "replace") {
      const confirmation = { currentCount: students.length, nextCount: next.length };
      setReplaceConfirmation(confirmation);
      if (!confirmReplace(confirmation)) return;
      onReplaceStudents(next);
    } else {
      onAppendStudents(next);
    }
    resetReview();
    onMessage(`已${mode === "replace" ? "替换" : "追加"} ${next.length} 条学生数据`);
  };

  const importDirectly = async () => {
    if (!importText.trim()) {
      onMessage("请先粘贴名单");
      return;
    }
    setExcelRecognition(null);
    setIsAiParsing(true);
    let candidates: ImportCandidate[];
    let sourceLabel: string;
    try {
      const aiParsed = await requestAiParse({ text: importText, source: "paste" });
      candidates = aiParsed.candidates;
      sourceLabel = `智能识别（${aiParsed.provider}）`;
    } catch {
      candidates = parseStudentText(importText).candidates;
      sourceLabel = "本地文本识别";
    } finally {
      setIsAiParsing(false);
    }
    if (candidates.length === 0) {
      onMessage(`没有从${sourceLabel}识别到可导入的学生记录`);
      return;
    }
    const result = confirmImportCandidates(candidates.map((candidate) => ({ ...candidate, accepted: true })));
    if (result.students.length === 0) {
      onMessage("识别结果无法转换为有效记录");
      return;
    }
    onAppendStudents(result.students);
    setReviewRows([]);
    setImportText("");
    onMessage(`已从${sourceLabel}导入 ${result.students.length} 条学生记录`);
  };

  const toggleReviewRow = (index: number, accepted: boolean) => {
    setReviewRows((current) => current.map((row, rowIndex) => (rowIndex === index ? { ...row, accepted } : row)));
  };

  return {
    importText,
    setImportText,
    isAiParsing,
    reviewRows,
    excelRecognition,
    unparsedRows,
    unparsedCount: unparsedRows.length,
    candidateSummary,
    replaceConfirmation,
    parseText,
    parseOcrText,
    parseWithAi,
    pasteHtmlTable,
    importDirectly,
    selectWorkbook,
    downloadTemplate,
    toggleReviewRow,
    applyImport,
  };
}
