import { applyDataViewChange } from "./catalog-usage";
import { duplicateStudentIds } from "./data-duplicate";
import type { StudioAsset } from "./assets";
import type { ProjectDocument } from "./project-document";
import type { DataViewId, Student } from "./project-data";
import type { AgentToolCall } from "./agent-risk";
import { validateAgentCall } from "./agent-tool-contract";
import { constrainAgentCall, unchangedTaskFacts, type AgentTaskContext } from "./agent-task-constraints";
import { executeAgentLayoutTool, type AgentToolExecution } from "./agent-layout-tools";
import { executeAgentSceneTool } from "./agent-scene-tools";
import { describeActualPatch, patchFeedback } from "./agent-scene-inspection";

export interface AgentExecutionContext extends AgentTaskContext { assets?: StudioAsset[] }

function executeDataTool(project: ProjectDocument, call: AgentToolCall): AgentToolExecution | null {
  const args = call.arguments;
  if (call.name === "set_data_view") {
    const next = applyDataViewChange(project, String(args.view) as DataViewId);
    const diff = describeActualPatch({ dataView: project.dataView, grouping: project.cards.grouping }, { dataView: next.dataView, grouping: next.cards.grouping }, { dataView: args.view, grouping: next.cards.grouping }, "project");
    const feedback = patchFeedback(next, diff);
    return { project: feedback.noop ? project : next, payload: { ok: true, view: args.view, ...feedback } };
  }
  if (call.name !== "manage_students") return null;
  if (args.action === "remove_duplicate") {
    const duplicates = duplicateStudentIds(project.students);
    const seen = new Set<string>();
    const students = project.students.filter(student => {
      const key = `${student.name}\u001f${student.university}\u001f${student.city}`;
      if (!duplicates.has(student.id)) return true;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    const removed = project.students.length - students.length;
    return { project: removed ? { ...project, students } : project, payload: { ok: true, removed, noop: removed === 0, diff: [{ path: "students.count", before: project.students.length, after: students.length, normalized: false }] } };
  }
  const matches = project.students.filter(student => args.studentId ? student.id === args.studentId : typeof args.name === "string" && student.name === args.name.trim());
  if (matches.length !== 1) return { project, payload: { ok: false, code: matches.length ? "AMBIGUOUS_TARGET" : "SCENE_TARGET_MISSING", message: matches.length ? "有多位同名学生，请明确 studentId 后再修改。" : "找不到指定学生。" } };
  const student = matches[0]!;
  const patch: Partial<Student> = args.action === "update_fact" ? args.fields as Partial<Student> : { visibility: args.action === "show" };
  const updated = { ...student, ...patch };
  const diff = describeActualPatch(student as unknown as Record<string, unknown>, updated as unknown as Record<string, unknown>, patch, `students[${student.id}]`);
  const next = { ...project, students: project.students.map(item => item.id === student.id ? updated : item) };
  const feedback = patchFeedback(next, diff);
  return { project: feedback.noop ? project : next, payload: { ok: true, studentId: student.id, ...feedback } };
}

export function executeAgentTool(project: ProjectDocument, original: AgentToolCall, context: AgentExecutionContext): AgentToolExecution {
  const invalid = validateAgentCall(original);
  if (invalid) return { project, payload: invalid };
  const constrained = constrainAgentCall(project, original, context);
  if ("code" in constrained) return { project, payload: { ...constrained } };
  const call = constrained;
  if (call.name === "find_assets") {
    const province = String(call.arguments.province ?? "").trim();
    const keyword = String(call.arguments.keyword ?? "").trim().toLocaleLowerCase("zh-CN");
    const assets = (context.assets ?? []).filter(asset => (!province || asset.provinceIds.some(id => id.includes(province) || province.includes(id.replace(/省|市|自治区|壮族自治区|回族自治区|维吾尔自治区/g, "")))) && (!keyword || asset.label.toLocaleLowerCase("zh-CN").includes(keyword)))
      .map(({ id, label, kind, provinceIds, source }) => ({ id, label, kind, provinceIds, source }));
    return { project, payload: { ok: true, assets } };
  }
  const outcome = executeAgentLayoutTool(project, call, context) ?? executeAgentSceneTool(project, call, context) ?? executeDataTool(project, call);
  if (!outcome) return { project, payload: { ok: false, code: "UNKNOWN_TOOL", message: `未知工具 ${call.name}` } };
  if (outcome.payload.ok === false) return { project, payload: outcome.payload };
  const violation = unchangedTaskFacts(project, outcome.project, context);
  return violation ? { project, payload: { ...violation } } : outcome;
}
