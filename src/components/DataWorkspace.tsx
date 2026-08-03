import { Check, Eye, EyeOff, FileUp, Image as ImageIcon, Pencil, Plus, Trash2, X } from "lucide-react";
import { useMemo, useState } from "react";
import {
  confirmImportCandidates,
  createEmptyStudentDraft,
  updateStudentDraft,
  type ImportReviewRow,
  type StudentDraft,
} from "../lib/data-workspace";
import { parseStudentText } from "../lib/import-data";
import { parseExcelWorkbookRows, parseOcrLikeText } from "../lib/binary-import";
import { requestAiParseData, type ParseDataResult } from "../lib/ai-client";
import type { DataViewId, Student } from "../lib/project-data";
import { resolveStudentLocation } from "../lib/student-data";
import { searchCities, searchProvinces, searchUniversities } from "../lib/search-catalog";
import { SearchCombobox, type SearchComboboxOption } from "./SearchCombobox";
import { FileDropzone } from "./FileDropzone";
import { ActionButton, ActionGroup, CompactButton, IconButton, PanelHeader, SegmentedControl } from "./StudioUi";

function universityOptions(query: string): SearchComboboxOption[] {
  return searchUniversities(query).map((university) => ({
    value: university.name,
    label: university.name,
    detail: university.city,
  }));
}

function cityOptions(query: string): SearchComboboxOption[] {
  return searchCities(query).map((city) => ({
    value: city.name,
    label: city.name,
    detail: city.province,
  }));
}

