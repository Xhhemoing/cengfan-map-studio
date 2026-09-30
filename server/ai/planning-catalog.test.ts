// @vitest-environment node
import { expect, it } from 'vitest';
import { buildPlanningCatalog } from './planning-catalog';
import { buildCapabilityCatalog } from './capability-catalog';
it('deduplicates schema data while retaining every original value constraint', () => {
  const packed = buildPlanningCatalog();
  const full = buildCapabilityCatalog();
  const resolve = (value: unknown): unknown => {
    if (Array.isArray(value)) return value.map(resolve);
    if (value && typeof value === 'object') {
      const record = value as Record<string, unknown>;
      if (typeof record.$ref === 'string') return resolve(packed.$defs[record.$ref.slice('#/$defs/'.length)]);
      return Object.fromEntries(Object.entries(record).map(([key, child]) => [key, resolve(child)]));
    }
    return value;
  };
  expect(resolve(packed.sceneSchemas)).toEqual(full.sceneSchemas);
  expect(packed.protectedFields).toEqual(full.protectedFields);
  expect(packed.unsupported).toEqual(full.unsupported);
  expect(Buffer.byteLength(JSON.stringify(packed))).toBeLessThan(Buffer.byteLength(JSON.stringify(full)));
  expect(buildPlanningCatalog()).toEqual(packed);
});
