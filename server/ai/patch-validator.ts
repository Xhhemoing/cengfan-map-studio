import { SCENE_DOMAIN_PROPS, type SceneDomain } from "../../src/lib/scene-writable-props";

// 可写清单由 src/lib/scene-writable-props.ts 统一维护，这里只做转发，避免前后端两份副本走偏。
export { SCENE_DOMAIN_PROPS };
export type { SceneDomain };

/** 普通场景补丁永远不能触碰的字段。 */
export const PROTECTED_SCENE_FIELDS: Record<SceneDomain, readonly string[]> = {
  canvas: [],
  map: [],
  province: [],
  cards: ["positions"],
  guests: [],
  text: ["id"],
  asset: ["id", "src"],
};

export interface ScenePatchError {
  domain: SceneDomain;
  unknownProps: string[];
  protectedProps: string[];
  availableProps: string[];
}

export type ScenePatchValidation =
  | { ok: true }
  | { ok: false; error: ScenePatchError };

export function isSceneDomain(value: string): value is SceneDomain {
  return Object.prototype.hasOwnProperty.call(SCENE_DOMAIN_PROPS, value);
}

export function validateScenePatch(
  domain: SceneDomain,
  patch: Record<string, unknown>,
): ScenePatchValidation {
  const writable = SCENE_DOMAIN_PROPS[domain];
  const protectedFields = PROTECTED_SCENE_FIELDS[domain];
  const keys = Object.keys(patch);
  const unknownProps = keys.filter((key) => !writable.includes(key) && !protectedFields.includes(key));
  const protectedProps = keys.filter((key) => protectedFields.includes(key));
  if (unknownProps.length === 0 && protectedProps.length === 0) return { ok: true };
  return {
    ok: false,
    error: {
      domain,
      unknownProps,
      protectedProps,
      availableProps: [...writable],
    },
  };
}
