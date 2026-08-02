import { describe, expect, it } from "vitest";
import { getProvinceNames } from "./map-data";
import { listSystemAssets } from "./assets";

describe("default province feature catalog", () => {
  it("provides one default feature texture for every canonical province", () => {
    const covered = new Set(
      listSystemAssets()
        .filter((asset) => asset.kind === "province-texture")
        .flatMap((asset) => asset.provinceIds),
    );
    const provinces = getProvinceNames().filter(Boolean);
    expect(provinces).not.toHaveLength(0);
    expect(provinces.every((province) => covered.has(province))).toBe(true);
  });
});
