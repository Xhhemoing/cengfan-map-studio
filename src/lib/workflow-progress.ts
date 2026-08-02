import { resolveStudentLocation } from "./student-data";
import type { ProjectDocument } from "./project-document";

/**
 * 制作流程步骤。每个步骤的“状态”只从现有 ProjectDocument 推导，
 * 不引入第二套项目数据；“是否访问过”等纯导航状态由 UI 层自行维护。
 */
export type WorkflowStepId = "roster" | "presentation" | "layout" | "local" | "export";

export type WorkflowStepStatus = "empty" | "ready" | "warning";

export interface WorkflowStepProgress {
  id: WorkflowStepId;
  status: WorkflowStepStatus;
  /** 当前步骤需要提示的数量信息。 */
  counts: {
    /** 学生总数。 */
    total: number;
    /** 国内去向但城市/省份未能匹配到地图的学生数。 */
    unresolved: number;
    /** 海外去向的学生数。 */
    international: number;
    /** 被隐藏的学生数。 */
    hidden: number;
  };
}

export interface WorkflowProgress {
  roster: WorkflowStepProgress;
  presentation: WorkflowStepProgress;
  layout: WorkflowStepProgress;
  local: WorkflowStepProgress;
  exportStep: WorkflowStepProgress;
}

export function countStudentWarnings(project: ProjectDocument): {
  total: number;
  unresolved: number;
  international: number;
  hidden: number;
} {
  let unresolved = 0;
  let international = 0;
  let hidden = 0;
  for (const student of project.students) {
    if (student.visibility === false) hidden += 1;
    if (student.locationScope === "international") {
      international += 1;
    } else if (resolveStudentLocation(student).status === "unresolved") {
      unresolved += 1;
    }
  }
  return { total: project.students.length, unresolved, international, hidden };
}

export function listStudentWarnings(project: ProjectDocument): {
  unresolvedStudents: Array<{ id: string; name: string; city: string }>;
  hiddenStudents: Array<{ id: string; name: string }>;
} {
  const unresolvedStudents: Array<{ id: string; name: string; city: string }> = [];
  const hiddenStudents: Array<{ id: string; name: string }> = [];
  for (const student of project.students) {
    if (student.visibility === false) hiddenStudents.push({ id: student.id, name: student.name });
    if (student.locationScope !== "international" && resolveStudentLocation(student).status === "unresolved") {
      unresolvedStudents.push({ id: student.id, name: student.name, city: student.city });
    }
  }
  return { unresolvedStudents, hiddenStudents };
}

export function computeWorkflowProgress(project: ProjectDocument): WorkflowProgress {
  const counts = countStudentWarnings(project);
  const hasStudents = project.students.length > 0;

  const rosterStatus: WorkflowStepStatus = !hasStudents
    ? "empty"
    : counts.unresolved > 0 || counts.hidden > 0
      ? "warning"
      : "ready";

  const presentationStatus: WorkflowStepStatus = !hasStudents
    ? "empty"
    : counts.unresolved > 0
      ? "warning"
      : "ready";

  const exportStatus: WorkflowStepStatus = !hasStudents
    ? "empty"
    : counts.unresolved > 0 || counts.hidden > 0
      ? "warning"
      : "ready";

  return {
    roster: { id: "roster", status: rosterStatus, counts },
    presentation: { id: "presentation", status: presentationStatus, counts },
    layout: { id: "layout", status: "ready", counts },
    local: { id: "local", status: "ready", counts },
    exportStep: { id: "export", status: exportStatus, counts },
  };
}
