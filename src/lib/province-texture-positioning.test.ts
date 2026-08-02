import { describe, expect, it } from "vitest";
import { migrateProjectPayload } from "./project-migration";
import {
  createTextureAppearance,
  synchronizeProvinceTextureSettings,
} from "./province-texture";
import {
  resolveProvinceTexturePlacements,
  textureRectsOverlap,
  type ProvinceTexturePlacement,
} from "./province-texture-placement";
import { createDefaultScene, normalizeScene } from "./scene-document";

function placement(id: string, x: number, y: number): ProvinceTexturePlacement {
  return { id, anchor: [x + 30, y + 20], rect: { x, y, width: 60, height: 40 } };
}

describe("province texture position model", () => {
  it("normalizes and migrates optional map-local offsets without polluting legacy appearances", () => {
    const defaults = createDefaultScene("original");
    const normalized = normalizeScene({
      ...defaults,
      map: { ...defaults.map, provinceStyles: {
        北京市: { appearance: { kind: "texture", assetId: "beijing", src: "beijing.png", fit: "contain", offsetX: -18.5, offsetY: 24 } },
        浙江省: { appearance: { kind: "texture", assetId: "zhejiang", src: "zhejiang.png", fit: "contain", offsetX: Number.NaN, offsetY: Number.POSITIVE_INFINITY } },
        广东省: { appearance: { kind: "texture", assetId: "guangdong", src: "guangdong.png", fit: "contain" } },
      } },
    });

    expect(normalized.map.provinceStyles?.北京市?.appearance).toEqual(expect.objectContaining({ offsetX: -18.5, offsetY: 24 }));
    expect(normalized.map.provinceStyles?.浙江省?.appearance).toEqual(expect.objectContaining({ offsetX: 0, offsetY: 0 }));
    expect(normalized.map.provinceStyles?.广东省?.appearance).not.toHaveProperty("offsetX");
    expect(normalized.map.provinceStyles?.广东省?.appearance).not.toHaveProperty("offsetY");

    const migrated = migrateProjectPayload({ schemaVersion: 2, map: { provinceStyles: { 浙江省: { appearance: {
      kind: "texture", assetId: "texture-1", src: "texture.png", fit: "contain", offsetX: -17.5, offsetY: 24,
    } } } } });
    expect(migrated.map.provinceStyles?.浙江省?.appearance).toEqual(expect.objectContaining({ offsetX: -17.5, offsetY: 24 }));
    expect(createTextureAppearance({ assetId: "legacy", src: "legacy.png" })).not.toHaveProperty("offsetX");
    expect(createTextureAppearance({ assetId: "legacy", src: "legacy.png" })).not.toHaveProperty("offsetY");
  });

  it("synchronizes visual settings while preserving each province image, natural size, and position", () => {
    const source = createTextureAppearance({
      assetId: "source", src: "source.png", fit: "cover", scale: 1.4, opacity: 0.55,
      overflow: true, sizingMode: "custom", customWidth: 140, customHeight: 90,
      naturalWidth: 500, naturalHeight: 300, offsetX: 18, offsetY: -12,
    });
    const styles = {
      北京市: { appearance: source },
      浙江省: { appearance: createTextureAppearance({
        kind: "feature", assetId: "zhejiang", src: "zhejiang.png",
        naturalWidth: 320, naturalHeight: 480, offsetX: -8, offsetY: 21,
      }) },
      四川省: { appearance: { kind: "manual-color" as const, color: "#123456" } },
      广东省: {},
    };

    const synchronized = synchronizeProvinceTextureSettings(styles, source);
    expect(synchronized.浙江省.appearance).toEqual(expect.objectContaining({
      kind: "feature", assetId: "zhejiang", src: "zhejiang.png",
      naturalWidth: 320, naturalHeight: 480, offsetX: -8, offsetY: 21,
      fit: "cover", scale: 1.4, opacity: 0.55, overflow: true,
      sizingMode: "custom", customWidth: 140, customHeight: 90,
    }));
    expect(synchronized.四川省).toBe(styles.四川省);
    expect(synchronized.广东省).toBe(styles.广东省);
  });

  it("keeps manually positioned overflow textures fixed while automatic textures avoid them", () => {
    const manual = { ...placement("manual", 45, 30), fixed: true };
    const automatic = placement("automatic", 35, 25);
    const resolved = resolveProvinceTexturePlacements([automatic, manual], { x: 0, y: 0, width: 180, height: 120 });
    const resolvedManual = resolved.find((item) => item.id === "manual")!;
    const resolvedAutomatic = resolved.find((item) => item.id === "automatic")!;

    expect(resolvedManual.rect).toEqual(manual.rect);
    expect(resolvedManual.adjusted).toBe(false);
    expect(textureRectsOverlap(resolvedManual.rect, resolvedAutomatic.rect, 4)).toBe(false);
  });
});
