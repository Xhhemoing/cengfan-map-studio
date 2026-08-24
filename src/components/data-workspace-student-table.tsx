import { Check, Eye, EyeOff, Pencil, Trash2, X } from "lucide-react";
import {
  applyUniversityAutoLocation,
  updateStudentDraft,
  type StudentDraft,
} from "../lib/data-workspace";
import type { Student } from "../lib/project-data";
import { resolveStudentLocation } from "../lib/student-data";
import { SearchCombobox } from "./SearchCombobox";
import { UniversityEmblem } from "./UniversityEmblem";
import { IconButton } from "./StudioUi";
import { cityOptions, provinceOptions } from "./data-workspace-fields";

export interface StudentTableEditingState {
  studentId: string | null;
  draft: StudentDraft;
  onChangeDraft: (draft: StudentDraft) => void;
  onStart: (student: Student) => void;
  onSave: (student: Student) => void;
  onCancel: () => void;
}

export interface StudentTableProvinceState {
  studentId: string | null;
  draft: string;
  onChangeDraft: (value: string) => void;
  onStart: (student: Student) => void;
  onSave: (student: Student) => void;
  onCancel: () => void;
}

/** Spreadsheet-style roster editor: one row per student, inline edit and province override. */
export function DataWorkspaceStudentTable({
  students,
  selectedStudentId,
  onSelectStudent,
  onToggleVisibility,
  onDeleteStudent,
  confirmDelete,
  editing,
  provinceEditing,
}: {
  students: Student[];
  selectedStudentId: string | null;
  onSelectStudent: (id: string) => void;
  onToggleVisibility: (id: string) => void;
  onDeleteStudent: (id: string) => void;
  confirmDelete: (student: Student) => boolean;
  editing: StudentTableEditingState;
  provinceEditing: StudentTableProvinceState;
}) {
  return (
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
          {students.map((student) => {
            const isEditing = editing.studentId === student.id;
            const isVisible = student.visibility !== false;
            const location = resolveStudentLocation(student);
            const isInternational = student.locationScope === "international";
            return (
              <tr
                key={student.id}
                data-student-row={student.id}
                data-editing={isEditing || undefined}
                // Not in the tab order, but focusable so 定位 from the data
                // quality rail can move the caret onto the located record.
                tabIndex={-1}
                aria-current={selectedStudentId === student.id ? "true" : undefined}
                className={`${isVisible ? "" : "is-hidden"} ${selectedStudentId === student.id ? "is-selected" : ""}`}
                onClick={() => onSelectStudent(student.id)}
                onDoubleClick={() => editing.onStart(student)}
              >
                {isEditing ? (
                  <>
                    <td>
                      <input
                        aria-label="编辑学生名称"
                        value={editing.draft.name}
                        placeholder="姓名"
                        onChange={(event) => editing.onChangeDraft(updateStudentDraft(editing.draft, "name", event.target.value))}
                      />
                    </td>
                    <td>
                      <input
                        aria-label="编辑就读院校"
                        value={editing.draft.university}
                        placeholder="就读院校"
                        onChange={(event) => editing.onChangeDraft(applyUniversityAutoLocation(editing.draft, event.target.value))}
                      />
                    </td>
                    <td>
                      <SearchCombobox
                        label="编辑城市"
                        value={editing.draft.city}
                        allowFreeInput
                        portal
                        onChange={(value) => editing.onChangeDraft(updateStudentDraft(editing.draft, "city", value))}
                        searchOptions={cityOptions}
                      />
                    </td>
                    <td>
                      <select
                        aria-label="编辑学生去向类型"
                        value={editing.draft.locationScope ?? "china"}
                        onChange={(event) => editing.onChangeDraft(updateStudentDraft(editing.draft, "locationScope", event.target.value))}
                      >
                        <option value="china">中国</option>
                        <option value="international">海外</option>
                      </select>
                      {editing.draft.locationScope !== "international" && (
                        <SearchCombobox
                          label="编辑省份"
                          value={editing.draft.province ?? ""}
                          allowFreeInput
                          portal
                          onChange={(value) => editing.onChangeDraft(updateStudentDraft(editing.draft, "province", value))}
                          searchOptions={provinceOptions}
                        />
                      )}
                    </td>
                    <td>
                      <div className="student-row__buttons">
                        <IconButton
                          label={`保存 ${student.name}`}
                          icon={<Check size={14} />}
                          onClick={(event) => { event.stopPropagation(); editing.onSave(student); }}
                        />
                        <IconButton
                          label={`取消编辑 ${student.name}`}
                          icon={<X size={14} />}
                          variant="ghost"
                          onClick={(event) => { event.stopPropagation(); editing.onCancel(); }}
                        />
                      </div>
                    </td>
                  </>
                ) : (
                  <>
                    <td>
                      <span className="student-name-cell">
                        <UniversityEmblem university={student.university} size={22} alt={`${student.university || "未知学校"}校徽`} />
                        <span className="student-name-text">{student.name}</span>
                      </span>
                    </td>
                    <td>{student.university}</td>
                    <td>{student.city}</td>
                    <td className={isInternational ? "" : location.status === "unresolved" ? "is-unresolved" : ""}>
                      {isInternational ? "海外" : provinceEditing.studentId === student.id ? (
                        <div className="student-province-editor">
                          <SearchCombobox
                            label={`编辑 ${student.name} 的省份`}
                            value={provinceEditing.draft}
                            allowFreeInput
                            portal
                            onChange={provinceEditing.onChangeDraft}
                            searchOptions={provinceOptions}
                          />
                          <IconButton
                            label={`保存 ${student.name} 省份`}
                            icon={<Check size={14} />}
                            onClick={(event) => { event.stopPropagation(); provinceEditing.onSave(student); }}
                          />
                          <IconButton
                            label={`取消编辑 ${student.name} 省份`}
                            icon={<X size={14} />}
                            variant="ghost"
                            onClick={(event) => { event.stopPropagation(); provinceEditing.onCancel(); }}
                          />
                        </div>
                      ) : (
                        <span className="student-province-value">
                          {student.province || location.province || "未匹配"}
                          <button
                            type="button"
                            className="student-province-edit"
                            aria-label={`修改 ${student.name} 省份`}
                            title="修改省份（支持自定义省份名）"
                            onClick={(event) => { event.stopPropagation(); provinceEditing.onStart(student); }}
                          >
                            <Pencil size={11} aria-hidden />
                          </button>
                        </span>
                      )}
                    </td>
                    <td>
                      <div className="student-row__buttons">
                        <IconButton
                          label={`编辑 ${student.name}`}
                          icon={<Pencil size={14} />}
                          onClick={(event) => { event.stopPropagation(); editing.onStart(student); }}
                        />
                        <IconButton
                          label={`${isVisible ? "隐藏" : "显示"} ${student.name}`}
                          icon={isVisible ? <EyeOff size={14} /> : <Eye size={14} />}
                          onClick={(event) => { event.stopPropagation(); onToggleVisibility(student.id); }}
                        />
                        <IconButton
                          label={`删除 ${student.name}`}
                          icon={<Trash2 size={14} />}
                          variant="danger"
                          onClick={(event) => { event.stopPropagation(); if (confirmDelete(student)) onDeleteStudent(student.id); }}
                        />
                      </div>
                    </td>
                  </>
                )}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
