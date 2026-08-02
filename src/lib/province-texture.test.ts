import { describe, expect, it } from "vitest";
import {
  createTextureAppearance,
  provinceTextureBox,
  smartTextureLayout,
  synchronizeProvinceTextureSettings,
  withTextureLayout,
} from "./province-texture";

describe("province texture layout", () => {
  it("defaults to full-image contain without overflow", () => {
    expect(smartTextureLayout()).toMatchObject({
      fit: "contain",
      scale: 1,
      opacity: 1,
      overflow: false,
      sizingMode: "province",
    });
  });

  it("clamps manual scale and builds texture appearance", () => {
    const appearance = createTextureAppearance({
      assetId: "a1",
      src: "data:image/png;base64,abc",
      scale: 9,
      overflow: true,
      fit: "cover",
    });
    expect(appearance).toMatchObject({
      kind: "texture",
      fit: "cover",
      scale: 2.5,
      opacity: 1,
      overflow: true,
      sizingMode: "province",
    });
  });

  it("patches layout while keeping asset identity", () => {
    const base = createTextureAppearance({ assetId: "a1", src: "x" });
    expect(withTextureLayout(base, { scale: 0.8, overflow: true })).toMatchObject({
      kind: "texture",
      assetId: "a1",
      src: "x",
      fit: "contain",
      scale: 0.8,
      opacity: 1,
      overflow: true,
      sizingMode: "province",
    });
  });

  it("clamps texture opacity while preserving it across layout patches", () => {
    const base = createTextureAppearance({ assetId: "a1", src: "x", opacity: 0.4 });
    expect(base.opacity).toBe(0.4);
    expect(withTextureLayout(base, { opacity: 3, scale: 1.25 })).toMatchObject({
      opacity: 1,
      scale: 1.25,
    });
  });

  it("centers the single image box on province bounds by default", () => {
    const box = provinceTextureBox([[10, 20], [110, 120]], { fit: "contain", scale: 1.2, overflow: true, sizingMode: "province" });
    expect(box.width).toBeCloseTo(120);
    expect(box.height).toBeCloseTo(120);
    expect(box.x).toBeCloseTo(0);
    expect(box.y).toBeCloseTo(10);
  });

  it("anchors the image box to an explicit province center and never tiles", () => {
    const box = provinceTextureBox(
      [[0, 0], [100, 200]],
      { fit: "contain", scale: 0.5, overflow: false, sizingMode: "province" },
      [20, 40],
    );
    // scale 0.5 → half of bounds, centered on (20,40)
    expect(box.width).toBeCloseTo(50);
    expect(box.height).toBeCloseTo(100);
    expect(box.x).toBeCloseTo(-5);
    expect(box.y).toBeCloseTo(-10);
    expect(box.mode).toBe("single");
  });

  it("falls back to bounds center when province center is missing", () => {
    const box = provinceTextureBox([[0, 0], [100, 80]], { fit: "contain", scale: 1, overflow: false, sizingMode: "province" }, null);
    expect(box.x).toBeCloseTo(0);
    expect(box.y).toBeCloseTo(0);
    expect(box.cx).toBeCloseTo(50);
    expect(box.cy).toBeCloseTo(40);
  });

  it("keeps natural image aspect ratio in natural sizing mode", () => {
    const box = provinceTextureBox(
      [[0, 0], [100, 200]],
      { fit: "contain", scale: 1, overflow: false, sizingMode: "natural", naturalWidth: 400, naturalHeight: 100 },
      [50, 100],
    );
    // natural aspect 4:1, province aspect 1:2 → contain uses full width, height = 100/4 = 25
    expect(box.width).toBeCloseTo(100);
    expect(box.height).toBeCloseTo(25);
    expect(box.cx).toBeCloseTo(50);
    expect(box.cy).toBeCloseTo(100);
  });

  it("synchronizes visual settings without replacing each province asset or manual offset", () => {
    const source = createTextureAppearance({
      assetId: "source",
      src: "source.png",
      fit: "cover",
      scale: 1.4,
      opacity: 0.55,
      overflow: true,
      sizingMode: "custom",
      customWidth: 140,
      customHeight: 90,
      naturalWidth: 500,
      naturalHeight: 300,
      offsetX: 18,
      offsetY: -12,
    });
    const styles = {
      北京市: { appearance: source },
      浙江省: { appearance: createTextureAppearance({
        kind: "feature",
        assetId: "zhejiang",
        src: "zhejiang.png",
        naturalWidth: 320,
        naturalHeight: 480,
        offsetX: -8,
        offsetY: 21,
      }) },
      四川省: { appearance: { kind: "manual-color" as const, color: "#123456" } },
      广东省: {},
    };

    const synchronized = synchronizeProvinceTextureSettings(styles, source);

    expect(synchronized.浙江省.appearance).toEqual(expect.objectContaining({
      kind: "feature",
      assetId: "zhejiang",
      src: "zhejiang.png",
      naturalWidth: 320,
      naturalHeight: 480,
      offsetX: -8,
      offsetY: 21,
      fit: "cover",
      scale: 1.4,
      opacity: 0.55,
      overflow: true,
      sizingMode: "custom",
      customWidth: 140,
      customHeight: 90,
    }));
    expect(synchronized.四川省).toBe(styles.四川省);
    expect(synchronized.广东省).toBe(styles.广东省);
  });

  it("uses explicit custom width and height in custom sizing mode", () => {
    const box = provinceTextureBox(
      [[0, 0], [100, 200]],
      { fit: "contain", scale: 1, overflow: false, sizingMode: "custom", customWidth: 80, customHeight: 60 },
      [50, 100],
    );
    expect(box.width).toBeCloseTo(80);
    expect(box.height).toBeCloseTo(60);
    expect(box.x).toBeCloseTo(10);
    expect(box.y).toBeCloseTo(70);
  });
});
