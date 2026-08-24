import { Eye, EyeOff, FilterX, X } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { flushSync } from "react-dom";
import {
  confirmImportCandidates,
  createEmptyStudentDraft,
  type StudentDraft,
} from "../lib/data-workspace";
import { requestAiParseData, type ParseDataResult } from "../lib/ai-client";
import type { DataViewId, Student } from "../lib/project-data";
import { resolveStudentLocation } from "../lib/student-data";
import { ActionGroup, CompactButton, PanelHeader, SegmentedControl } from "./StudioUi";
import { DataWorkspaceDraftForm } from "./data-workspace-draft-form";
import { focusStudentRow } from "./data-workspace-fields";
import { DataWorkspaceImportPanel } from "./data-workspace-import-panel";
import { useRosterImport } from "./data-workspace-import-state";
import { DataWorkspaceStudentTable } from "./data-workspace-student-table";

/**
 * Composer of the student data workspace: owns roster editing state (draft,
 * inline edits, filter) and lays out the draft form, the import panel and the
 * roster table. Import ingest lives in `useRosterImport`, and the panels are
 * presentational siblings in `data-workspace-*.tsx`.
 */
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
  const [showImport, setShowImport] = useState(!compactRosterControls);
  const [showNewStudent, setShowNewStudent] = useState(!compactRosterControls);
  const rosterRef = useRef<HTMLDivElement>(null);

  const roster = useRosterImport({
    students,
    onAppendStudents,
    onReplaceStudents,
    requestAiParse,
    confirmReplace,
    onMessage: setMessage,
  });

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

  /**
   * The record a 定位 action selected exists, but the roster filter is keeping
   * its row out of the table. Saying so beats a 定位 button that looks broken.
   */
  const selectionHiddenByFilter = useMemo(() => {
    if (!selectedStudentId || !filter.trim()) return null;
    if (filteredStudents.some((student) => student.id === selectedStudentId)) return null;
    return students.find((student) => student.id === selectedStudentId) ?? null;
  }, [filter, filteredStudents, selectedStudentId, students]);

  // The row only exists once the cleared filter is on screen, so the render is
  // flushed before focus moves onto it.
  const revealFilteredSelection = (id: string) => {
    flushSync(() => setFilter(""));
    focusStudentRow(id, rosterRef.current ?? document);
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

  return (
    <div className={`data-workspace${compactRosterControls ? " data-workspace--roster" : ""}`} ref={rosterRef}>
      <PanelHeader title="学生数据中心" meta={`${visibleCount} 显示 / ${students.length} 条`} />

      {!hideDataExpression && (
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
      )}

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

      <DataWorkspaceDraftForm
        draft={draft}
        onChangeDraft={setDraft}
        onAddStudent={addDraftStudent}
        collapsible={compactRosterControls}
        expanded={showNewStudent}
        onToggleExpanded={() => setShowNewStudent((current) => !current)}
      />

      <DataWorkspaceImportPanel
        importText={roster.importText}
        onChangeImportText={roster.setImportText}
        expanded={showImport}
        onToggleExpanded={() => setShowImport((current) => !current)}
        isAiParsing={roster.isAiParsing}
        onParseText={roster.parseText}
        onParseOcrText={roster.parseOcrText}
        onParseWithAi={() => { void roster.parseWithAi(); }}
        onPasteHtmlTable={roster.pasteHtmlTable}
        onImportDirectly={() => { void roster.importDirectly(); }}
        onSelectWorkbook={(file) => { void roster.selectWorkbook(file); }}
        onDownloadTemplate={() => { void roster.downloadTemplate(); }}
        hideTemplateDownload={hideTemplateDownload}
        excelRecognition={roster.excelRecognition}
        reviewRows={roster.reviewRows}
        onToggleReviewRow={roster.toggleReviewRow}
        candidateSummary={roster.candidateSummary}
        unparsedCount={roster.unparsedCount}
        unparsedRows={roster.unparsedRows}
        onApplyImport={roster.applyImport}
      />

      {roster.replaceConfirmation && (
        <p className="panel-note data-message">
          替换摘要：当前 {roster.replaceConfirmation.currentCount} 条，新 {roster.replaceConfirmation.nextCount} 条
        </p>
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

      {selectionHiddenByFilter && (
        <p className="panel-note data-message" role="status" data-filtered-selection={selectionHiddenByFilter.id}>
          <span>「{selectionHiddenByFilter.name || "未命名学生"}」不在当前筛选「{filter.trim()}」的结果里，名单表没有显示这一行。</span>
          <CompactButton
            variant="secondary"
            icon={<FilterX size={14} aria-hidden />}
            aria-label={`清空筛选并显示 ${selectionHiddenByFilter.name || "未命名学生"}`}
            data-reveal-filtered-selection={selectionHiddenByFilter.id}
            onClick={() => revealFilteredSelection(selectionHiddenByFilter.id)}
          >
            清空筛选并显示
          </CompactButton>
        </p>
      )}

      <DataWorkspaceStudentTable
        students={filteredStudents}
        selectedStudentId={selectedStudentId}
        onSelectStudent={onSelectStudent}
        onToggleVisibility={onToggleVisibility}
        onDeleteStudent={onDeleteStudent}
        confirmDelete={confirmDelete}
        editing={{
          studentId: editingStudentId,
          draft: editingDraft,
          onChangeDraft: setEditingDraft,
          onStart: startEditing,
          onSave: saveEditing,
          onCancel: () => setEditingStudentId(null),
        }}
        provinceEditing={{
          studentId: provinceEditingId,
          draft: provinceDraft,
          onChangeDraft: setProvinceDraft,
          onStart: (student) => {
            setProvinceDraft(student.province ?? "");
            setProvinceEditingId(student.id);
          },
          onSave: (student) => {
            onUpdateStudent(student.id, { province: provinceDraft.trim() || undefined });
            setProvinceEditingId(null);
            setProvinceDraft("");
          },
          onCancel: () => {
            setProvinceEditingId(null);
            setProvinceDraft("");
          },
        }}
      />
    </div>
  );
}
