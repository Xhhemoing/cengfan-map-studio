import { describe, expect, it } from "vitest";
import {
  createDecorationElement,
  createLandmarkElement,
  createProvinceTextureElement,
  deleteAssetElement,
  duplicateAssetElement,
  sortAssetElementsByLayer,
} from "./asset-elements";
import type { StudioAsset } from "./assets";

const asset: StudioAsset = {
  id: "asset-west-lake",
  label: "西湖剪影",
  kind: "regional",
  src: "data:image/svg+xml,<svg/>",
  provinceIds: ["浙江省"],
  source: "system",
};

describe("asset elements", () => {
  it("creates bound landmark and province texture instances", () => {
    const landmark = createLandmarkElement(asset, "浙江省", { x: 1040, y: 620 });
    const texture = createProvinceTextureElement(asset, "浙江省");

    expect(landmark).toMatchObject({
      assetId: asset.id,
      kind: "landmark",
      province: "浙江省",
      x: 1040,
      y: 620,
    });
    expect(texture).toMatchObject({
      assetId: asset.id,
      kind: "province-texture",
      province: "浙江省",
    });
    expect(texture.id).not.toBe(landmark.id);
  });

  it("keeps source assets independent from duplicate and deleted instances", () => {
    const first = createDecorationElement(asset, { x: 24, y: 48 });
    const duplicate = duplicateAssetElement(first);
    const remaining = deleteAssetElement([first, duplicate], first.id);

    expect(duplicate.id).not.toBe(first.id);
    expect(remaining).toEqual([duplicate]);
    expect(asset.id).toBe("asset-west-lake");
  });

  it("sorts all instances by their explicit layer without truncating them", () => {
    const low = { ...createDecorationElement(asset, { x: 0, y: 0 }), id: "low", zIndex: -1 };
    const middle = { ...createDecorationElement(asset, { x: 0, y: 0 }), id: "middle", zIndex: 0 };
    const high = { ...createDecorationElement(asset, { x: 0, y: 0 }), id: "high", zIndex: 4 };

    expect(sortAssetElementsByLayer([high, low, middle]).map((item) => item.id)).toEqual(["low", "middle", "high"]);
  });
});
