/** Compatibility facade: browser execution and server planning share one value contract. */
export {
  SCENE_DOMAIN_PROPS, PROTECTED_SCENE_FIELDS, SCENE_SCHEMAS,
  isSceneDomain, validateScenePatch,
} from '../../src/lib/agent-scene-contract';
export type { SceneDomain, ScenePatchError, ScenePatchValidation } from '../../src/lib/agent-scene-contract';
