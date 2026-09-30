import { expect, it, vi } from 'vitest';
import { flushSync } from 'react-dom';
import { AgentTaskPanel } from './AgentTaskPanel';
import { assistantProject, clickText, installAgentAssistantTestHarness, installResponses, mountAssistant, openAssistant, renderAssistant, setMessage } from './agent-assistant-test-harness';
import type { AgentTaskProgress } from '../lib/agent-task-progress';

installAgentAssistantTestHarness();
const task: AgentTaskProgress = { version: 1, phase: 'ready', unsupported: ['PNG export is manual'], steps: [
  { id: 'a', title: 'Resize <script>unsafe()</script>', tool: 'update_map', dependsOn: [], status: 'succeeded' },
  { id: 'b', title: 'Compact', tool: 'update_cards', dependsOn: ['a'], status: 'succeeded' },
] };
it('renders escaped, accessible plan evidence without claiming persistence', () => {
  const { container } = mountAssistant(<AgentTaskPanel task={task} status="completed" wholePlan />);
  expect(container.querySelector('[aria-live="polite"]')?.textContent).toContain('2/2');
  expect(container.querySelector('script')).toBeNull();
  expect(container.textContent).toContain('PNG export is manual');
  expect(container.querySelector('details')?.textContent).toContain('Resize');
});
it('requires whole-plan confirmation even when smart mode is selected', async () => {
  installResponses({ kind: 'tool-call', task: { ...task, phase: 'executing' }, calls: [
    { id: 'a', name: 'update_map', arguments: { patch: { scale: 0.8 } } },
    { id: 'b', name: 'update_cards', arguments: { patch: { preset: 'compact' } } },
  ], assistantMessage: { role: 'assistant', content: null } }, { kind: 'finish', summary: 'Ready', task });
  const { container, onCommit } = renderAssistant(assistantProject());
  openAssistant(container);
  const smart = container.querySelector<HTMLInputElement>('input[value="smart"]');
  expect(smart).not.toBeNull();
  flushSync(() => smart!.click());
  setMessage(container, 'Resize and compact');
  clickText(container, '开始规划');
  await vi.waitFor(() => expect(container.textContent).toContain('Ready'));
  expect(onCommit).not.toHaveBeenCalled();
  const boxes = Array.from(container.querySelectorAll<HTMLInputElement>('.agent-review-row input[type="checkbox"]'));
  expect(boxes.length).toBe(2);
  expect(boxes.every((box) => box.disabled)).toBe(true);
  clickText(container, '确认应用');
  expect(onCommit).toHaveBeenCalledTimes(1);
});
