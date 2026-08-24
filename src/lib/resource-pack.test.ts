import { afterEach, describe, expect, it, vi } from "vitest";
import { MAX_USER_FONT_BYTES } from "./fonts";
import { MAX_RESOURCE_PACK_BYTES } from "./import-file-limits";
import {
  checkResourcePackExportSize,
  createResourcePack,
  downloadResourcePack,
  estimateResourcePackBytes,
  mergeResourcePack,
  parseResourcePack,
  serializeResourcePack,
} from "./resource-pack";

/** Build a font data URL whose decoded payload is at least `bytes` long. */
function fontDataUrlOfBytes(bytes: number, fill = "A"): string {
  return `data:font/ttf;base64,${fill.repeat(Math.ceil(bytes / 3) * 4)}`;
}

/** 一份序列化后必然越过 24MB 导入闸门的资源包。 */
function oversizedPack() {
  return createResourcePack({
    assets: [{
      id: "asset-huge",
      label: "全班合影原图",
      src: `data:image/png;base64,${"A".repeat(MAX_RESOURCE_PACK_BYTES)}`,
      kind: "decoration",
      provinceIds: [],
      source: "user",
    }],
    fonts: [],
    now: new Date("2026-07-26T00:00:00.000Z"),
  });
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
    expect(parsed.duplicateFontCount).toBe(1);
    expect(parsed.pack.fonts.map((font) => font.id)).toEqual(["font-user-ok"]);
    expect(parsed.fontIdRemap).toEqual({ "font-user-copy": "font-user-ok" });
    expect(parsed.fontIdRemap["font-user-huge"]).toBeUndefined();
  });

  it("maps the family of a deduped font to the kept id so legacy references follow", () => {
    const raw = JSON.stringify({
      kind: "cengfan-resource-pack",
      assets: [],
      fonts: [
        { id: "font-user-ok", label: "手写体", family: "Hand", src: "data:font/ttf;base64,QUJD", format: "truetype" },
        { id: "font-user-copy", label: "手写体副本", family: "HandCopy", src: "data:font/ttf;base64,QUJD", format: "truetype" },
      ],
    });

    const parsed = parseResourcePack(raw);

    expect(parsed.pack.fonts.map((font) => font.id)).toEqual(["font-user-ok"]);
    expect(parsed.fontIdRemap).toEqual({ "font-user-copy": "font-user-ok", HandCopy: "font-user-ok" });
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
    expect(merged.duplicateFonts).toBe(1);
    expect(merged.fonts).toEqual(existingFonts);
    expect(merged.fontIdRemap).toEqual({ "font-user-renamed": "font-user-1" });
  });

  describe("导出体积", () => {
    it("stays quiet under the import ceiling and explains itself above it", () => {
      expect(checkResourcePackExportSize(MAX_RESOURCE_PACK_BYTES)).toBeNull();

      const message = checkResourcePackExportSize(MAX_RESOURCE_PACK_BYTES + 1);
      expect(message).toContain("超过导入上限 24.0 MB");
      expect(message).toContain("导出后无法再导入回来");
      expect(message).toContain("删掉素材库里用不到的图片与字体");
    });

    it("estimates the pack size from its assets and fonts", () => {
      const pack = createResourcePack({
        assets: [{
          id: "asset-1",
          label: "北京贴图",
          src: `data:image/png;base64,${"A".repeat(1024 * 1024)}`,
          kind: "province-texture",
          provinceIds: ["北京市"],
          source: "user",
        }],
        fonts: [{
          id: "font-1",
          label: "手写体",
          family: "font-1",
          src: fontDataUrlOfBytes(512 * 1024),
          format: "truetype",
          source: "user",
        }],
      });

      const estimated = estimateResourcePackBytes(pack);
      const actual = new Blob([serializeResourcePack(pack)]).size;
      // 估算允许偏差，但不能低估到让超限的包溜过闸门。
      expect(estimated).toBeGreaterThanOrEqual(actual);
      expect(estimated - actual).toBeLessThan(1024);
      expect(checkResourcePackExportSize(estimated)).toBeNull();
    });

    it("estimates an oversized pack above the ceiling before anything is downloaded", () => {
      expect(checkResourcePackExportSize(estimateResourcePackBytes(oversizedPack()))).toContain("超过导入上限");
    });
  });

  describe("downloadResourcePack", () => {
    afterEach(() => {
      vi.restoreAllMocks();
      vi.unstubAllGlobals();
    });

    it("keeps the object url alive after the click so the download can start", async () => {
      vi.useFakeTimers();
      try {
        const blobs: Blob[] = [];
        const createObjectURL = vi.fn((blob: Blob) => {
          blobs.push(blob);
          return "blob:resource-pack";
        });
        const revokeObjectURL = vi.fn();
        vi.stubGlobal("URL", { createObjectURL, revokeObjectURL });
        const link = document.createElementNS("http://www.w3.org/1999/xhtml", "a") as HTMLAnchorElement;
        const click = vi.spyOn(link, "click").mockImplementation(() => {});
        vi.spyOn(document, "createElement").mockImplementation((tag: string) =>
          tag === "a" ? link : (document.createElementNS("http://www.w3.org/1999/xhtml", tag) as HTMLElement),
        );
        const pack = createResourcePack({
          assets: [],
          fonts: [],
          now: new Date("2026-07-26T00:00:00.000Z"),
        });

        downloadResourcePack(pack);

        expect(link.getAttribute("href")).toBe("blob:resource-pack");
        expect(link.download).toBe("cengfan-resource-pack-2026-07-26.json");
        expect(click).toHaveBeenCalled();
        expect(blobs[0]?.type).toBe("application/json;charset=utf-8");
        await expect(blobs[0]?.text()).resolves.toBe(serializeResourcePack(pack));
        // 资源包体积大，点击的同一个任务内 revoke 会让浏览器取消尚未开始的下载。
        expect(revokeObjectURL).not.toHaveBeenCalled();
        vi.advanceTimersByTime(1000);
        expect(revokeObjectURL).toHaveBeenCalledWith("blob:resource-pack");
      } finally {
        vi.useRealTimers();
      }
    });

    it("revokes the object url when the download click throws", () => {
      const createObjectURL = vi.fn(() => "blob:resource-pack");
      const revokeObjectURL = vi.fn();
      vi.stubGlobal("URL", { createObjectURL, revokeObjectURL });
      const link = document.createElementNS("http://www.w3.org/1999/xhtml", "a") as HTMLAnchorElement;
      vi.spyOn(link, "click").mockImplementation(() => {
        throw new Error("下载被拦截");
      });
      vi.spyOn(document, "createElement").mockImplementation((tag: string) =>
        tag === "a" ? link : (document.createElementNS("http://www.w3.org/1999/xhtml", tag) as HTMLElement),
      );

      expect(() => downloadResourcePack(createResourcePack({ assets: [], fonts: [] }))).toThrow("下载被拦截");
      expect(revokeObjectURL).toHaveBeenCalledWith("blob:resource-pack");
    });

    it("refuses a pack the import gate would reject, before creating an object url", () => {
      const createObjectURL = vi.fn(() => "blob:resource-pack");
      const revokeObjectURL = vi.fn();
      vi.stubGlobal("URL", { createObjectURL, revokeObjectURL });

      expect(() => downloadResourcePack(oversizedPack())).toThrow("超过导入上限 24.0 MB");
      expect(createObjectURL).not.toHaveBeenCalled();
    });
  });
});
