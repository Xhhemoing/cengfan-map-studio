import { Check, Download, Eye, EyeOff, FileUp, Pencil, Plus, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  applyUniversityAutoLocation,
  confirmImportCandidates,
  createEmptyStudentDraft,
  updateStudentDraft,
  type ImportReviewRow,
  type StudentDraft,
} from "../lib/data-workspace";
import { parseStudentText, type ImportCandidate, type UnparsedLine } from "../lib/import-data";
import {
  createImportTemplateSheets,
  isCsvFile,
  parseOcrLikeText,
  type ExcelImportResult,
} from "../lib/binary-import";
import { describeStudentColumns } from "../lib/student-columns";
import type { WorkbookImportRequest, WorkbookImportResponse } from "../workers/workbook-import.worker";
import { requestAiParseData, type ParseDataResult } from "../lib/ai-client";
import { DataMessageRegions } from "./DataMessageRegions";
import { ImportRecognitionReport } from "./ImportRecognitionReport";
import type { DataViewId, Student } from "../lib/project-data";
import { resolveStudentLocation } from "../lib/student-data";
import { findDuplicateStudentGroups } from "../lib/data-duplicate";
import { cityOptions, provinceOptions, universityOptions } from "../lib/roster-search-options";
import { SearchCombobox } from "./SearchCombobox";
import { FileDropzone } from "./FileDropzone";
import { UniversityEmblem } from "./UniversityEmblem";
import { ActionButton, ActionGroup, CompactButton, IconButton, PanelHeader, SegmentedControl } from "./StudioUi";
import "./roster-import.css";

/** 提示里最多点名几张未读取的工作表，其余用「等」收尾。 */
const SKIPPED_SHEET_PREVIEW = 3;
/** 压缩工作簿解包后的体积可能远大于文件本身，先挡住异常大的输入再读取到内存。 */
const MAX_WORKBOOK_FILE_BYTES = 25 * 1024 * 1024;
/** 病态工作簿不能无限占住导入流程；超时后销毁 worker，避免其继续消耗 CPU。 */
const WORKBOOK_PARSE_DEADLINE_MS = 30_000;
/** 连续导入复用已加载 XLSX 的 worker，空闲后再释放其模块和堆内存。 */
const WORKBOOK_WORKER_IDLE_MS = 30_000;
const WORKBOOK_IMPORT_CANCELLED = Symbol("workbook-import-cancelled");

interface ActiveWorkbookImport {
  worker: Worker;
  requestId: number;
  deadlineTimer: ReturnType<typeof setTimeout>;
  reject: (reason: unknown) => void;
}

function createWorkbookImportWorker(): Worker {
  if (typeof Worker === "undefined") throw new Error("当前浏览器不支持后台解析 Excel / CSV");
  return new Worker(new URL("../workers/workbook-import.worker.ts", import.meta.url), { type: "module" });
}

function describeSkippedSheets(names: readonly string[]): string {
  if (names.length === 0) return "";
  const preview = names.slice(0, SKIPPED_SHEET_PREVIEW).join("、");
  return `，另有 ${names.length} 张工作表未读取（${preview}${names.length > SKIPPED_SHEET_PREVIEW ? " 等" : ""}）`;
}

