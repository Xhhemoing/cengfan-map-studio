import { SCENE_SCHEMAS } from './agent-scene-schemas';
import { object, validateValue } from './agent-value-schema';
export { SCENE_SCHEMAS } from './agent-scene-schemas';
export type SceneDomain = keyof typeof SCENE_SCHEMAS;
export const SCENE_DOMAIN_PROPS = Object.fromEntries(Object.entries(SCENE_SCHEMAS).map(([domain, props]) => [domain, Object.keys(props)])) as Record<SceneDomain, readonly string[]>;
export const PROTECTED_SCENE_FIELDS: Record<SceneDomain, readonly string[]> = {
  canvas: [], map: [], province: [], cards: ['positions'], guests: [], text: ['id'], asset: ['id', 'src'],
};
export interface ScenePatchError {
  domain: SceneDomain;
  unknownProps: string[];
  protectedProps: string[];
  availableProps: string[];
  invalidValues: string[];
}
export type ScenePatchValidation = { ok: true } | { ok: false; error: ScenePatchError };
export function isSceneDomain(value: string): value is SceneDomain {
  return Object.hasOwn(SCENE_SCHEMAS, value);
}
export function validateScenePatch(domain: SceneDomain, patch: unknown): ScenePatchValidation {
  const writable = SCENE_DOMAIN_PROPS[domain];
  const protectedFields = PROTECTED_SCENE_FIELDS[domain];
  const keys = patch && typeof patch === 'object' && !Array.isArray(patch) ? Object.keys(patch) : [];
  const unknownProps = keys.filter((key) => !writable.includes(key) && !protectedFields.includes(key));
  const protectedProps = keys.filter((key) => protectedFields.includes(key));
  const error = validateValue(object(SCENE_SCHEMAS[domain]), patch, domain);
  if (!error && !unknownProps.length && !protectedProps.length) return { ok: true };
  return { ok: false, error: { domain, unknownProps, protectedProps, availableProps: [...writable], invalidValues: error ? [error] : [] } };
}
