import { describe, expect, it } from "vitest";
import {
  createDefaultScene,
  normalizeScene,
  updateSceneTarget,
  type MapRenderSource,
} from "./scene-document";

describe("scene document", () => {
  it("protects the map from cards by default and preserves an explicit overlap opt-in", () => {
    const scene = createDefaultScene("original");

    expect(scene.cards.allowMapOverlap).toBe(false);
    expect(normalizeScene({
      ...scene,
      cards: { ...scene.cards, allowMapOverlap: true },
    }).cards.allowMapOverlap).toBe(true);
  });

  it("keeps province textures in data cards opt-in across defaults and normalization", () => {
    const scene = createDefaultScene("original");

    expect(scene.cards.showProvinceTexture).toBe(false);
    expect(normalizeScene({
      ...scene,
      cards: { ...scene.cards, showProvinceTexture: true },
    }).cards.showProvinceTexture).toBe(true);
  });

  it("preserves heat-map calibration colors and keeps its depth range ordered", () => {
    const scene = createDefaultScene("original");

    const normalized = normalizeScene({
      ...scene,
      map: {
        ...scene.map,
        heatScale: {
          minDepth: 12,
          maxDepth: 3,
          lowColor: "#dfeeff",
          highColor: "#174a7c",
        },
      },
    });

    expect(normalized.map.heatScale).toEqual({
      minDepth: 3,
      maxDepth: 12,
      lowColor: "#dfeeff",
      highColor: "#174a7c",
    });
  });

  it("migrates the legacy compact preset to an independent compact layout option", () => {
    const scene = createDefaultScene("original");
    scene.cards.preset = "compact";

    const normalized = normalizeScene(scene);

    expect(normalized.cards.preset).toBe("standard");
    expect(normalized.cards.compactLayout).toBe(true);
  });

  it("creates the original scene with stable built-in text elements", () => {
    const scene = createDefaultScene("original");

    expect(scene.canvas).toMatchObject({ width: 1500, height: 1000 });
    expect(scene.map).toMatchObject({ x: 350, y: 120, width: 800, height: 690, scale: 1, opacity: 1, collapseSouthChinaSea: false });
    expect(scene.guests).toMatchObject({ title: "特邀嘉宾 · 老师名单", visibility: true });
    expect(scene.guests.people).toEqual([]);
    expect(scene.textElements.map((item) => item.role)).toEqual(
      expect.arrayContaining(["eyebrow", "title", "subtitle", "stats", "watermark", "note"]),
    );
    expect(scene.textElements.map((item) => item.id)).toEqual(
      expect.arrayContaining([
        "text-eyebrow",
        "text-title",
        "text-subtitle",
        "text-stats",
        "text-watermark",
        "text-note",
      ]),
    );
  });

  it("accepts province edge styles as connector textures", () => {
    const scene = createDefaultScene("original");
    const updated = updateSceneTarget(scene, { type: "cards" }, { connectorDash: "rail" });
    expect(updated.cards.connectorDash).toBe("rail");
  });

  it("updates guest panel people list", () => {
    const scene = createDefaultScene("original");
    const updated = updateSceneTarget(scene, { type: "guests" }, {
      people: [{ id: "g1", name: "王老师", title: "班主任", visibility: true }],
    });
    expect(updated.guests.people).toEqual([
      { id: "g1", name: "王老师", title: "班主任", visibility: true },
    ]);
  });

  it("normalizes guest display mode and per-person custom fields", () => {
    const scene = createDefaultScene("original");
    const normalized = normalizeScene({
      ...scene,
      guests: {
        ...scene.guests,
        displayMode: "cards",
        people: [
          { id: "g1", name: "王老师", title: "班主任", note: "祝大家前程似锦", avatarSrc: "data:image/png;base64,AAA", visibility: true },
          { id: "g2", name: "  ", visibility: true },
        ],
      },
    });

    expect(normalized.guests.displayMode).toBe("cards");
    expect(normalized.guests.people).toEqual([
      { id: "g1", name: "王老师", title: "班主任", note: "祝大家前程似锦", avatarSrc: "data:image/png;base64,AAA", visibility: true },
    ]);
    expect(normalizeScene({ ...scene, guests: { ...scene.guests, displayMode: "banner" as never } }).guests.displayMode).toBe("list");
  });

  it("normalizes the guest panel free-form custom text", () => {
    const scene = createDefaultScene("original");
    const normalized = normalizeScene({
      ...scene,
      guests: { ...scene.guests, customText: "  感谢老师三年的陪伴\n愿大家前程似锦  " },
    });

    expect(normalized.guests.customText).toBe("感谢老师三年的陪伴\n愿大家前程似锦");
    expect(normalizeScene({ ...scene, guests: { ...scene.guests, customText: "   " } }).guests.customText).toBeUndefined();
  });

  it("keeps the global line-height multiplier and clamps invalid values", () => {
    const scene = createDefaultScene("original");

    expect(normalizeScene(scene).canvas.lineHeight).toBe(1);
    expect(normalizeScene({
      ...scene,
      canvas: { ...scene.canvas, lineHeight: 1.6 },
    }).canvas.lineHeight).toBe(1.6);
    expect(normalizeScene({
      ...scene,
      canvas: { ...scene.canvas, lineHeight: 0.2 },
    }).canvas.lineHeight).toBe(0.8);
    expect(normalizeScene({
      ...scene,
      canvas: { ...scene.canvas, lineHeight: 9 },
    }).canvas.lineHeight).toBe(2.5);
    expect(updateSceneTarget(scene, { type: "canvas" }, { lineHeight: 1.4 }).canvas.lineHeight).toBe(1.4);
  });

  it("keeps no-wrap fields and drops unknown entries", () => {
    const scene = createDefaultScene("original");

    expect(normalizeScene(scene).cards.noWrapFields).toEqual([]);
    const normalized = normalizeScene({
      ...scene,
      cards: { ...scene.cards, noWrapFields: ["name", "university", "title" as never] },
    });
    expect(normalized.cards.noWrapFields).toEqual(["name", "university"]);
    expect(updateSceneTarget(scene, { type: "cards" }, { noWrapFields: ["city"] }).cards.noWrapFields).toEqual(["city"]);
  });

  it("normalizes map and cards zIndex with sensible defaults and bounds", () => {
    const scene = createDefaultScene("original");

    expect(normalizeScene(scene).map.zIndex).toBe(0);
    expect(normalizeScene(scene).cards.zIndex).toBe(10);
    expect(normalizeScene({
      ...scene,
      map: { ...scene.map, zIndex: 25 },
      cards: { ...scene.cards, zIndex: -3 },
    }).map.zIndex).toBe(25);
    expect(normalizeScene({
      ...scene,
      map: { ...scene.map, zIndex: 500 },
      cards: { ...scene.cards, zIndex: -500 },
    }).map.zIndex).toBe(100);
    expect(normalizeScene({
      ...scene,
      cards: { ...scene.cards, zIndex: -500 },
    }).cards.zIndex).toBe(-100);
    expect(updateSceneTarget(scene, { type: "map" }, { zIndex: 42 }).map.zIndex).toBe(42);
    expect(updateSceneTarget(scene, { type: "cards" }, { zIndex: 7 }).cards.zIndex).toBe(7);
  });

  it("clamps text updates to safe inspector bounds", () => {
    const scene = createDefaultScene("original");
    const updated = updateSceneTarget(
      scene,
      { type: "text", id: "text-title" },
      { fontSize: 400 },
    );

    expect(updated.textElements.find((item) => item.id === "text-title")?.fontSize).toBe(240);
    expect(scene.textElements.find((item) => item.id === "text-title")?.fontSize).not.toBe(240);
  });

  it("normalizes invalid canvas and map dimensions to safe minimums", () => {
    const normalized = normalizeScene({
      ...createDefaultScene("original"),
      canvas: { ...createDefaultScene("original").canvas, width: -1, height: Number.NaN },
      map: { ...createDefaultScene("original").map, width: -2, height: 0 },
    });

    expect(normalized.canvas.width).toBe(320);
    expect(normalized.canvas.height).toBe(320);
    expect(normalized.map.width).toBeGreaterThan(0);
    expect(normalized.map.height).toBeGreaterThan(0);
  });

  it("keeps the shared province texture box disabled by default and clamps invalid dimensions", () => {
    const defaults = createDefaultScene("original");
    expect(defaults.map.provinceTextureUniformSize).toEqual({ enabled: false, width: 100, height: 80 });

    const normalized = normalizeScene({
      ...defaults,
      map: {
        ...defaults.map,
        provinceTextureUniformSize: { enabled: true, width: -5, height: Number.NaN },
      },
    });

    expect(normalized.map.provinceTextureUniformSize).toEqual({ enabled: true, width: 1, height: 80 });
  });

  it("defaults map opacity to opaque and clamps persisted values", () => {
    const defaults = createDefaultScene("original");
    expect(defaults.map.opacity).toBe(1);

    expect(normalizeScene({ ...defaults, map: { ...defaults.map, opacity: -0.5 } }).map.opacity).toBe(0);
    expect(normalizeScene({ ...defaults, map: { ...defaults.map, opacity: 1.5 } }).map.opacity).toBe(1);
    expect(normalizeScene({ ...defaults, map: { ...defaults.map, opacity: undefined } }).map.opacity).toBe(1);
  });

  it("normalizes province texture manual offsets", () => {
    const defaults = createDefaultScene("original");
    const normalized = normalizeScene({
      ...defaults,
      map: {
        ...defaults.map,
        provinceStyles: {
          北京市: { appearance: {
            kind: "texture",
            assetId: "beijing",
            src: "beijing.png",
            fit: "contain",
            offsetX: -18.5,
            offsetY: 24,
          } },
          浙江省: { appearance: {
            kind: "texture",
            assetId: "zhejiang",
            src: "zhejiang.png",
            fit: "contain",
            offsetX: Number.NaN,
            offsetY: Number.POSITIVE_INFINITY,
          } },
        },
      },
    });

    expect(normalized.map.provinceStyles?.北京市?.appearance).toEqual(expect.objectContaining({
      offsetX: -18.5,
      offsetY: 24,
    }));
    expect(normalized.map.provinceStyles?.浙江省?.appearance).toEqual(expect.objectContaining({
      offsetX: 0,
      offsetY: 0,
    }));
  });
});

