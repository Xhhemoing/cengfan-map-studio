import { type KeyboardEvent, useLayoutEffect, useRef, useState } from "react";
import { createEmptyStudentDraft, type StudentDraft } from "../lib/data-workspace";
import type { Student } from "../lib/project-data";

type StudentPatch = Partial<Pick<Student, "name" | "university" | "city" | "province" | "locationScope">>;

/** Keep the roster's replaced controls in one keyboard and focus session. */
export function useRosterEditSession(
  onUpdateStudent: (id: string, patch: StudentPatch) => void,
  onMessage: (message: string) => void,
) {
  const workspaceRef = useRef<HTMLDivElement>(null);
  const editingRowRef = useRef<HTMLTableRowElement | null>(null);
  const activeStudentIdRef = useRef<string | null>(null);
  const [editingStudentId, setEditingStudentId] = useState<string | null>(null);
  const [editingDraft, setEditingDraft] = useState<StudentDraft>(createEmptyStudentDraft());

  useLayoutEffect(() => {
    const row = editingRowRef.current;
    if (!row) return;
    if (editingStudentId) {
      row.querySelector<HTMLInputElement>("[data-roster-edit-name]")?.focus();
    } else {
      // Saving can remove a row from the current filter; keep focus in the roster.
      const target = row.isConnected
        ? row.querySelector<HTMLButtonElement>("[data-roster-edit-trigger]")
        : workspaceRef.current?.querySelector<HTMLInputElement>('input[aria-label="筛选学生"]');
      target?.focus();
      editingRowRef.current = null;
    }
  }, [editingStudentId]);

  const startEditing = (student: Student, row: HTMLTableRowElement | null) => {
    // Double-clicking an existing editor must not discard its unsaved draft.
    if (activeStudentIdRef.current === student.id) return;
    editingRowRef.current = row;
    activeStudentIdRef.current = student.id;
    setEditingStudentId(student.id);
    setEditingDraft({
      name: student.name,
      university: student.university,
      city: student.city,
      province: student.province ?? "",
      locationScope: student.locationScope ?? "china",
    });
  };

  const finishEditing = () => {
    activeStudentIdRef.current = null;
    setEditingStudentId(null);
    setEditingDraft(createEmptyStudentDraft());
  };

  const saveEditing = (student: Student) => {
    // A keyboard action and a generated button click can share the same render.
    if (activeStudentIdRef.current !== student.id) return;
    const next = {
      name: editingDraft.name.trim(),
      university: editingDraft.university.trim(),
      city: editingDraft.city.trim(),
      // An empty province restores city auto-matching.
      province: editingDraft.province?.trim() || undefined,
      locationScope: editingDraft.locationScope === "international" ? "international" as const : undefined,
    };
    if (!next.name || !next.university || !next.city) {
      onMessage("学生姓名、就读院校和城市不能为空");
      return;
    }
    activeStudentIdRef.current = null;
    onUpdateStudent(student.id, next);
    finishEditing();
    onMessage(`已更新 ${next.name}`);
  };

  const cancelEditing = () => {
    if (!activeStudentIdRef.current) return;
    finishEditing();
  };

  const handleEditingKeyDown = (event: KeyboardEvent<HTMLTableRowElement>, student: Student) => {
    if (event.defaultPrevented || event.nativeEvent.isComposing || event.keyCode === 229) return;
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    const target = event.target;
    // Suggestions consume their own confirmation and dismissal before the row.
    if (target instanceof HTMLInputElement && target.getAttribute("aria-expanded") === "true") return;
    if (event.key === "Enter" && target instanceof HTMLInputElement) {
      event.preventDefault();
      event.stopPropagation();
      saveEditing(student);
    } else if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      cancelEditing();
    }
  };

  return {
    workspaceRef,
    editingStudentId,
    editingDraft,
    setEditingDraft,
    startEditing,
    saveEditing,
    cancelEditing,
    handleEditingKeyDown,
  };
}
