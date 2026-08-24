import { Plus } from "lucide-react";
import {
  applyUniversityAutoLocation,
  updateStudentDraft,
  type StudentDraft,
} from "../lib/data-workspace";
import { SearchCombobox } from "./SearchCombobox";
import { ActionButton } from "./StudioUi";
import { cityOptions, provinceOptions, universityOptions } from "./data-workspace-fields";

/**
 * "新增学生" form of the data workspace. Collapsible in the compact roster
 * layout; the parent owns the draft so an in-progress record survives
 * re-renders of the surrounding panels.
 */
export function DataWorkspaceDraftForm({
  draft,
  onChangeDraft,
  onAddStudent,
  collapsible,
  expanded,
  onToggleExpanded,
}: {
  draft: StudentDraft;
  onChangeDraft: (draft: StudentDraft) => void;
  onAddStudent: () => void;
  collapsible: boolean;
  expanded: boolean;
  onToggleExpanded: () => void;
}) {
  const isInternational = draft.locationScope === "international";

  return (
    <section className="data-workspace__new-student">
      {collapsible && (
        <button
          type="button"
          className="data-workspace__section-toggle"
          aria-label={expanded ? "收起新增学生" : "展开新增学生"}
          aria-expanded={expanded}
          onClick={onToggleExpanded}
        >
          <Plus size={15} aria-hidden />
          <span>新增学生</span>
        </button>
      )}
      {expanded && (
        <div className="draft-form">
          <label>
            去向类型
            <select
              aria-label="新增学生去向类型"
              value={draft.locationScope ?? "china"}
              onChange={(event) => onChangeDraft(updateStudentDraft(draft, "locationScope", event.target.value))}
            >
              <option value="china">中国去向</option>
              <option value="international">海外去向</option>
            </select>
          </label>
          <label>
            学生名称
            <input
              value={draft.name}
              onChange={(event) => onChangeDraft(updateStudentDraft(draft, "name", event.target.value))}
              placeholder="林舟"
            />
          </label>
          <label>
            就读院校
            <SearchCombobox
              label="就读院校"
              value={draft.university}
              onChange={(value) => onChangeDraft(applyUniversityAutoLocation(draft, value))}
              placeholder="北京大学"
              searchOptions={universityOptions}
            />
          </label>
          <label>
            {isInternational ? "国家/地区与城市" : "城市"}
            <SearchCombobox
              label="城市"
              value={draft.city}
              allowFreeInput
              onChange={(value) => onChangeDraft(updateStudentDraft(draft, "city", value))}
              placeholder={isInternational ? "美国·波士顿" : "北京"}
              searchOptions={isInternational ? () => [] : cityOptions}
            />
          </label>
          {/* Overseas destinations have no Chinese province, so the field is dropped entirely. */}
          {!isInternational && (
            <label>
              省份
              <SearchCombobox
                label="新增省份"
                value={draft.province ?? ""}
                allowFreeInput
                onChange={(value) => onChangeDraft(updateStudentDraft(draft, "province", value))}
                placeholder="浙江省"
                searchOptions={provinceOptions}
              />
            </label>
          )}
          <ActionButton onClick={onAddStudent}>
            <Plus size={16} /> 新增学生
          </ActionButton>
        </div>
      )}
    </section>
  );
}
