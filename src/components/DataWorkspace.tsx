import { Check, Eye, EyeOff, Pencil, Plus, Trash2, X } from "lucide-react";
import { useMemo, useState } from "react";
import {
  applyUniversityAutoLocation,
  confirmImportCandidates,
  createEmptyStudentDraft,
  updateStudentDraft,
  type StudentDraft,
} from "../lib/data-workspace";
import { requestAiParseData, type ParseDataResult } from "../lib/ai-client";
import type { DataViewId, Student } from "../lib/project-data";
import { resolveStudentLocation } from "../lib/student-data";
import { searchCities, searchProvinces, searchUniversities } from "../lib/search-catalog";
import { SearchCombobox, type SearchComboboxOption } from "./SearchCombobox";
import { DataImportPanel } from "./DataImportPanel";
import { UniversityEmblem } from "./UniversityEmblem";
import { ActionButton, ActionGroup, CompactButton, IconButton, PanelHeader, SegmentedControl } from "./StudioUi";

function universityOptions(query: string): SearchComboboxOption[] {
  return searchUniversities(query).map(({ name, city }) => ({ value: name, label: name, detail: city }));
}

function cityOptions(query: string): SearchComboboxOption[] {
  return searchCities(query).map(({ name, province }) => ({ value: name, label: name, detail: province }));
}

function provinceOptions(query: string): SearchComboboxOption[] {
  return searchProvinces(query).map((province) => ({ value: province, label: province }));
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
  compactRosterControls?: boolean;
}) {
  const [draft, setDraft] = useState<StudentDraft>(createEmptyStudentDraft());
  const [editingStudentId, setEditingStudentId] = useState<string | null>(null);
  const [editingDraft, setEditingDraft] = useState<StudentDraft>(createEmptyStudentDraft());
  const [provinceEditingId, setProvinceEditingId] = useState<string | null>(null);
  const [provinceDraft, setProvinceDraft] = useState("");
  const [filter, setFilter] = useState("");
  const [message, setMessage] = useState("");

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
  const [showNewStudent, setShowNewStudent] = useState(!compactRosterControls);

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

  return (
    <div className={`data-workspace${compactRosterControls ? " data-workspace--roster" : ""}`}>
      <PanelHeader title="学生数据中心" meta={`${visibleCount} 显示 / ${students.length} 条`} />

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

      <DataImportPanel
        students={students}
        onAppendStudents={onAppendStudents}
        onReplaceStudents={onReplaceStudents}
        onMessage={setMessage}
        requestAiParse={requestAiParse}
        confirmReplace={confirmReplace}
        hideTemplateDownload={hideTemplateDownload}
        // 名单为空时导入是唯一出路，折叠布局也直接展开导入区。
        defaultExpanded={!compactRosterControls || students.length === 0}
      />

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
