import { applyDataViewChange } from "./catalog-usage";
import { createId } from "./ids";
import type { ProjectDocument, ProjectTransaction } from "./project-document";
import type { DataViewId, Student } from "./project-data";

/** 名单编辑面板能改的字段。地区字段允许被清空,所以补丁值可能是 undefined。 */
export type StudentPatch = Partial<Pick<Student, "name" | "university" | "city" | "province" | "locationScope">>;

export function changeDataViewTransaction(view: DataViewId): ProjectTransaction {
  return {
    id: createId(`tx-data-view-${view}`),
    label: `切换数据呈现：${view}`,
    source: "manual",
    apply: (current) => applyDataViewChange(current, view),
  };
}

export function appendStudentsTransaction(records: Student[]): ProjectTransaction {
  return {
    id: createId("tx-append"),
    label: `追加 ${records.length} 名学生`,
    source: "import",
    apply: (current) => ({ ...current, students: [...current.students, ...records] }),
  };
}

export function replaceStudentsTransaction(records: Student[]): ProjectTransaction {
  return {
    id: createId("tx-replace"),
    label: `替换为 ${records.length} 名学生`,
    source: "import",
    apply: (current) => ({ ...current, students: records }),
  };
}

/**
 * 清空地区字段要真的把键删掉,而不是留一个 undefined:留着的话导出与省份汇总仍会把
 * 这名学生算进那个省。
 */
export function applyStudentPatch(student: Student, patch: StudentPatch): Student {
  const next = { ...student, ...patch };
  if ("province" in patch && !patch.province) {
    const { province: _cleared, ...withoutProvince } = next;
    if ("locationScope" in patch && !patch.locationScope) {
      const { locationScope: _locationScope, ...withoutLocationScope } = withoutProvince;
      return withoutLocationScope;
    }
    return withoutProvince;
  }
  if ("locationScope" in patch && !patch.locationScope) {
    const { locationScope: _cleared, ...rest } = next;
    return rest;
  }
  return next;
}

export function updateStudentTransaction(id: string, patch: StudentPatch): ProjectTransaction {
  return {
    id: createId(`tx-student-update-${id}`),
    label: "编辑学生记录",
    source: "manual",
    apply: (current: ProjectDocument) => ({
      ...current,
      students: current.students.map((student) => student.id === id ? applyStudentPatch(student, patch) : student),
    }),
  };
}

export function toggleStudentVisibilityTransaction(id: string): ProjectTransaction {
  return {
    id: createId(`tx-student-visibility-${id}`),
    label: "切换学生显示状态",
    source: "manual",
    apply: (current) => ({
      ...current,
      students: current.students.map((student) => student.id === id ? { ...student, visibility: student.visibility === false } : student),
    }),
  };
}

export function deleteStudentTransaction(id: string): ProjectTransaction {
  return {
    id: createId(`tx-student-delete-${id}`),
    label: "删除学生记录",
    source: "manual",
    apply: (current) => ({ ...current, students: current.students.filter((student) => student.id !== id) }),
  };
}

export function setStudentsVisibilityTransaction(visibility: boolean): ProjectTransaction {
  return {
    id: createId(`tx-students-visibility-${visibility}`),
    label: visibility ? "全部显示学生" : "全部隐藏学生",
    source: "manual",
    apply: (current) => ({ ...current, students: current.students.map((student) => ({ ...student, visibility })) }),
  };
}
