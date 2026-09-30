/** Shared, deliberately small JSON-schema subset; no eval, coercion or DOM dependency. */
export interface ValueSchema {
  type?: 'number' | 'integer' | 'string' | 'boolean' | 'object' | 'array';
  enum?: readonly (string | number | boolean)[];
  minimum?: number;
  maximum?: number;
  maxLength?: number;
  maxItems?: number;
  properties?: Record<string, ValueSchema>;
  required?: string[];
  additionalProperties?: boolean | ValueSchema;
  items?: ValueSchema;
  anyOf?: ValueSchema[];
  description?: string;
}
export const scalar = (minimum = -32768, maximum = 32768, integer = false): ValueSchema => ({ type: integer ? 'integer' : 'number', minimum, maximum });
export const text: ValueSchema = { type: 'string', maxLength: 2048 };
export const flag: ValueSchema = { type: 'boolean' };
export const oneOf = (...values: string[]): ValueSchema => ({ type: 'string', enum: values });
export const object = (properties: Record<string, ValueSchema>, required: string[] = []): ValueSchema => ({ type: 'object', properties, required, additionalProperties: false });
export const array = (items: ValueSchema): ValueSchema => ({ type: 'array', items, maxItems: 100 });
export const dictionary = (values: ValueSchema): ValueSchema => ({ type: 'object', additionalProperties: values });
export const alternative = (...anyOf: ValueSchema[]): ValueSchema => ({ anyOf });

export function validateValue(schema: ValueSchema, value: unknown, path = 'value', depth = 0): string | null {
  if (depth > 20) return `${path}: nesting is too deep`;
  if (schema.anyOf) return schema.anyOf.some((item) => validateValue(item, value, path, depth + 1) === null) ? null : `${path}: no allowed shape matches`;
  if (schema.type === 'number' || schema.type === 'integer') {
    if (typeof value !== 'number' || !Number.isFinite(value) || (schema.type === 'integer' && !Number.isInteger(value))) return `${path}: expected finite ${schema.type}`;
    if (value < (schema.minimum ?? -Infinity) || value > (schema.maximum ?? Infinity)) return `${path}: outside ${schema.minimum}..${schema.maximum}`;
  }
  if (schema.type === 'boolean' && typeof value !== 'boolean') return `${path}: expected boolean`;
  if (schema.type === 'string' && (typeof value !== 'string' || value.length > (schema.maxLength ?? 2048))) return `${path}: expected bounded string`;
  if (schema.enum && !schema.enum.includes(value as string)) return `${path}: unsupported enum value`;
  if (schema.type === 'array') {
    if (!Array.isArray(value) || value.length > (schema.maxItems ?? 100)) return `${path}: expected bounded array`;
    for (let index = 0; index < value.length; index += 1) {
      const error = validateValue(schema.items ?? {}, value[index], `${path}.${index}`, depth + 1);
      if (error) return error;
    }
  }
  if (schema.type === 'object') {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return `${path}: expected object`;
    const record = value as Record<string, unknown>;
    if (Object.keys(record).length > 100) return `${path}: too many properties`;
    if (schema.required?.some((key) => !Object.hasOwn(record, key))) return `${path}: missing required property`;
    for (const [key, child] of Object.entries(record)) {
      if (['__proto__', 'prototype', 'constructor'].includes(key)) return `${path}: unsafe property`;
      const rule = schema.properties && Object.hasOwn(schema.properties, key) ? schema.properties[key] : undefined;
      if (!rule && schema.additionalProperties === false) return `${path}.${key}: unknown property`;
      const additional = typeof schema.additionalProperties === 'object' ? schema.additionalProperties : undefined;
      if (rule || additional) {
        const error = validateValue((rule ?? additional)!, child, `${path}.${key}`, depth + 1);
        if (error) return error;
      }
    }
  }
  return null;
}
