import { describe, expect, it } from "vitest";
import { MAX_USER_FONT_BYTES } from "./fonts";
import {
  createResourcePack,
  mergeResourcePack,
  parseResourcePack,
  serializeResourcePack,
} from "./resource-pack";

/** Build a font data URL whose decoded payload is at least `bytes` long. */
function fontDataUrlOfBytes(bytes: number, fill = "A"): string {
  return `data:font/ttf;base64,${fill.repeat(Math.ceil(bytes / 3) * 4)}`;
}

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
    expect(merged.skippedFonts).toBe(0);
  });

  it("drops oversized fonts and duplicate bytes while parsing a pack", () => {
    const raw = JSON.stringify({
      kind: "cengfan-resource-pack",
      version: 1,
      exportedAt: "2026-07-26T00:00:00.000Z",
      assets: [],
      fonts: [
        { id: "font-user-ok", label: "手写体", family: "font-user-ok", src: "data:font/ttf;base64,QUJD", format: "truetype" },
        { id: "font-user-copy", label: "手写体副本", family: "font-user-copy", src: "data:application/octet-stream;base64,QUJD", format: "truetype" },
        { id: "font-user-huge", label: "全字库宋体", family: "font-user-huge", src: fontDataUrlOfBytes(MAX_USER_FONT_BYTES + 3, "B"), format: "truetype" },
      ],
    });

    const parsed = parseResourcePack(raw);

    expect(parsed.fontCount).toBe(1);
    expect(parsed.skippedFontCount).toBe(1);
    expect(parsed.pack.fonts.map((font) => font.id)).toEqual(["font-user-ok"]);
  });

  it("explains why a pack of only oversized fonts imports nothing", () => {
    const raw = JSON.stringify({
      kind: "cengfan-resource-pack",
      assets: [],
      fonts: [{ id: "font-user-huge", label: "全字库宋体", src: fontDataUrlOfBytes(MAX_USER_FONT_BYTES + 3, "B"), format: "truetype" }],
    });

    expect(() => parseResourcePack(raw)).toThrow("超过 5MB 上限");
  });

  it("keeps one copy when merging a font that already exists under another id", () => {
    const existingFonts = [{
      id: "font-user-1",
      label: "手写体",
      family: "font-user-1",
      src: "data:font/ttf;base64,QUJD",
      format: "truetype" as const,
      source: "user" as const,
    }];
    const incoming = createResourcePack({
      assets: [],
      fonts: [
        { id: "font-user-renamed", label: "手写体（改名）", family: "font-user-renamed", src: "data:font/ttf;base64,QUJD", format: "truetype", source: "user" },
        { id: "font-user-huge", label: "全字库宋体", family: "font-user-huge", src: fontDataUrlOfBytes(MAX_USER_FONT_BYTES + 3, "B"), format: "truetype", source: "user" },
      ],
    });

    const merged = mergeResourcePack({ existingAssets: [], existingFonts, incoming });

    expect(merged.addedFonts).toBe(0);
    expect(merged.skippedFonts).toBe(1);
    expect(merged.fonts).toEqual(existingFonts);
  });
});
