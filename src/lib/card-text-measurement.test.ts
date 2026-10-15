import { describe, expect, it, vi } from "vitest";
import {
  cardTextMeasurementKey,
  createCardTextMeasurer,
  estimateCardTextWidth,
  measureCardTextFromSnapshot,
  type CardMeasurementFontSet,
} from "./card-text-measurement";

const font = { fontFamily: '"Test Font", serif', fontSize: 20, fontWeight: 700 };

function testFonts() {
  const events = new EventTarget();
  let finish!: () => void;
  const ready = new Promise<void>((resolve) => { finish = resolve; });
  const fonts: CardMeasurementFontSet & { status: string } = {
    status: "loading", ready, check: vi.fn(() => true),
    addEventListener: vi.fn((event, listener) => events.addEventListener(event, listener)),
    removeEventListener: vi.fn((event, listener) => events.removeEventListener(event, listener)),
  };
  return { fonts, events, finish };
}

describe("card text measurement", () => {
  it("does not call the unimplemented jsdom canvas API", () => {
    vi.stubGlobal("CanvasRenderingContext2D", undefined);
    const createElement = vi.spyOn(document, "createElement");
    try {
      const measurer = createCardTextMeasurer({ fonts: null });
      expect(measurer.measure("北京", font)).toMatchObject({ width: 40, status: "estimated" });
      expect(createElement).not.toHaveBeenCalled();
      measurer.dispose();
    } finally {
      createElement.mockRestore();
      vi.unstubAllGlobals();
    }
  });

  it("uses an explicitly estimated deterministic CJK fallback without a rendering browser", () => {
    const measurer = createCardTextMeasurer({ fonts: null, createContext: () => null });
    expect(measurer.measure("中A ", font)).toEqual({ width: 38.6, status: "estimated", version: 0 });
    expect(estimateCardTextWidth("中A ", 20)).toBe(38.6);
    expect(estimateCardTextWidth("", 20)).toBe(0);
    measurer.dispose();
  });

  it("measures with the actual family, size and weight and caches by all three", () => {
    const context = { font: "", measureText: vi.fn(() => ({ width: 137 })) };
    const measurer = createCardTextMeasurer({ fonts: null, createContext: () => context });
    expect(measurer.measure("毕业", font)).toEqual({ width: 137, status: "measured", version: 0 });
    expect(context.font).toBe('700 20px "Test Font", serif');
    const returned = measurer.measure("毕业", font);
    returned.width = 999;
    expect(measurer.measure("毕业", font).width).toBe(137);
    expect(context.measureText).toHaveBeenCalledTimes(1);
    measurer.measure("毕业", { ...font, fontWeight: 400 });
    measurer.measure("毕业", { ...font, fontSize: 22 });
    measurer.measure("毕业", { ...font, fontFamily: "monospace" });
    expect(context.measureText).toHaveBeenCalledTimes(4);
    measurer.dispose();
  });

  it("invalidates fallback measurements when requested fonts finish loading", async () => {
    const { fonts, events, finish } = testFonts();
    const context = { font: "", measureText: vi.fn(() => ({ width: 77 })) };
    const measurer = createCardTextMeasurer({ fonts, createContext: () => context });
    const listener = vi.fn();
    const unsubscribe = measurer.subscribe(listener);
    expect(measurer.measure("毕业", font).status).toBe("estimated");
    expect(context.measureText).not.toHaveBeenCalled();
    fonts.status = "loaded";
    finish();
    await measurer.whenReady();
    expect(listener).toHaveBeenCalledOnce();
    expect(measurer.measure("毕业", font)).toEqual({ width: 77, status: "measured", version: 1 });
    events.dispatchEvent(new Event("loadingdone"));
    expect(measurer.getVersion()).toBe(2);
    expect(measurer.snapshot().entries).toEqual({});
    measurer.measure("毕业", font);
    expect(context.measureText).toHaveBeenCalledTimes(2);
    unsubscribe();
    events.dispatchEvent(new Event("loadingerror"));
    expect(listener).toHaveBeenCalledTimes(2);
    measurer.dispose();
  });

  it("keeps missing fonts and failed/invalid canvas measurements estimated", () => {
    const unavailable = createCardTextMeasurer({ fonts: { check: () => false }, createContext: () => { throw Error("must not create"); } });
    expect(unavailable.measure("中", font).status).toBe("estimated");
    unavailable.dispose();
    for (const measureText of [() => ({ width: Number.NaN }), () => ({ width: -1 }), () => { throw Error("canvas unavailable"); }]) {
      const measurer = createCardTextMeasurer({ fonts: null, createContext: () => ({ font: "", measureText }) });
      expect(measurer.measure("中", font)).toMatchObject({ width: 20, status: "estimated" });
      measurer.dispose();
    }
  });

  it("serializes an independent frozen measurement map and estimates unknown keys", () => {
    const measurer = createCardTextMeasurer({ fonts: null, createContext: () => ({ font: "", measureText: () => ({ width: 117 }) }) });
    measurer.measure("毕业", font);
    const frozen = JSON.parse(JSON.stringify(structuredClone(measurer.snapshot())));
    measurer.invalidate();
    expect(measureCardTextFromSnapshot(frozen, "毕业", font)).toEqual({ width: 117, status: "measured", version: 0 });
    expect(measureCardTextFromSnapshot(frozen, "中", font)).toEqual({ width: 20, status: "estimated", version: 0 });
    frozen.entries[cardTextMeasurementKey("毕业", font)].width = 5;
    expect(measurer.snapshot().entries).toEqual({});
    measurer.dispose();
  });

  it("bounds the cache and keeps recently used measurements", () => {
    const context = { font: "", measureText: vi.fn(() => ({ width: 10 })) };
    const measurer = createCardTextMeasurer({ fonts: null, createContext: () => context, maxEntries: 2 });
    for (const text of ["a", "b", "a", "c"]) measurer.measure(text, font);
    expect(Object.keys(measurer.snapshot().entries)).toHaveLength(2);
    expect(measurer.snapshot().entries[cardTextMeasurementKey("a", font)]).toBeDefined();
    expect(measurer.snapshot().entries[cardTextMeasurementKey("b", font)]).toBeUndefined();
    expect(context.measureText).toHaveBeenCalledTimes(3);
    measurer.dispose();
  });

  it("cleans listeners and ignores later font completion after disposal", async () => {
    const { fonts, events, finish } = testFonts();
    const measurer = createCardTextMeasurer({ fonts, createContext: () => ({ font: "", measureText: () => ({ width: 33 }) }) });
    const listener = vi.fn();
    measurer.subscribe(listener);
    measurer.dispose();
    measurer.dispose();
    fonts.status = "loaded";
    finish();
    await measurer.whenReady();
    events.dispatchEvent(new Event("loadingdone"));
    measurer.invalidate();
    expect(fonts.removeEventListener).toHaveBeenCalledTimes(3);
    expect(measurer.getVersion()).toBe(0);
    expect(listener).not.toHaveBeenCalled();
    expect(measurer.measure("中", font).status).toBe("estimated");
    expect(measurer.snapshot().entries).toEqual({});
  });

  it("releases readiness waiters when a font load fails", async () => {
    const measurer = createCardTextMeasurer({ fonts: { ready: Promise.reject(Error("font unavailable")), check: () => false }, createContext: () => null });
    expect(await measurer.whenReady()).toBe(1);
    expect(measurer.measure("中", font)).toEqual({ width: 20, status: "estimated", version: 1 });
    measurer.dispose();
  });
});
