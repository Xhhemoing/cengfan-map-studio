import { describe, expect, it } from 'vitest';
import { SCENE_DOMAIN_PROPS, SCENE_SCHEMAS, validateScenePatch } from './agent-scene-contract';
import * as serverContract from '../../server/ai/patch-validator';
import { AgentSession } from './agent-session';
import { createProjectDocument } from './project-document';
import { parseTaskProgress } from './agent-task-progress';

describe('shared scene value contract', () => {
  it('uses the same schemas, property lists and validation on both sides', () => {
    expect(serverContract.SCENE_SCHEMAS).toBe(SCENE_SCHEMAS);
    expect(serverContract.validateScenePatch).toBe(validateScenePatch);
    for (const [domain, schema] of Object.entries(SCENE_SCHEMAS)) {
      expect(SCENE_DOMAIN_PROPS[domain as keyof typeof SCENE_SCHEMAS]).toEqual(Object.keys(schema));
    }
  });
  it.each([
    ['map', { scale: 'banana' }], ['map', { scale: NaN }], ['map', { width: 0 }],
    ['map', { opacity: 2 }], ['map', { renderSource: { kind: 'image', src: 'x' } }],
    ['cards', { fontSize: -1 }], ['cards', { columns: 1.5 }], ['cards', { preset: 'invented' }],
    ['cards', { positions: {} }], ['cards', { fieldTypography: { name: { fontSize: '12' } } }],
    ['text', { id: 'new' }], ['asset', { src: 'x' }], ['canvas', { width: Infinity }],
    ['province', { appearance: { kind: 'manual-color', color: 42 } }],
    ['map', JSON.parse('{"__proto__":{"polluted":true}}')], ['map', null], ['map', []],
  ])('rejects %s invalid values', (domain, patch) => {
    expect(validateScenePatch(domain as keyof typeof SCENE_SCHEMAS, patch).ok).toBe(false);
  });
  it('accepts existing supported fields and well-formed nested patches', () => {
    expect(validateScenePatch('map', { scale: 0.8, mapBoundaryMargin: 24 }).ok).toBe(true);
    expect(validateScenePatch('cards', { preset: 'compact', columns: 'auto', fieldTypography: { name: { fontSize: 16 } } }).ok).toBe(true);
    expect(validateScenePatch('province', { appearance: { kind: 'manual-color', color: '#ffffff' } }).ok).toBe(true);
  });
  it('rejects malformed replay without damaging its source project', () => {
    const project = createProjectDocument({ students: [], templateId: 'original', dataView: 'province' });
    const before = project.map.scale;
    const snapshot = new AgentSession(project, { mode: 'conservative' }).exportSnapshot();
    snapshot.steps = [{ id: 'bad', name: 'update_map', arguments: { patch: { scale: 'banana' } }, risk: 'low' }];
    expect(() => AgentSession.restore(project, snapshot, { mode: 'conservative' })).toThrow();
    expect(project.map.scale).toBe(before);
  });
  it('limits and strips display metadata instead of propagating tool arguments', () => {
    const value = { version: 1, phase: 'executing', steps: [{ id: 'a', title: 'Resize', tool: 'update_map', dependsOn: [], status: 'running', arguments: { secret: 'do not display' } }], unsupported: ['export'] };
    expect(JSON.stringify(parseTaskProgress(value))).not.toContain('secret');
    expect(parseTaskProgress({ ...value, steps: [value.steps[0], value.steps[0]] })).toBeUndefined();
    expect(parseTaskProgress({ ...value, steps: [{ ...value.steps[0], dependsOn: ['missing'] }] })).toBeUndefined();
  });
});
