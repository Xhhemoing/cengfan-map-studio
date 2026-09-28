import { flushSync } from "react-dom";
import type { DataViewId, Student } from "./project-data";
import type { ProjectTransaction } from "./project-document";
import { importDiffTransaction, rosterKey, type ApplyImportDiff } from "./import-diff";
import {
  appendStudentsTransaction, changeDataViewTransaction, deleteStudentTransaction,
  replaceStudentsTransaction, setStudentsVisibilityTransaction, toggleStudentVisibilityTransaction,
  updateStudentTransaction, type StudentPatch,
} from "./student-transactions";

/** Student event actions share the editor's existing transaction/save/undo path. */
export function createEditorStudentActions(deps: {
  students: Student[];
  canEdit: boolean;
  commit: (transaction: ProjectTransaction) => void;
}) {
  const onApplyImportDiff: ApplyImportDiff = (plan) => {
    if (!deps.canEdit) return "readonly";
    if (rosterKey(deps.students) !== plan.baseKey) return "stale";
    if (rosterKey(plan.students) === plan.baseKey) return "unchanged";
    const tx = importDiffTransaction(plan);
    const receipt: { result: ReturnType<ApplyImportDiff> } = { result: "stale" };
    // Only called by the explicit confirm event, never render/effects. Flush this
    // rare bulk operation so the UI acknowledges the actual guarded commit, not
    // merely its submission. Replayed React updaters assign the same local receipt.
    flushSync(() => deps.commit({
      ...tx,
      apply: (current) => {
        const next = tx.apply(current);
        receipt.result = next === current ? "stale" : "applied";
        return next;
      },
    }));
    return receipt.result;
  };
  return {
    onChangeDataView: (view: DataViewId) => deps.commit(changeDataViewTransaction(view)),
    onAppendStudents: (records: Student[]) => deps.commit(appendStudentsTransaction(records)),
    onReplaceStudents: (records: Student[]) => deps.commit(replaceStudentsTransaction(records)),
    onUpdateStudent: (id: string, patch: StudentPatch) => deps.commit(updateStudentTransaction(id, patch)),
    onToggleVisibility: (id: string) => deps.commit(toggleStudentVisibilityTransaction(id)),
    onDeleteStudent: (id: string) => deps.commit(deleteStudentTransaction(id)),
    onSetStudentsVisibility: (visibility: boolean) => deps.commit(setStudentsVisibilityTransaction(visibility)),
    onApplyImportDiff,
  };
}
