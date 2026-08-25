import { describe, expect, it } from "vitest";
import * as facade from "./scene-document";
import { CANVAS_LAYER_Z, CARD_LAYOUT_MODES, DEFAULT_PROVINCE_TEXTURE_UNIFORM_SIZE } from "./scene-document-types";
import { createDefaultGuestPanel, createDefaultScene } from "./scene-document-factories";
import { normalizeGuestPanel, normalizeLayoutMode, normalizeScene } from "./scene-document-normalize";
import { updateSceneTarget } from "./scene-document-update";

describe("scene document module split", () => {
  it("re-exports the same bindings from the facade as the implementation modules", () => {
    expect(facade.createDefaultScene).toBe(createDefaultScene);
    expect(facade.createDefaultGuestPanel).toBe(createDefaultGuestPanel);
    expect(facade.normalizeScene).toBe(normalizeScene);
    expect(facade.normalizeGuestPanel).toBe(normalizeGuestPanel);
    expect(facade.normalizeLayoutMode).toBe(normalizeLayoutMode);
    expect(facade.updateSceneTarget).toBe(updateSceneTarget);
    expect(facade.CANVAS_LAYER_Z).toBe(CANVAS_LAYER_Z);
    expect(facade.CARD_LAYOUT_MODES).toBe(CARD_LAYOUT_MODES);
    expect(facade.DEFAULT_PROVINCE_TEXTURE_UNIFORM_SIZE).toBe(DEFAULT_PROVINCE_TEXTURE_UNIFORM_SIZE);
  });

  it("keeps the public facade surface complete for existing importers", () => {
    expect(Object.keys(facade).sort()).toEqual([
      "CANVAS_LAYER_Z",
      "CANVAS_LAYER_Z_RANGE",
      "CARD_LAYOUT_MODES",
      "DEFAULT_PROVINCE_TEXTURE_UNIFORM_SIZE",
      "createDefaultGuestPanel",
      "createDefaultScene",
      "normalizeFieldFonts",
      "normalizeGuestPanel",
      "normalizeLayoutMode",
      "normalizeNoWrapFields",
      "normalizeScene",
      "updateSceneTarget",
    ]);
  });

  it("builds an identical default scene whether the factory comes from the facade or its own module", () => {
    expect(createDefaultScene("original")).toEqual(facade.createDefaultScene("original"));
    expect(createDefaultGuestPanel(1000)).toEqual(facade.createDefaultGuestPanel(1000));
  });

  it("normalizes a scene the same way when only the normalize module is imported", () => {
    const scene = createDefaultScene("original");
    const edited = {
      ...scene,
      canvas: { ...scene.canvas, width: 99, height: 200_000, backgroundOpacity: 4 },
      cards: { ...scene.cards, opacity: -1, layoutMode: "unknown" as never, positions: { a: { x: -20, y: 40 } } },
      map: { ...scene.map, scale: 12, zIndex: 9_000 },
    };

    expect(normalizeScene(edited)).toEqual(facade.normalizeScene(edited));
  });

  it("keeps normalizeScene idempotent for the default scene", () => {
    const once = normalizeScene(createDefaultScene("original"));

    expect(normalizeScene(once)).toEqual(once);
  });

  it("still migrates the legacy compact preset through the normalize module alone", () => {
    const scene = createDefaultScene("original");
    const migrated = normalizeScene({ ...scene, cards: { ...scene.cards, preset: "compact" } });

    expect(migrated.cards.preset).toBe("standard");
    expect(migrated.cards.compactLayout).toBe(true);
    expect(migrated.cards.templateId).toBe("compact");
  });

  it("normalizes guest panels without pulling in the facade", () => {
    const panel = normalizeGuestPanel(
      {
        ...createDefaultGuestPanel(1000),
        x: -50,
        people: [
          { id: "", name: "  林舟  ", visibility: true },
          { id: "blank", name: "   ", visibility: true },
        ],
      },
      1600,
      1000,
    );

    expect(panel.x).toBe(0);
    expect(panel.people).toEqual([{
      id: "guest-林舟",
      name: "林舟",
      title: undefined,
      note: undefined,
      avatarSrc: undefined,
      fontId: undefined,
      visibility: true,
    }]);
  });

  it("applies patches through the update module using the shared normalizer", () => {
    const scene = createDefaultScene("original");
    const patched = updateSceneTarget(scene, { type: "cards" }, { opacity: 3, layoutMode: "grid" });

    expect(patched.cards.opacity).toBe(1);
    expect(patched.cards.layoutMode).toBe("grid");
    expect(normalizeLayoutMode("grid")).toBe("grid");
    expect(normalizeLayoutMode("nope")).toBe("quadrant");
  });
});
