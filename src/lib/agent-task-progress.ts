/** Display-only projection. It never authorizes a write and contains no tool arguments. */
export interface AgentTaskProgress {
  version: 1;
  phase: 'planning' | 'executing' | 'validating' | 'ready' | 'blocked';
  steps: Array<{ id: string; title: string; tool: string; dependsOn: string[]; status: 'pending' | 'running' | 'succeeded' }>;
  unsupported: string[];
}
const record = (value: unknown): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value);
const bounded = (value: unknown, limit: number): value is string => typeof value === 'string' && value.length <= limit;
export function parseTaskProgress(value: unknown): AgentTaskProgress | undefined {
  if (!record(value) || value.version !== 1 || !['planning', 'executing', 'validating', 'ready', 'blocked'].includes(String(value.phase)) ||
      !Array.isArray(value.steps) || value.steps.length > 12 || !Array.isArray(value.unsupported) || value.unsupported.length > 8 ||
      !value.unsupported.every((item) => bounded(item, 240))) return undefined;
  const ids = new Set<string>();
  const steps: AgentTaskProgress['steps'] = [];
  for (const step of value.steps) {
    if (!record(step) || !bounded(step.id, 40) || !/^[a-z][a-z0-9_-]*$/.test(step.id) || ids.has(step.id) ||
        !bounded(step.title, 120) || !bounded(step.tool, 64) || !Array.isArray(step.dependsOn) || step.dependsOn.length > 12 ||
        !step.dependsOn.every((id) => bounded(id, 40)) || !['pending', 'running', 'succeeded'].includes(String(step.status))) return undefined;
    ids.add(step.id);
    steps.push({ id: step.id, title: step.title, tool: step.tool, dependsOn: [...step.dependsOn] as string[], status: step.status as AgentTaskProgress['steps'][number]['status'] });
  }
  if (steps.some((step) => step.dependsOn.some((id) => !ids.has(id) || id === step.id))) return undefined;
  return { version: 1, phase: value.phase as AgentTaskProgress['phase'], steps, unsupported: [...value.unsupported] as string[] };
}