export function DataWorkspace({
  students,
  onReplaceStudents,
  onAppendStudents,
  onUpdateStudent,
  onToggleVisibility,
  onDeleteStudent,
  onSetStudentsVisibility,
  selectedStudentId = null,
  onSelectStudent = () => {},
  dataView = "province",
  onChangeDataView = () => {},
  requestAiParse = requestAiParseData,
  confirmDelete = (student) => window.confirm(`确认删除 ${student.name} 吗？`),
  confirmReplace = ({ currentCount, nextCount }) => window.confirm(`确认替换全部名单？当前 ${currentCount} 条 -> 新 ${nextCount} 条`),
  hideDataExpression = false,
  hideTemplateDownload = false,
  hideWorkbenchHeader = false,
  compactRosterControls = false,
}: {
  students: Student[];
  onReplaceStudents: (students: Student[]) => void;
  onAppendStudents: (students: Student[]) => void;
  onUpdateStudent: (id: string, patch: Partial<Pick<Student, "name" | "university" | "city" | "province" | "locationScope">>) => void;
  onToggleVisibility: (id: string) => void;
  onDeleteStudent: (id: string) => void;
  onSetStudentsVisibility: (visibility: boolean) => void;
  selectedStudentId?: string | null;
  onSelectStudent?: (id: string) => void;
  dataView?: DataViewId;
  onChangeDataView?: (view: DataViewId) => void;
  requestAiParse?: (input: { text: string; source: "paste" | "ocr" }) => Promise<ParseDataResult>;
  confirmDelete?: (student: Student) => boolean;
  confirmReplace?: (input: { currentCount: number; nextCount: number }) => boolean;
  hideDataExpression?: boolean;
  hideTemplateDownload?: boolean;
  /** 名单阶段外壳已有「名单」标题时隐藏内部的「学生数据中心」头。 */
  hideWorkbenchHeader?: boolean;
  compactRosterControls?: boolean;
}) {
  const [draft, setDraft] = useState<StudentDraft>(createEmptyStudentDraft());
  const [editingStudentId, setEditingStudentId] = useState<string | null>(null);
  const [editingDraft, setEditingDraft] = useState<StudentDraft>(createEmptyStudentDraft());
  const [provinceEditingId, setProvinceEditingId] = useState<string | null>(null);
  const [provinceDraft, setProvinceDraft] = useState("");
  const [filter, setFilter] = useState("");
  const [importText, setImportText] = useState("");
  const [reviewRows, setReviewRows] = useState<ImportReviewRow[]>([]);
  const [excelRecognition, setExcelRecognition] = useState<Pick<ExcelImportResult, "headerRowIndex" | "columnMappings" | "unmappedHeaders" | "missingRequiredFields"> | null>(null);
  const [message, setMessage] = useState("");
  const [isAiParsing, setIsAiParsing] = useState(false);
  const [replaceConfirmation, setReplaceConfirmation] = useState<{ currentCount: number; nextCount: number } | null>(null);
  const [unparsedRows, setUnparsedRows] = useState<UnparsedLine[]>([]);
  /**
   * 每次发起识别都领一个号，只有仍持有最新号的那次才能落到候选状态上。
   * 连点两次文件选择时，先发出的那次可能后返回，没有这道闸就会用旧文件覆盖新文件。
   */
  const importGenerationRef = useRef(0);
  const workbookWorkerRef = useRef<Worker | null>(null);
  const activeWorkbookImportRef = useRef<ActiveWorkbookImport | null>(null);
  const workbookWorkerIdleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const clearWorkbookWorkerIdleTimer = () => {
    if (workbookWorkerIdleTimerRef.current === null) return;
    clearTimeout(workbookWorkerIdleTimerRef.current);
    workbookWorkerIdleTimerRef.current = null;
  };
  const terminateWorkbookWorker = (worker: Worker | null = workbookWorkerRef.current) => {
    if (!worker) return;
    clearWorkbookWorkerIdleTimer();
    if (workbookWorkerRef.current === worker) workbookWorkerRef.current = null;
    worker.terminate();
  };
  const scheduleWorkbookWorkerIdleTeardown = (worker: Worker) => {
    clearWorkbookWorkerIdleTimer();
    if (workbookWorkerRef.current !== worker) return;
    workbookWorkerIdleTimerRef.current = setTimeout(() => {
      workbookWorkerIdleTimerRef.current = null;
      if (workbookWorkerRef.current === worker && activeWorkbookImportRef.current?.worker !== worker) {
        terminateWorkbookWorker(worker);
      }
    }, WORKBOOK_WORKER_IDLE_MS);
  };
  const acquireWorkbookWorker = (): Worker => {
    clearWorkbookWorkerIdleTimer();
    if (!workbookWorkerRef.current) workbookWorkerRef.current = createWorkbookImportWorker();
    return workbookWorkerRef.current;
  };
  const cancelWorkbookImport = () => {
    const active = activeWorkbookImportRef.current;
    if (!active) return;
    activeWorkbookImportRef.current = null;
    clearTimeout(active.deadlineTimer);
    terminateWorkbookWorker(active.worker);
    active.reject(WORKBOOK_IMPORT_CANCELLED);
  };
  const beginImport = (): number => {
    importGenerationRef.current += 1;
    cancelWorkbookImport();
    return importGenerationRef.current;
  };
  const isCurrentImport = (generation: number): boolean => importGenerationRef.current === generation;

  const parseWorkbookInWorker = async (
    buffer: ArrayBuffer,
    isCsv: boolean,
    requestId: number,
  ): Promise<Extract<WorkbookImportResponse, { type: "result" }>> => {
    const worker = acquireWorkbookWorker();
    try {
      return await new Promise((resolve, reject) => {
        let settled = false;
        let deadlineTimer: ReturnType<typeof setTimeout>;
        const settle = () => {
          if (settled) return false;
          settled = true;
          clearTimeout(deadlineTimer);
          if (
            activeWorkbookImportRef.current?.worker === worker
            && activeWorkbookImportRef.current.requestId === requestId
          ) {
            activeWorkbookImportRef.current = null;
          }
          return true;
        };
        const rejectOnce = (reason: unknown) => {
          if (!settle()) return;
          reject(reason);
        };
        const resolveOnce = (response: Extract<WorkbookImportResponse, { type: "result" }>) => {
          if (!settle()) return;
          resolve(response);
        };
        deadlineTimer = setTimeout(() => {
          terminateWorkbookWorker(worker);
          rejectOnce(new Error("解析超时：等了 30 秒还没读完，这个文件可能已损坏。用 Excel / WPS 重新另存一份 .xlsx 再试。"));
        }, WORKBOOK_PARSE_DEADLINE_MS);
        activeWorkbookImportRef.current = { worker, requestId, deadlineTimer, reject: rejectOnce };
        worker.onmessage = (event: MessageEvent<WorkbookImportResponse>) => {
          const response = event.data;
          if (response.requestId !== requestId) return;
          if (response.type === "error") {
            rejectOnce(new Error(response.message));
            return;
          }
          resolveOnce(response);
        };
        worker.onerror = (event) => {
          event.preventDefault();
          terminateWorkbookWorker(worker);
          rejectOnce(new Error(event.message || "工作簿后台解析失败"));
        };
        worker.onmessageerror = () => {
          terminateWorkbookWorker(worker);
          rejectOnce(new Error("工作簿后台解析结果无法读取"));
        };
        const request: WorkbookImportRequest = {
          type: "parse-workbook",
          requestId,
          buffer,
          isCsv,
        };
        try {
          worker.postMessage(request, [buffer]);
        } catch (error) {
          terminateWorkbookWorker(worker);
          rejectOnce(error);
        }
      });
    } finally {
      if (workbookWorkerRef.current === worker) scheduleWorkbookWorkerIdleTeardown(worker);
    }
  };

  useEffect(() => () => {
    importGenerationRef.current += 1;
    cancelWorkbookImport();
    terminateWorkbookWorker();
  }, []);

  const filteredStudents = useMemo(() => {
    const query = filter.trim().toLocaleLowerCase("zh-CN");
    if (!query) return students;
    return students.filter((student) =>
      [student.name, student.university, student.city, student.province].some((value) =>
        value?.toLocaleLowerCase("zh-CN").includes(query),
      ),
    );
  }, [filter, students]);

  const unresolvedCount = useMemo(
    () => filteredStudents.filter((student) => student.locationScope !== "international" && resolveStudentLocation(student).status === "unresolved").length,
    [filteredStudents],
  );
  const visibleCount = useMemo(
    () => filteredStudents.filter((student) => student.visibility !== false).length,
    [filteredStudents],
  );
  const candidateSummary = useMemo(() => {
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


  // 空名单没有起点可言：粘贴/上传是这一屏唯一能做的事，收起来等于让人对着空表发呆。
  const [showImport, setShowImport] = useState(!compactRosterControls || students.length === 0);
  const [showNewStudent, setShowNewStudent] = useState(!compactRosterControls);

  const setCandidates = (
    candidates: ImportCandidate[],
    unparsed: UnparsedLine[],
    sourceLabel: string,
    recognition?: Pick<ExcelImportResult, "headerRowIndex" | "columnMappings" | "unmappedHeaders" | "missingRequiredFields">,
    /** 追加在识别口径之后的补充说明，目前用于点名没被读取的工作表。 */
    note = "",
  ) => {
    setExcelRecognition(recognition?.headerRowIndex !== undefined ? recognition : null);
    setUnparsedRows(unparsed);
    const droppedNote = unparsed.length ? `，另有 ${unparsed.length} 行未识别` : "";
    const missingColumns = recognition?.missingRequiredFields ?? [];
    if (candidates.length === 0) {
      // 缺列是整表读空里最常见也最好修的一种，直接点名缺哪一列，
      // 别让人从「未识别」四个字里猜自己的表哪儿不对。
      setMessage(missingColumns.length > 0
        ? `这张表里没有「${describeStudentColumns(missingColumns)}」这一列，所以一个人都没导进来。补上这一列，或下载模板照着填再上传。`
        : `没有从${sourceLabel}识别到可导入数据${droppedNote}${note}`);
      setReviewRows([]);
      return;
    }
    setReviewRows(
      candidates.map((candidate) => ({
        ...candidate,
        accepted: true,
      })),
    );
    setMessage(`从${sourceLabel}识别到 ${candidates.length} 条候选${droppedNote}${note}`);
  };

  const addDraftStudent = () => {
    const result = confirmImportCandidates([
      {
        name: draft.name,
        university: draft.university,
        city: draft.city,
        locationScope: draft.locationScope,
        sourceLine: 1,
        rawLine: `${draft.name} ${draft.university} ${draft.city}`,
        accepted: true,
      },
    ]);
    if (result.students.length === 0) {
      setMessage(result.issues[0]?.message || "请填写学生姓名、就读院校和城市");
      return;
    }
    onAppendStudents(result.students.map((student) => ({
      ...student,
      province: draft.locationScope === "international" ? undefined : draft.province?.trim() || undefined,
    })));
    setDraft(createEmptyStudentDraft());
    setMessage("已新增 1 名学生");
  };

  const startEditing = (student: Student) => {
    setEditingStudentId(student.id);
    setEditingDraft({
      name: student.name,
      university: student.university,
      city: student.city,
      province: student.province ?? "",
      locationScope: student.locationScope ?? "china",
    });
  };

  const saveEditing = (student: Student) => {
    const next = {
      name: editingDraft.name.trim(),
      university: editingDraft.university.trim(),
      city: editingDraft.city.trim(),
      // Empty province clears override so city auto-match is used again.
      province: editingDraft.province?.trim() || undefined,
      locationScope: editingDraft.locationScope === "international" ? "international" as const : undefined,
    };
    if (!next.name || !next.university || !next.city) {
      setMessage("学生姓名、就读院校和城市不能为空");
      return;
    }
    onUpdateStudent(student.id, next);
    setEditingStudentId(null);
    setEditingDraft(createEmptyStudentDraft());
    setMessage(`已更新 ${next.name}`);
  };

  const prepareImport = () => {
    beginImport();
    const parsed = parseStudentText(importText);
    setCandidates(parsed.candidates, parsed.unparsed, "文本");
  };

  const downloadImportTemplate = async () => {
    try {
      const XLSX = await import("xlsx");
      const template = createImportTemplateSheets();
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(template.data), "学生数据");
      XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(template.guide), "填写说明");
      XLSX.writeFile(workbook, "蹭饭图-学生数据导入模板.xlsx");
      setMessage("已下载学生数据导入模板");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "模板下载失败");
    }
  };

  const prepareOcrImport = () => {
    beginImport();
    const parsed = parseOcrLikeText(importText);
    setCandidates(parsed.candidates, parsed.unparsed, "OCR 文本");
  };

  const prepareAiImport = async () => {
    if (!importText.trim()) {
      setMessage("请先粘贴需要智能识别的名单");
      return;
    }
    const generation = beginImport();
    setIsAiParsing(true);
    try {
      const parsed = await requestAiParse({ text: importText, source: "paste" });
      if (!isCurrentImport(generation)) return;
      setCandidates(parsed.candidates, parsed.unparsed, `智能识别（${parsed.provider}）`);
    } catch (error) {
      if (!isCurrentImport(generation)) return;
      setMessage(error instanceof Error ? error.message : "智能识别失败");
    } finally {
      setIsAiParsing(false);
    }
  };

  const handleExcelFile = async (file: File | null) => {
    if (!file) return;
    const generation = beginImport();
    setExcelRecognition(null);
    const csv = isCsvFile(file);
    if (file.size > MAX_WORKBOOK_FILE_BYTES) {
      setMessage("文件过大：Excel / CSV 最多 25 MB。删掉表里无关的工作表和图片后另存一份，再上传。");
      return;
    }
    try {
      const buffer = await file.arrayBuffer();
      if (!isCurrentImport(generation)) return;
      // 二进制解码、逐表 sheet_to_json 与 T8 的选表逻辑都在 worker 内完成；
      // ArrayBuffer 直接转移所有权，避免主线程再复制一份大文件。
      const response = await parseWorkbookInWorker(buffer, csv, generation);
      if (!isCurrentImport(generation)) return;
      const { parsed } = response;
      if (!parsed) {
        setMessage(csv ? "CSV 中没有数据" : "Excel 中没有工作表");
        return;
      }
      // 点名 GB18030：真遇到编码猜错时，用户能从提示里看出该换个编码另存。
      const encodingNote = response.encoding === "gb18030" ? " · 按 GB18030 解码" : "";
      setCandidates(
        parsed.candidates,
        parsed.unparsed,
        csv ? `CSV（${file.name}${encodingNote}）` : `Excel（${file.name} · 工作表「${parsed.sheetName}」）`,
        parsed,
        describeSkippedSheets(parsed.skippedSheetNames),
      );
    } catch (error) {
      if (!isCurrentImport(generation)) return;
      setMessage(error instanceof Error ? error.message : `${csv ? "CSV" : "Excel"} 解析失败`);
    }
  };

  const applyImport = (mode: "append" | "replace") => {
    const result = confirmImportCandidates(reviewRows);
    const next = result.students;
    // 跳过口径覆盖两段损耗：解析阶段就没读成候选的行，以及候选里被取消勾选或校验不通过的行。
    const skipped = unparsedRows.length + result.rejected.length;
    if (next.length === 0) {
      setMessage(`没有可导入的有效记录，${result.issues.length} 条校验问题，跳过 ${skipped} 行`);
      return;
    }
    if (mode === "replace") {
      const confirmation = { currentCount: students.length, nextCount: next.length };
      setReplaceConfirmation(confirmation);
      if (!confirmReplace(confirmation)) return;
    } else onAppendStudents(next);
    if (mode === "replace") onReplaceStudents(next);
    setReviewRows([]);
    setExcelRecognition(null);
    setUnparsedRows([]);
    setImportText("");
    setMessage(`已${mode === "replace" ? "替换" : "追加"} ${next.length} 条学生数据，跳过 ${skipped} 行`);
  };

  const importDirectly = async () => {
    if (!importText.trim()) {
      setMessage("请先粘贴名单");
      return;
    }
    const generation = beginImport();
    setExcelRecognition(null);
    setIsAiParsing(true);
    let parsed;
    let sourceLabel: string;
    try {
      const aiParsed = await requestAiParse({ text: importText, source: "paste" });
      parsed = { candidates: aiParsed.candidates, unparsed: aiParsed.unparsed };
      sourceLabel = `智能识别（${aiParsed.provider}）`;
    } catch {
      parsed = parseStudentText(importText);
      sourceLabel = "本地文本识别";
    } finally {
      setIsAiParsing(false);
    }
    if (!isCurrentImport(generation)) return;
    setUnparsedRows(parsed.unparsed);
    if (parsed.candidates.length === 0) {
      setMessage(`没有从${sourceLabel}识别到可导入的学生记录，跳过 ${parsed.unparsed.length} 行`);
      return;
    }
    const result = confirmImportCandidates(parsed.candidates.map((c) => ({ ...c, accepted: true })));
    if (result.students.length === 0) {
      setMessage("识别结果无法转换为有效记录");
      return;
    }
    onAppendStudents(result.students);
    setReviewRows([]);
    setImportText("");
    setMessage(`已从${sourceLabel}导入 ${result.students.length} 条学生记录，跳过 ${parsed.unparsed.length + result.rejected.length} 行`);
  };

  return (
    <div className={`data-workspace${compactRosterControls ? " data-workspace--roster" : ""}`}>
      {!hideWorkbenchHeader && <PanelHeader title="学生数据中心" meta={`${visibleCount} 显示 / ${students.length} 条`} />}

      {!hideDataExpression && <section className="data-expression" aria-labelledby="data-expression-title">
        <PanelHeader id="data-expression-title" title="地图呈现方式" meta="同一份名单，实时切换" />
        <SegmentedControl
          label="地图呈现方式"
          activeId={dataView}
          items={[
            { id: "pins", label: "图钉", ariaLabel: "切换为地图图钉" },
            { id: "province", label: "省份", ariaLabel: "切换为省份汇总" },
            { id: "city", label: "城市", ariaLabel: "切换为城市汇总" },
            { id: "university", label: "学校", ariaLabel: "切换为学校汇总" },
            { id: "heat", label: "热力", ariaLabel: "切换为人数热力" },
          ]}
          onChange={onChangeDataView}
          className="data-expression__control"
        />
      </section>}

      <div className="data-summary">
        <div>
          <strong>{students.length}</strong>
          <span>总记录</span>
        </div>
        <div>
          <strong>{visibleCount}</strong>
          <span>可见</span>
        </div>
        <div>
          <strong>{students.length - visibleCount}</strong>
          <span>隐藏</span>
        </div>
        {unresolvedCount > 0 && (
          <div className="data-summary__warning">
            <strong>{unresolvedCount}</strong>
            <span>未匹配城市</span>
          </div>
        )}
      </div>

      <section className="data-workspace__new-student">
        {compactRosterControls && (
          <button
            type="button"
            className="data-workspace__section-toggle"
            aria-label={showNewStudent ? "收起新增学生" : "展开新增学生"}
            aria-expanded={showNewStudent}
            onClick={() => setShowNewStudent((current) => !current)}
          >
            <Plus size={15} aria-hidden />
            <span>新增学生</span>
          </button>
        )}
        {showNewStudent && <div className="draft-form">
          <label>
            去向类型
            <select aria-label="新增学生去向类型" value={draft.locationScope ?? "china"} onChange={(event) => setDraft(updateStudentDraft(draft, "locationScope", event.target.value))}>
              <option value="china">中国去向</option>
              <option value="international">海外去向</option>
            </select>
          </label>
          <label>
            学生名称
            <input
              value={draft.name}
              onChange={(event) => setDraft(updateStudentDraft(draft, "name", event.target.value))}
              placeholder="林舟"
            />
          </label>
          <label>
            就读院校
            <SearchCombobox
              label="就读院校"
              value={draft.university}
              onChange={(value) => setDraft(applyUniversityAutoLocation(draft, value))}
              placeholder="北京大学"
              searchOptions={universityOptions}
            />
          </label>
          <label>
            {draft.locationScope === "international" ? "国家/地区与城市" : "城市"}
            <SearchCombobox
              label="城市"
              value={draft.city}
              allowFreeInput
              onChange={(value) => setDraft(updateStudentDraft(draft, "city", value))}
              placeholder={draft.locationScope === "international" ? "美国·波士顿" : "北京"}
              searchOptions={draft.locationScope === "international" ? () => [] : cityOptions}
            />
          </label>
          {draft.locationScope !== "international" && (
            <label>
              省份
              <SearchCombobox
                label="新增省份"
                value={draft.province ?? ""}
                allowFreeInput
                onChange={(value) => setDraft(updateStudentDraft(draft, "province", value))}
                placeholder="浙江省"
                searchOptions={provinceOptions}
              />
            </label>
          )}
          <ActionButton onClick={addDraftStudent}>
            <Plus size={16} /> 新增学生
          </ActionButton>
        </div>}
      </section>

      <div className="import-box">
        {!hideTemplateDownload && (
          // 「先下载模板照着填」是最省事的一条路，不能藏在折叠面板里：
          // 名单阶段 compactRosterControls 让导入区默认收起，模板入口必须活在收起之外。
          <div className="import-box__template">
            <CompactButton
              variant="secondary"
              aria-label="下载学生数据 XLSX 模板"
              icon={<Download size={16} aria-hidden />}
              onClick={() => { void downloadImportTemplate(); }}
            >
              下载 XLSX 模板
            </CompactButton>
            <span className="import-box__template-hint">没有现成表格？下载模板照着填，再上传最省事。</span>
          </div>
        )}
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
                hint="XLSX / CSV · 最大 25 MB"
                accept=".xlsx,.xls,.csv"
                variant="secondary"
                icon={<FileUp size={16} aria-hidden />}
                onFile={(file) => { void handleExcelFile(file); }}
              />
            </div>
          </>
        )}
      </div>

      <ImportRecognitionReport
        recognition={excelRecognition}
        unparsedRows={unparsedRows}
        hideTemplateDownload={hideTemplateDownload}
        onDownloadTemplate={() => { void downloadImportTemplate(); }}
      />

      {reviewRows.length > 0 && (
        <div className="import-review">
          <PanelHeader title="确认候选" meta={`有效 ${candidateSummary.valid} · 未识别 ${unparsedRows.length} · 缺失字段 ${candidateSummary.missing} · 重复 ${candidateSummary.duplicate}`} />
          <div className="review-list">
            {reviewRows.map((row, index) => (
              <label key={`${row.sourceLine}-${index}`} className="review-row">
                <input
                  type="checkbox"
                  checked={row.accepted}
                  onChange={(event) => {
                    setReviewRows((current) =>
                      current.map((item, itemIndex) =>
                        itemIndex === index
                          ? { ...item, accepted: event.target.checked }
                          : item,
                      ),
                    );
                  }}
                />
                <span>
                  <strong>{row.name}</strong>
                  <small>
                    {row.university} · {row.city}
                  </small>
                </span>
              </label>
            ))}
          </div>
          <ActionGroup label="确认导入" className="review-actions">
            <ActionButton onClick={() => applyImport("append")}>
              追加导入
            </ActionButton>
            <CompactButton variant="secondary" onClick={() => applyImport("replace")}>
              替换全部
            </CompactButton>
          </ActionGroup>
        </div>
      )}

      <DataMessageRegions message={message} replaceConfirmation={replaceConfirmation} />

      <div className="student-actions">
        <input
          aria-label="筛选学生"
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
          placeholder="筛选姓名、就读院校或城市"
        />
        <ActionGroup label="名单批量操作">
          <CompactButton aria-label="全部显示" icon={<Eye size={14} aria-hidden />} onClick={() => onSetStudentsVisibility(true)}>
            全部显示
          </CompactButton>
          <CompactButton aria-label="全部隐藏" icon={<EyeOff size={14} aria-hidden />} onClick={() => onSetStudentsVisibility(false)}>
            全部隐藏
          </CompactButton>
          {filter && (
            <CompactButton icon={<X size={14} aria-hidden />} variant="ghost" onClick={() => setFilter("")}>清空筛选</CompactButton>
          )}
        </ActionGroup>
      </div>

      <div className="data-list data-table-wrap">
        <table className="student-table" aria-label="学生数据表">
          <thead>
            <tr>
              <th>学生</th>
              <th>学校</th>
              <th>城市</th>
              <th>省份 / 去向</th>
              <th aria-label="操作">操作</th>
            </tr>
          </thead>
          <tbody>
            {filteredStudents.length === 0 && (
              <tr className="student-table__empty">
                <td colSpan={5}>
                  {students.length === 0
                    ? "还没有学生。上面「下载 XLSX 模板」照着填完再上传，或者直接粘贴「姓名 学校 城市」，一行一个人。"
                    : `没有匹配「${filter.trim()}」的记录。`}
                  {students.length > 0 && (
                    <CompactButton variant="ghost" onClick={() => setFilter("")}>清空筛选</CompactButton>
                  )}
                </td>
              </tr>
            )}
            {filteredStudents.map((student) => {
              const isEditing = editingStudentId === student.id;
              const isVisible = student.visibility !== false;
              const location = resolveStudentLocation(student);
              const selectRow = () => onSelectStudent(student.id);
              return (
                <tr
                  key={student.id}
                  data-student-row={student.id}
                  data-editing={isEditing || undefined}
                  className={`${isVisible ? "" : "is-hidden"} ${selectedStudentId === student.id ? "is-selected" : ""}`}
                  onClick={selectRow}
                  onDoubleClick={() => startEditing(student)}
                >
                  {isEditing ? (
                    <>
                      <td><input aria-label="编辑学生名称" value={editingDraft.name} placeholder="姓名" onChange={(event) => setEditingDraft(updateStudentDraft(editingDraft, "name", event.target.value))} /></td>
                      <td><input aria-label="编辑就读院校" value={editingDraft.university} placeholder="就读院校" onChange={(event) => setEditingDraft(applyUniversityAutoLocation(editingDraft, event.target.value))} /></td>
                      <td><SearchCombobox label="编辑城市" value={editingDraft.city} allowFreeInput portal onChange={(value) => setEditingDraft(updateStudentDraft(editingDraft, "city", value))} searchOptions={cityOptions} /></td>
                      <td>
                        <select aria-label="编辑学生去向类型" value={editingDraft.locationScope ?? "china"} onChange={(event) => setEditingDraft(updateStudentDraft(editingDraft, "locationScope", event.target.value))}>
                          <option value="china">中国</option>
                          <option value="international">海外</option>
                        </select>
                        {editingDraft.locationScope !== "international" && <SearchCombobox label="编辑省份" value={editingDraft.province ?? ""} allowFreeInput portal onChange={(value) => setEditingDraft(updateStudentDraft(editingDraft, "province", value))} searchOptions={provinceOptions} />}
                      </td>
                      <td><div className="student-row__buttons">
                        <IconButton label={`保存 ${student.name}`} icon={<Check size={14} />} onClick={(event) => { event.stopPropagation(); saveEditing(student); }} />
                        <IconButton label={`取消编辑 ${student.name}`} icon={<X size={14} />} variant="ghost" onClick={(event) => { event.stopPropagation(); setEditingStudentId(null); }} />
                      </div></td>
                    </>
                  ) : (
                    <>
                      <td><span className="student-name-cell"><UniversityEmblem university={student.university} size={22} alt={`${student.university || "未知学校"}校徽`} /><span className="student-name-text">{student.name}</span></span></td>
                      <td>{student.university}</td>
                      <td>{student.city}</td>
                      <td className={student.locationScope === "international" ? "" : location.status === "unresolved" ? "is-unresolved" : ""}>
                        {student.locationScope === "international" ? "海外" : provinceEditingId === student.id ? (
                          <div className="student-province-editor">
                            <SearchCombobox
                              label={`编辑 ${student.name} 的省份`}
                              value={provinceDraft}
                              allowFreeInput
                              portal
                              onChange={setProvinceDraft}
                              searchOptions={provinceOptions}
                            />
                            <IconButton label={`保存 ${student.name} 省份`} icon={<Check size={14} />} onClick={(event) => {
                              event.stopPropagation();
                              onUpdateStudent(student.id, { province: provinceDraft.trim() || undefined });
                              setProvinceEditingId(null);
                              setProvinceDraft("");
                            }} />
                            <IconButton label={`取消编辑 ${student.name} 省份`} icon={<X size={14} />} variant="ghost" onClick={(event) => {
                              event.stopPropagation();
                              setProvinceEditingId(null);
                              setProvinceDraft("");
                            }} />
                          </div>
                        ) : (
                          <span className="student-province-value">
                            {student.province || location.province || "未匹配"}
                            <button
                              type="button"
                              className="student-province-edit"
                              aria-label={`修改 ${student.name} 省份`}
                              title="修改省份（支持自定义省份名）"
                              onClick={(event) => {
                                event.stopPropagation();
                                setProvinceDraft(student.province ?? "");
                                setProvinceEditingId(student.id);
                              }}
                            >
                              <Pencil size={11} aria-hidden />
                            </button>
                          </span>
                        )}
                      </td>
                      <td><div className="student-row__buttons">
                        <IconButton label={`编辑 ${student.name}`} icon={<Pencil size={14} />} onClick={(event) => { event.stopPropagation(); startEditing(student); }} />
                        <IconButton label={`${isVisible ? "隐藏" : "显示"} ${student.name}`} icon={isVisible ? <EyeOff size={14} /> : <Eye size={14} />} onClick={(event) => { event.stopPropagation(); onToggleVisibility(student.id); }} />
                        <IconButton label={`删除 ${student.name}`} icon={<Trash2 size={14} />} variant="danger" onClick={(event) => { event.stopPropagation(); if (confirmDelete(student)) onDeleteStudent(student.id); }} />
                      </div></td>
                    </>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
