import { describe, expect, it, vi } from "vitest";
import {
  buildFontFaceCss,
  createUserFont,
  detectFontFormat,
  ensureUserFontsLoaded,
  estimateFontBytes,
  findExistingFont,
  formatFontBytes,
  LARGE_USER_FONT_BYTES,
  listFonts,
  loadUserFonts,
  MAX_USER_FONT_BYTES,
  resolveFontFamily,
  saveUserFonts,
  validateFontFile,
} from "./fonts";

/** Build a font data URL whose decoded payload is at least `bytes` long. */
function fontDataUrlOfBytes(bytes: number, fill = "A", mime = "font/ttf"): string {
  return `data:${mime};base64,${fill.repeat(Math.ceil(bytes / 3) * 4)}`;
}

describe("fonts library", () => {
  it("detects common font formats from file names", () => {
    expect(detectFontFormat("Hand.ttf")).toBe("truetype");
    expect(detectFontFormat("Title.OTF")).toBe("opentype");
    expect(detectFontFormat("body.woff2")).toBe("woff2");
    expect(detectFontFormat("notes.txt")).toBeNull();
  });

  it("accepts font files up to the collaboration-safe ceiling and rejects the rest", () => {
    expect(validateFontFile({ name: "Hand.ttf", size: 1024 })).toEqual({
      ok: true,
      format: "truetype",
      size: 1024,
    });
    expect(validateFontFile({ name: "Hand.ttf", size: MAX_USER_FONT_BYTES })).toMatchObject({ ok: true });
    expect(validateFontFile({ name: "notes.txt", size: 1024 })).toEqual({
      ok: false,
      reason: "仅支持 TTF / OTF / WOFF 字体文件",
    });
    expect(validateFontFile({ name: "empty.ttf", size: 0 })).toMatchObject({ ok: false });

    const oversized = validateFontFile({ name: "SourceHanSans.ttf", size: MAX_USER_FONT_BYTES + 1 });
    expect(oversized.ok).toBe(false);
    expect(oversized.ok === false && oversized.reason).toContain("超过 5MB 上限");
  });

  it("keeps the large-font warning threshold below the hard ceiling", () => {
    expect(LARGE_USER_FONT_BYTES).toBeLessThan(MAX_USER_FONT_BYTES);
    expect(validateFontFile({ name: "CJK.ttf", size: LARGE_USER_FONT_BYTES + 1 })).toMatchObject({ ok: true });
  });

  it("estimates decoded bytes from a data URL and formats them for humans", () => {
    expect(estimateFontBytes("data:font/ttf;base64,AA==")).toBe(1);
    expect(estimateFontBytes("data:font/ttf;base64,QUJD")).toBe(3);
    expect(estimateFontBytes(fontDataUrlOfBytes(3 * 1024 * 1024))).toBeGreaterThanOrEqual(3 * 1024 * 1024);
    expect(formatFontBytes(MAX_USER_FONT_BYTES)).toBe("5MB");
    expect(formatFontBytes(2 * 1024 * 1024 + 512 * 1024)).toBe("2.5MB");
    expect(formatFontBytes(64 * 1024)).toBe("64KB");
  });

  it("reuses the stored font when the same bytes arrive again under a different MIME type", () => {
    const stored = createUserFont({ label: "手写体", src: "data:font/ttf;base64,QUJD", format: "truetype" });

    expect(findExistingFont([stored], "data:application/octet-stream;base64,QUJD")).toBe(stored);
    expect(findExistingFont([stored], "data:font/ttf;base64,QUJE")).toBeUndefined();
    expect(findExistingFont([stored], "")).toBeUndefined();
    expect(findExistingFont([], "data:font/ttf;base64,QUJD")).toBeUndefined();
  });

  it("persists user fonts and resolves families for built-in and custom fonts", () => {
    const storage = {
      data: new Map<string, string>(),
      getItem(key: string) {
        return this.data.get(key) ?? null;
      },
      setItem(key: string, value: string) {
        this.data.set(key, value);
      },
    };
    const font = createUserFont({
      label: "手写体",
      src: "data:font/ttf;base64,AA==",
      format: "truetype",
    });
    saveUserFonts([font], storage);
    const loaded = loadUserFonts(storage);
    expect(loaded).toEqual([font]);
    expect(listFonts(loaded).some((item) => item.id === "font-system-kaiti")).toBe(true);
    expect(resolveFontFamily("font-system-serif", loaded)).toContain("Songti SC");
    expect(resolveFontFamily(font.id, loaded)).toBe(`"${font.family}"`);
    expect(resolveFontFamily(undefined, loaded)).toBeUndefined();
    expect(buildFontFaceCss(loaded)).toContain(`font-family:"${font.family}"`);
    expect(buildFontFaceCss(loaded)).toContain(font.src);
  });

  it("uses blocking font display for self-contained poster SVG exports", () => {
    const font = createUserFont({
      label: "导出字体",
      src: "data:font/ttf;base64,RVhQT1JU",
      format: "truetype",
    });

    expect(buildFontFaceCss([font], "block")).toContain("font-display:block");
  });

  it("registers uploaded fonts with the browser font set before canvas rendering", async () => {
    const font = createUserFont({
      label: "画布手写体",
      src: "data:font/ttf;base64,AA==",
      format: "truetype",
    });
    const add = vi.fn();
    const load = vi.fn().mockResolvedValue(undefined);
    const FontFaceConstructor = vi.fn(function (this: { load: typeof load }, family: string, source: string) {
      expect(family).toBe(font.family);
      expect(source).toContain(font.src);
      this.load = load;
    });
    const documentRef = { fonts: { check: vi.fn(() => false), add } };

    await ensureUserFontsLoaded([font], documentRef, FontFaceConstructor as unknown as typeof FontFace);

    expect(load).toHaveBeenCalledOnce();
    expect(add).toHaveBeenCalledOnce();
  });

  it("loads an uploaded font even when the browser reports a fallback font as available", async () => {
    const font = createUserFont({
      label: "回退检测字体",
      src: "data:font/ttf;base64,BB==",
      format: "truetype",
    });
    const add = vi.fn();
    const load = vi.fn().mockResolvedValue(undefined);
    const FontFaceConstructor = vi.fn(function (this: { load: typeof load }) {
      this.load = load;
    });
    const documentRef = { fonts: { check: vi.fn(() => true), add } };

    await ensureUserFontsLoaded([font], documentRef, FontFaceConstructor as unknown as typeof FontFace);

    expect(load).toHaveBeenCalledOnce();
    expect(add).toHaveBeenCalledOnce();
  });

  it("registers the same uploaded font with each active document font set", async () => {
    const font = {
      id: "font-user-shared-source",
      label: "跨文档字体",
      family: "SharedCanvasHand",
      src: "data:font/ttf;base64,Q0FOVkFT",
      format: "truetype" as const,
      source: "user" as const,
    };
    const firstAdd = vi.fn();
    const secondAdd = vi.fn();
    const FontFaceConstructor = vi.fn(function (this: { load: () => Promise<unknown> }) {
      this.load = vi.fn().mockResolvedValue(this);
    });

    await ensureUserFontsLoaded([font], { fonts: { add: firstAdd } }, FontFaceConstructor as unknown as typeof FontFace);
    await ensureUserFontsLoaded([font], { fonts: { add: secondAdd } }, FontFaceConstructor as unknown as typeof FontFace);

    expect(firstAdd).toHaveBeenCalledOnce();
    expect(secondAdd).toHaveBeenCalledOnce();
    expect(FontFaceConstructor).toHaveBeenCalledTimes(2);
  });

  it("waits for the active font set to settle after registering an uploaded export font", async () => {
    const font = {
      id: "font-user-export-wait",
      label: "导出等待字体",
      family: "ExportWaitHand",
      src: "data:font/ttf;base64,RVhQT1JU",
      format: "truetype" as const,
      source: "user" as const,
    };
    const load = vi.fn().mockResolvedValue(undefined);
    const add = vi.fn();
    const FontFaceConstructor = vi.fn(function (this: { load: typeof load }) {
      this.load = load;
    });
    let settleFonts: (() => void) | undefined;
    const documentRef = { fonts: { add, ready: new Promise<void>((resolve) => { settleFonts = resolve; }) } };
    const registration = ensureUserFontsLoaded([font], documentRef, FontFaceConstructor as unknown as typeof FontFace);
    let exportReady = false;
    void registration.then(() => { exportReady = true; });
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(exportReady).toBe(false);
    settleFonts?.();
    await registration;
    expect(exportReady).toBe(true);
    expect(add).toHaveBeenCalledOnce();
  });
});
