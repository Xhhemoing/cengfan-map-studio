import { describe, expect, it } from "vitest";
import {
  createResourcePack,
  mergeResourcePack,
  parseResourcePack,
  serializeResourcePack,
} from "./resource-pack";

describe("resource-pack", () => {
  it("serializes and parses a local resource pack", () => {
    const pack = createResourcePack({
      assets: [{
        id: "asset-user-1",
        label: "北京贴图",
        src: "data:image/png;base64,abc",
        kind: "province-texture",
        provinceIds: ["北京市"],
        source: "user",
      }],
      fonts: [{
        id: "font-user-1",
        label: "手写体",
        family: "font-user-1",
        src: "data:font/ttf;base64,AA==",
        format: "truetype",
        source: "user",
      }],
      now: new Date("2026-07-26T00:00:00.000Z"),
    });

    const parsed = parseResourcePack(serializeResourcePack(pack));
    expect(parsed.assetCount).toBe(1);
    expect(parsed.fontCount).toBe(1);
    expect(parsed.pack.assets[0]?.provinceIds).toEqual(["北京市"]);
    expect(parsed.pack.fonts[0]?.label).toBe("手写体");
  });

  it("merges packs without duplicating ids", () => {
    const existingAssets = [{
      id: "asset-user-1",
      label: "旧贴图",
      src: "data:image/png;base64,old",
      kind: "province-texture" as const,
      provinceIds: ["北京市"],
      source: "user" as const,
    }];
    const existingFonts = [{
      id: "font-user-1",
      label: "旧字体",
      family: "font-user-1",
      src: "data:font/ttf;base64,AA==",
      format: "truetype" as const,
      source: "user" as const,
    }];
    const incoming = createResourcePack({
      assets: [
        existingAssets[0]!,
        {
          id: "asset-user-2",
          label: "新贴图",
          src: "data:image/png;base64,new",
          kind: "decoration",
          provinceIds: [],
          source: "user",
        },
      ],
      fonts: [
        existingFonts[0]!,
        {
          id: "font-user-2",
          label: "新字体",
          family: "font-user-2",
          src: "data:font/ttf;base64,BB==",
          format: "woff2",
          source: "user",
        },
      ],
    });

    const merged = mergeResourcePack({ existingAssets, existingFonts, incoming });
    expect(merged.addedAssets).toBe(1);
    expect(merged.addedFonts).toBe(1);
    expect(merged.assets).toHaveLength(2);
    expect(merged.fonts).toHaveLength(2);
  });
});
