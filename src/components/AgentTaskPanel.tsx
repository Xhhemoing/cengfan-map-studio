import type { AgentTaskProgress } from '../lib/agent-task-progress';
import './agent-task-panel.css';

type Props = {
  task?: AgentTaskProgress;
  status: 'draft' | 'running' | 'completed' | 'failed' | 'cancelled' | 'applied';
  wholePlan: boolean;
};
const PHASES: Record<AgentTaskProgress['phase'], string> = {
  planning: '读取工程并规划', executing: '正在生成影子预览',
  validating: '正在检查布局', ready: '预览就绪，待确认应用', blocked: '任务受阻，未自动应用',
};
const STEPS = { pending: '待执行', running: '执行中', succeeded: '工具回执成功' };
export function AgentTaskPanel({ task, status, wholePlan }: Props) {
  if (!task && !wholePlan) return null;
  const completed = task?.steps.filter((step) => step.status === 'succeeded').length ?? 0;
  const label = status === 'applied' ? '已应用到工程' : status === 'cancelled' ? '已取消，未应用' :
    status === 'failed' ? PHASES.blocked : task ? PHASES[task.phase] : '已恢复整体预览，请重新审阅';
  return (
    <section className="agent-task-panel" aria-label="AI 任务进度">
      <strong>任务计划</strong>
      <p role="status" aria-live="polite">{label}{task ? ` (${completed}/${task.steps.length})` : ''}</p>
      {task && task.steps.length > 0 && <ol>
        {task.steps.map((step) => <li key={step.id} data-step-status={step.status}>
          <span>{step.title}</span><small>{(status === 'failed' || status === 'cancelled') && step.status === 'running' ? '已停止' : STEPS[step.status]}</small>
          {step.dependsOn.length > 0 && <details><summary>前置步骤</summary>
            <p>{step.dependsOn.map((id) => task.steps.find((item) => item.id === id)?.title ?? id).join('、')}</p>
          </details>}
        </li>)}
      </ol>}
      {task && task.unsupported.length > 0 && <div><strong>未自动执行</strong><ul>{task.unsupported.map((item, index) => <li key={index}>{item}</li>)}</ul></div>}
      <p className="panel-note">{status === 'applied' ? '保存与导出状态请查看工程和交付界面。' : '预览不等于已应用、已保存或已导出。'}</p>
      {wholePlan && status !== 'applied' && <p className="panel-note">依赖计划需整体确认，不支持单独勾选后续步骤。</p>}
    </section>
  );
}
