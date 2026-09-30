import { SCENE_SCHEMAS } from './agent-scene-schemas';
import { object, validateValue } from './agent-value-schema';
export { SCENE_SCHEMAS } from './agent-scene-schemas';
export type SceneDomain = keyof typeof SCENE_SCHEMAS;
// Keep domain keys explicit so both TypeScript projects can verify completeness.
export const SCENE_DOMAIN_PROPS: Record<SceneDomain, readonly string[]> = {
  canvas: Object.keys(SCENE_SCHEMAS.canvas),
  map: Object.keys(SCENE_SCHEMAS.map),
  province: Object.keys(SCENE_SCHEMAS.province),
  cards: Object.keys(SCENE_SCHEMAS.cards),
  guests: Object.keys(SCENE_SCHEMAS.guests),
  text: Object.keys(SCENE_SCHEMAS.text),
  asset: Object.keys(SCENE_SCHEMAS.asset),
};
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
