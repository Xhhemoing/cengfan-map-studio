import { applyDataViewChange } from "./catalog-usage";
import { createId } from "./ids";
import type { DataViewId, MapTemplateId } from "./project-data";
import type { ProjectDocument, ProjectTransaction } from "./project-document";
import { createDefaultScene } from "./scene-document";
import { createSystemTemplate } from "./template-document";

export function createApplySystemTemplateTransaction(templateId: MapTemplateId): ProjectTransaction {
  const scene = createDefaultScene(templateId);
  return {
    id: createId(`tx-template-${templateId}`),
    label: `应用内置模板：${createSystemTemplate(templateId).name}`,
    source: "manual",
    apply: (current) => ({
      ...current,
      templateId,
      canvas: scene.canvas,
      map: scene.map,
      cards: scene.cards,
      textElements: scene.textElements,
      assetElements: scene.assetElements,
      style: {
        ...current.style,
        cardPreset: scene.cards.preset,
        mapScale: scene.map.scale,
        backgroundColor: scene.canvas.backgroundColor,
        visibleFields: [...scene.cards.visibleFields],
      },
    }),
  };
}

export type StudentEditPatch = Partial<Pick<ProjectDocument["students"][number], "name" | "university" | "city" | "province" | "locationScope">>;

export function createDataViewTransaction(view: DataViewId): ProjectTransaction {
  return {
    id: createId(`tx-data-view-${view}`),
    label: `切换数据呈现：${view}`,
    source: "manual",
    apply: (current) => applyDataViewChange(current, view),
  };
}

export function createAppendStudentsTransaction(records: ProjectDocument["students"]): ProjectTransaction {
  return {
    id: createId("tx-append"),
    label: `追加 ${records.length} 名学生`,
    source: "import",
    apply: (current) => ({ ...current, students: [...current.students, ...records] }),
  };
}

export function createReplaceStudentsTransaction(records: ProjectDocument["students"]): ProjectTransaction {
  return {
    id: createId("tx-replace"),
    label: `替换为 ${records.length} 名学生`,
    source: "import",
    apply: (current) => ({ ...current, students: records }),
  };
}

export function createStudentUpdateTransaction(id: string, patch: StudentEditPatch): ProjectTransaction {
  return {
    id: createId(`tx-student-update-${id}`),
    label: "编辑学生记录",
    source: "manual",
    apply: (current) => ({
      ...current,
      students: current.students.map((student) => {
        if (student.id !== id) return student;
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
      }),
    }),
  };
}

export function createStudentVisibilityToggleTransaction(id: string): ProjectTransaction {
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

export function createStudentDeleteTransaction(id: string): ProjectTransaction {
  return {
    id: createId(`tx-student-delete-${id}`),
    label: "删除学生记录",
    source: "manual",
    apply: (current) => ({ ...current, students: current.students.filter((student) => student.id !== id) }),
  };
}

export function createStudentsVisibilityTransaction(visibility: boolean): ProjectTransaction {
  return {
    id: createId(`tx-students-visibility-${visibility}`),
    label: visibility ? "全部显示学生" : "全部隐藏学生",
    source: "manual",
    apply: (current) => ({ ...current, students: current.students.map((student) => ({ ...student, visibility })) }),
  };
}