function provinceOptions(query: string): SearchComboboxOption[] {
  return searchProvinces(query).map((province) => ({
    value: province,
    label: province,
  }));
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
}) {
  const [draft, setDraft] = useState<StudentDraft>(createEmptyStudentDraft());
  const [editingStudentId, setEditingStudentId] = useState<string | null>(null);
  const [editingDraft, setEditingDraft] = useState<StudentDraft>(createEmptyStudentDraft());
  const [filter, setFilter] = useState("");
  const [importText, setImportText] = useState("");
  const [reviewRows, setReviewRows] = useState<ImportReviewRow[]>([]);
  const [message, setMessage] = useState("");
  const [isAiParsing, setIsAiParsing] = useState(false);

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


  const [showImport, setShowImport] = useState(true);

  const setCandidates = (
    candidates: Array<{
      name: string;
      university: string;
      city: string;
      sourceLine: number;
      rawLine: string;
    }>,
    unparsedCount: number,
    sourceLabel: string,
  ) => {
    if (candidates.length === 0) {
      setMessage(`没有从${sourceLabel}识别到可导入数据`);
      setReviewRows([]);
      return;
    }
    setReviewRows(
      candidates.map((candidate) => ({
        ...candidate,
        accepted: true,
      })),
    );
    setMessage(
      `从${sourceLabel}识别到 ${candidates.length} 条候选${unparsedCount ? `，另有 ${unparsedCount} 行未识别` : ""}`,
    );
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
    onAppendStudents(result.students);
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
      ...(editingDraft.locationScope === "international" ? { locationScope: "international" as const } : {}),
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
    const parsed = parseStudentText(importText);
    setCandidates(parsed.candidates, parsed.unparsed.length, "文本");
  };

  const prepareOcrImport = () => {
    const parsed = parseOcrLikeText(importText);
    setCandidates(parsed.candidates, parsed.unparsed.length, "OCR 文本");
  };

  const prepareAiImport = async () => {
    if (!importText.trim()) {
      setMessage("请先粘贴需要智能识别的名单");
      return;
    }
    setIsAiParsing(true);
    try {
      const parsed = await requestAiParse({ text: importText, source: "paste" });
      setCandidates(parsed.candidates, parsed.unparsed.length, `智能识别（${parsed.provider}）`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "智能识别失败");
    } finally {
      setIsAiParsing(false);
    }
  };

  const handleExcelFile = async (file: File | null) => {
    if (!file) return;
    try {
      const XLSX = await import("xlsx");
      const buffer = await file.arrayBuffer();
      const workbook = XLSX.read(buffer, { type: "array" });
      const firstSheetName = workbook.SheetNames[0];
      if (!firstSheetName) {
        setMessage("Excel 中没有工作表");
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
      setCandidates(parsed.candidates, parsed.unparsed.length, `Excel（${file.name}）`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Excel 解析失败");
    }
  };

  const handleImageOcrStub = async (file: File | null) => {
    if (!file) return;
    // Lightweight OCR path: use filename + optional pasted text as a practical adapter
    // until a real OCR backend is configured. Prefer paste box for recognized text.
    if (importText.trim()) {
      prepareOcrImport();
      setMessage((current) => `${current}（已结合图片 ${file.name} 的 OCR 文本框内容）`);
      return;
    }
    setMessage(
      `已选择图片 ${file.name}。请把 OCR 识别文本粘贴到上方文本框后点击“识别 OCR 文本”，或直接粘贴名单。`,
    );
  };

  const applyImport = (mode: "append" | "replace") => {
    const result = confirmImportCandidates(reviewRows);
    const next = result.students;
    if (next.length === 0) {
      setMessage(`没有可导入的有效记录，${result.issues.length} 条校验问题`);
      return;
    }
    if (mode === "replace") onReplaceStudents(next);
    else onAppendStudents(next);
    setReviewRows([]);
    setImportText("");
    setMessage(`已${mode === "replace" ? "替换" : "追加"} ${next.length} 条学生数据`);
  };

  const importDirectly = async () => {
    if (!importText.trim()) {
      setMessage("请先粘贴名单");
      return;
    }
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
    if (parsed.candidates.length === 0) {
      setMessage(`没有从${sourceLabel}识别到可导入的学生记录`);
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
    setMessage(`已从${sourceLabel}导入 ${result.students.length} 条学生记录`);
  };

  return (
    <div className="data-workspace">
      <PanelHeader title="学生数据中心" meta={`${visibleCount} 显示 / ${students.length} 条`} />

      <section className="data-expression" aria-labelledby="data-expression-title">
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
      </section>

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

      <div className="draft-form">
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
            onChange={(value) => setDraft(updateStudentDraft(draft, "university", value))}
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
        <ActionButton onClick={addDraftStudent}>
          <Plus size={16} /> 新增学生
        </ActionButton>
      </div>

      <div className="import-box">
        <button
          type="button"
          className="wide-button secondary import-toggle"
          onClick={() => setShowImport((current) => !current)}
        >
          {showImport ? "收起导入" : "展开导入 / OCR / Excel"}
        </button>
        {showImport && (
          <>
            <PanelHeader title="导入文本 / OCR" meta="学生姓名 · 就读院校 · 城市 · 去向类型（可选：海外）" />
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
              <FileDropzone
                id="data-ocr-image-upload"
                label="选择名单图片"
                hint="PNG / JPG · 点击或拖拽"
                accept="image/*"
                variant="secondary"
                icon={<ImageIcon size={16} aria-hidden />}
                onFile={(file) => { void handleImageOcrStub(file); }}
              />
            </div>
          </>
        )}
      </div>

      {reviewRows.length > 0 && (
        <div className="import-review">
          <PanelHeader title="确认候选" meta={`${reviewRows.filter((row) => row.accepted).length} 条勾选`} />
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

      {message && <p className="panel-note data-message">{message}</p>}

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
                      <td><input aria-label="编辑就读院校" value={editingDraft.university} placeholder="就读院校" onChange={(event) => setEditingDraft(updateStudentDraft(editingDraft, "university", event.target.value))} /></td>
                      <td><SearchCombobox label="编辑城市" value={editingDraft.city} allowFreeInput onChange={(value) => setEditingDraft(updateStudentDraft(editingDraft, "city", value))} searchOptions={cityOptions} /></td>
                      <td>
                        <select aria-label="编辑学生去向类型" value={editingDraft.locationScope ?? "china"} onChange={(event) => setEditingDraft(updateStudentDraft(editingDraft, "locationScope", event.target.value))}>
                          <option value="china">中国</option>
                          <option value="international">海外</option>
                        </select>
                        {editingDraft.locationScope !== "international" && <SearchCombobox label="编辑省份" value={editingDraft.province ?? ""} allowFreeInput onChange={(value) => setEditingDraft(updateStudentDraft(editingDraft, "province", value))} searchOptions={provinceOptions} />}
                      </td>
                      <td><div className="student-row__buttons">
                        <IconButton label={`保存 ${student.name}`} icon={<Check size={14} />} onClick={(event) => { event.stopPropagation(); saveEditing(student); }} />
                        <IconButton label={`取消编辑 ${student.name}`} icon={<X size={14} />} variant="ghost" onClick={(event) => { event.stopPropagation(); setEditingStudentId(null); }} />
                      </div></td>
                    </>
                  ) : (
                    <>
                      <td>{student.name}</td>
                      <td>{student.university}</td>
                      <td>{student.city}</td>
                      <td className={student.locationScope === "international" ? "" : location.status === "unresolved" ? "is-unresolved" : ""}>{student.locationScope === "international" ? "海外" : student.province || location.province || "未匹配"}</td>
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
