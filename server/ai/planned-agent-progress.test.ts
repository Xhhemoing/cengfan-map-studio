// @vitest-environment node
import { afterEach, expect, it, vi } from 'vitest';
import { createPlannedAgent } from './planned-agent';
import { generateTaskPlan } from './task-planner';
import type { ChatMessage } from './agent-types';
vi.mock('./task-planner', () => ({ generateTaskPlan: vi.fn() }));
afterEach(() => vi.resetAllMocks());
const config = { primary: { baseUrl: 'https://example.invalid', model: 'test', apiKey: 'fictional', maxTokens: 4000, timeoutMs: 1000 } };
it('projects each phase without arguments, and only marks ready after a clean health receipt', async () => {
  vi.mocked(generateTaskPlan).mockResolvedValue({ ok: true, chargedTokens: 1, plan: { version: 1, unsupported: ['export'], steps: [
    { id: 'resize', title: 'Resize map', tool: 'update_map', arguments: { patch: { scale: 0.8 } }, dependsOn: [] },
  ] } });
  const run = createPlannedAgent(config);
  const messages: ChatMessage[] = [];
  const request = () => ({ userMessage: 'Resize then export', digest: {}, messages, taskId: 'task-progress' });
  const consume = (outcome: Awaited<ReturnType<typeof run>>, result: Record<string, unknown>) => {
    if (outcome.kind !== 'tool-call') throw new Error('Expected tool calls');
    messages.push(outcome.assistantMessage);
    for (const call of outcome.calls) messages.push({ role: 'tool', tool_call_id: call.id, content: JSON.stringify(result) });
  };
  const preflight = await run(request());
  expect(preflight.task?.phase).toBe('planning');
  consume(preflight, { ok: true, value: {} });
  const write = await run(request());
  expect(write.task?.phase).toBe('executing');
  expect(write.task?.steps[0]?.status).toBe('running');
  expect(JSON.stringify(write.task)).not.toContain('arguments');
  consume(write, { ok: true });
  const health = await run(request());
  expect(health.task?.phase).toBe('validating');
  consume(health, { ok: true, issues: [] });
  const finish = await run(request());
  expect(finish.kind).toBe('finish');
  expect(finish.task).toMatchObject({ phase: 'ready', unsupported: ['export'], steps: [{ status: 'succeeded' }] });
});