describe("normalizeMapRenderSource zIndex", () => {
  it("defaults zIndex to 25 for image render sources", () => {
    const source: MapRenderSource = {
      kind: "image",
      assetId: "map-1",
      src: "data:image/png;base64,AAA",
      fit: "contain",
      opacity: 1,
      alignment: {
        sourceWidth: 100,
        sourceHeight: 100,
        sourceBounds: { x: 0, y: 0, width: 1, height: 1 },
        x: 0,
        y: 0,
        width: 100,
        height: 100,
        rotation: 0,
      },
    };
    const scene = normalizeScene({
      canvas: { width: 1500, height: 1000, safeMargin: 36, backgroundColor: "#fff", backgroundFit: "cover", backgroundOpacity: 1 },
      map: {
        x: 0,
        y: 0,
        width: 800,
        height: 690,
        scale: 1,
        landColor: "#f0f0f0",
        activeColor: "#ff0000",
        edgeColor: "#333",
        showProvinceLabels: true,
        renderSource: source,
      },
      cards: {
        preset: "standard",
        grouping: "province",
        x: 0,
        y: 0,
        maxWidth: 300,
        padding: 12,
        gap: 12,
        columns: "auto",
        background: "#fff",
        opacity: 1,
        textColor: "#000",
        fontSize: 12,
        connectorStyle: "curve",
        connectorColor: "#000",
        connectorWidth: 1,
        connectorDash: "solid",
        visibleFields: ["name", "university", "city"],
        positions: {},
      },
      guests: { title: "嘉宾", x: 0, y: 0, width: 200, padding: 12, background: "#fff", opacity: 1, textColor: "#000", fontSize: 12, visibility: true, people: [] },
      textElements: [],
      assetElements: [],
    });

    expect(scene.map.renderSource?.kind).toBe("image");
    if (scene.map.renderSource?.kind === "image") {
      expect(scene.map.renderSource.zIndex).toBe(25);
    }
  });

  it("clamps zIndex to the allowed range", () => {
    const source: MapRenderSource = {
      kind: "image",
      assetId: "map-1",
      src: "data:image/png;base64,AAA",
      fit: "contain",
      opacity: 1,
      zIndex: 9999,
      alignment: {
        sourceWidth: 100,
        sourceHeight: 100,
        sourceBounds: { x: 0, y: 0, width: 1, height: 1 },
        x: 0,
        y: 0,
        width: 100,
        height: 100,
        rotation: 0,
      },
    };
    const scene = normalizeScene({
      canvas: { width: 1500, height: 1000, safeMargin: 36, backgroundColor: "#fff", backgroundFit: "cover", backgroundOpacity: 1 },
      map: {
        x: 0,
        y: 0,
        width: 800,
        height: 690,
        scale: 1,
        landColor: "#f0f0f0",
        activeColor: "#ff0000",
        edgeColor: "#333",
        showProvinceLabels: true,
        renderSource: source,
      },
      cards: {
        preset: "standard",
        grouping: "province",
        x: 0,
        y: 0,
        maxWidth: 300,
        padding: 12,
        gap: 12,
        columns: "auto",
        background: "#fff",
        opacity: 1,
        textColor: "#000",
        fontSize: 12,
        connectorStyle: "curve",
        connectorColor: "#000",
        connectorWidth: 1,
        connectorDash: "solid",
        visibleFields: ["name", "university", "city"],
        positions: {},
      },
      guests: { title: "嘉宾", x: 0, y: 0, width: 200, padding: 12, background: "#fff", opacity: 1, textColor: "#000", fontSize: 12, visibility: true, people: [] },
      textElements: [],
      assetElements: [],
    });

    expect(scene.map.renderSource?.kind).toBe("image");
    if (scene.map.renderSource?.kind === "image") {
      expect(scene.map.renderSource.zIndex).toBe(1000);
    }
  });
});