import { buildCapabilityCatalog } from './capability-catalog';
import type { ValueSchema } from '../../src/lib/agent-value-schema';

/** Deduplicate static schema definitions, without dropping value constraints or raising budgets. */
export function buildPlanningCatalog() {
  const catalog = buildCapabilityCatalog();
  const definitions: Record<string, Record<string, unknown>> = {};
  const identifiers = new Map<string, string>();
  function reference(schema: ValueSchema): { $ref: string } {
    const serialized = JSON.stringify(schema);
    let id = identifiers.get(serialized);
    if (!id) {
      id = `s${identifiers.size}`;
      identifiers.set(serialized, id);
      const packed: Record<string, unknown> = { ...schema };
      if (schema.properties) packed.properties = Object.fromEntries(Object.entries(schema.properties).map(([name, rule]) => [name, reference(rule)]));
      if (schema.items) packed.items = reference(schema.items);
      if (schema.anyOf) packed.anyOf = schema.anyOf.map(reference);
      if (typeof schema.additionalProperties === 'object') packed.additionalProperties = reference(schema.additionalProperties);
      definitions[id] = packed;
    }
    return { $ref: `#/$defs/${id}` };
  }
  const sceneSchemas = Object.fromEntries(Object.entries(catalog.sceneSchemas).map(([domain, properties]) =>
    [domain, Object.fromEntries(Object.entries(properties).map(([name, schema]) => [name, reference(schema)]))]));
  return {
    version: catalog.version,
    execution: catalog.execution,
    unsupported: catalog.unsupported,
    protectedFields: catalog.protectedFields,
    $defs: definitions,
    sceneSchemas,
    tools: catalog.tools.map(({ name, description, parameters, effect }) => ({ name, description, parameters, effect })),
  };
}
