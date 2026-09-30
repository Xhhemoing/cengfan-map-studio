import { afterEach, describe, expect, it, vi } from 'vitest';
import { AgentSession } from './agent-session';
import { createProjectDocument } from './project-document';
import { response } from './agent-session-test-fixtures';
import type { AgentTaskProgress } from './agent-task-progress';

const task = (phase: AgentTaskProgress['phase']): AgentTaskProgress => ({ version: 1, phase, unsupported: ['Export is manual'], steps: [
  { id: 'a', title: 'Resize', tool: 'update_map', dependsOn: [], status: phase === 'ready' ? 'succeeded' : 'running' },
  { id: 'b', title: 'Compact', tool: 'update_cards', dependsOn: ['a'], status: phase === 'ready' ? 'succeeded' : 'pending' },
] });
const writes = { kind: 'tool-call', task: task('executing'), calls: [
  { id: 'a', name: 'update_map', arguments: { patch: { scale: 0.8 } } },
  { id: 'b', name: 'update_cards', arguments: { patch: { preset: 'compact' } } },
], assistantMessage: { role: 'assistant', content: null } };
function setup(final: unknown) {
  const project = createProjectDocument({ students: [], templateId: 'original', dataView: 'province' });
  vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce(response(writes)).mockResolvedValueOnce(response(final)));
  return { project, session: new AgentSession(project, { mode: 'smart' }) };
}
afterEach(() => vi.unstubAllGlobals());
describe('whole-plan application boundary', () => {
  it('requires explicit complete-plan application and keeps grouping after snapshot restore', async () => {
    const { project, session } = setup({ kind: 'finish', summary: 'Ready', task: task('ready') });
    const before = project.map.scale;
    expect((await session.run('Resize and compact')).kind).toBe('finish');
    expect(project.map.scale).toBe(before);
    expect(session.requiresWholePlan).toBe(true);
    expect(session.landingPreview().needsConfirmation).toBe(true);
    expect(session.transactionForSteps(new Set(['b']))).toBeNull();
    expect(session.transactionForSteps(new Set(['a', 'b']))!.apply(project).map.scale).toBe(0.8);
    const display = session.taskProgress!; display.steps.length = 0;
    expect(session.taskProgress!.steps).toHaveLength(2);
    const snapshot = session.exportSnapshot();
    expect(snapshot.applicationPolicy).toBe('whole-plan');
    const restored = AgentSession.restore(project, snapshot, { mode: 'smart' });
    expect(restored.transactionForSteps(new Set(['a']))).toBeNull();
    expect(restored.landingPreview().needsConfirmation).toBe(true);
    expect(() => AgentSession.restore(project, { ...snapshot, applicationPolicy: 'anything' } as never, { mode: 'smart' })).toThrow();
  });
  it.each([
    { kind: 'finish', summary: 'Unverified' },
    { kind: 'finish', task: task('validating') },
    { kind: 'failed', error: 'Blocked', task: task('blocked') },
  ])('does not apply an unfinished or unverified plan', async (final) => {
    const { project, session } = setup(final);
    expect((await session.run('Resize and compact')).kind).toBe('failed');
    expect(session.transactionForSteps(new Set(['a', 'b']))).toBeNull();
    expect(session.transaction().apply(project)).toBe(project);
  });
  it('does not turn the browser round limit into whole-plan completion', async () => {
    const { project, session } = setup({});
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response({ ...writes, calls: [], task: task('executing') })));
    expect((await session.run('Long running')).kind).toBe('failed');
    expect(session.transaction().apply(project)).toBe(project);
    expect(session.exportSnapshot().completed).toBe(false);
  });
});
