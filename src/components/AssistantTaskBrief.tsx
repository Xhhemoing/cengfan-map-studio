import { TASK_GOALS, TASK_PRESERVES, taskSelectionLabel, type AgentTaskBrief } from "../lib/agent-task-brief";
import type { SceneSelection } from "../lib/scene-document";

export function AssistantTaskBrief({ brief, selection, disabled, onChange }: {
  brief: AgentTaskBrief;
  selection?: SceneSelection;
  disabled: boolean;
  onChange: (brief: AgentTaskBrief) => void;
}) {
  return <details className="assistant-task-brief">
    <summary>任务目标 · {TASK_GOALS[brief.goal]} · {brief.scope === "project" ? "整个项目" : taskSelectionLabel(brief.selection)}{brief.preserve.length > 0 ? ` · ${brief.preserve.map((key) => TASK_PRESERVES[key]).join("、")}` : ""}</summary>
    <label>优化目标<select aria-label="任务优化目标" value={brief.goal} disabled={disabled} onChange={(event) => onChange({ ...brief, goal: event.target.value as AgentTaskBrief["goal"] })}>
      {Object.entries(TASK_GOALS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
    </select></label>
    <label>调整范围<select aria-label="任务调整范围" value={brief.scope} disabled={disabled} onChange={(event) => onChange({ ...brief, scope: event.target.value as AgentTaskBrief["scope"], selection: event.target.value === "selection" ? selection ?? null : null })}>
      <option value="project">整个项目</option><option value="selection" disabled={!selection}>当前选区</option>
    </select></label>
    {brief.scope === "selection" && <p>{taskSelectionLabel(brief.selection)}<button type="button" disabled={disabled || !selection} onClick={() => onChange({ ...brief, selection: selection ?? null })}>使用当前选区</button></p>}
    <div className="assistant-task-preserves" role="group" aria-label="任务保留约束">
      {Object.entries(TASK_PRESERVES).map(([key, label]) => <button key={key} type="button" aria-pressed={brief.preserve.includes(key as AgentTaskBrief["preserve"][number])} disabled={disabled} onClick={() => onChange({ ...brief, preserve: brief.preserve.includes(key as AgentTaskBrief["preserve"][number]) ? brief.preserve.filter((item) => item !== key) : [...brief.preserve, key as AgentTaskBrief["preserve"][number]] })}>{label}</button>)}
    </div>
  </details>;
}
