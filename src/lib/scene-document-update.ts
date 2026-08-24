import { normalizeScene } from "./scene-document-normalize";
import type { SceneDocument, SceneSelection } from "./scene-document-types";

export function updateSceneTarget(
  scene: SceneDocument,
  target: SceneSelection,
  patch: Record<string, unknown>,
): SceneDocument {
  switch (target.type) {
    case "canvas":
      return normalizeScene({ ...scene, canvas: { ...scene.canvas, ...patch } });
    case "map":
      return normalizeScene({ ...scene, map: { ...scene.map, ...patch } });
    case "province":
      return normalizeScene({
        ...scene,
        map: {
          ...scene.map,
          provinceStyles: {
            ...scene.map.provinceStyles,
            [target.province]: { ...scene.map.provinceStyles?.[target.province], ...patch },
          },
        },
      });
    case "cards":
      return normalizeScene({ ...scene, cards: { ...scene.cards, ...patch } });
    case "guests":
      return normalizeScene({ ...scene, guests: { ...scene.guests, ...patch } as typeof scene.guests });
    case "text":
      return normalizeScene({
        ...scene,
        textElements: scene.textElements.map((element) =>
          element.id === target.id ? { ...element, ...patch } : element,
        ),
      });
    case "asset":
      return normalizeScene({
        ...scene,
        assetElements: scene.assetElements.map((element) =>
          element.id === target.id ? { ...element, ...patch } : element,
        ),
      });
  }
}
