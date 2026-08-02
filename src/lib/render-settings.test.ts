import { describe, expect, it } from "vitest";
import { DEFAULT_RENDER_SETTINGS, normalizeRenderSettings, renderIntervalMs } from "./render-settings";

describe("render settings", () => {
  it("uses a reduced default rate and maps modes to stable frame rates", () => {
    expect(DEFAULT_RENDER_SETTINGS).toEqual({ mode: "normal", fixedFps: 20 });
    expect(renderIntervalMs({ mode: "high", fixedFps: 20 })).toBe(33);
    expect(renderIntervalMs({ mode: "normal", fixedFps: 20 })).toBe(50);
    expect(renderIntervalMs({ mode: "low", fixedFps: 20 })).toBe(100);
  });

  it("clamps fixed frame rates and safely normalizes persisted values", () => {
    expect(renderIntervalMs({ mode: "fixed", fixedFps: 20 })).toBe(50);
    expect(normalizeRenderSettings({ mode: "fixed", fixedFps: 200 })).toEqual({ mode: "fixed", fixedFps: 30 });
    expect(normalizeRenderSettings({ mode: "fixed", fixedFps: 0.1 })).toEqual({ mode: "fixed", fixedFps: 0.2 });
    expect(normalizeRenderSettings({ mode: "fixed", fixedFps: 0.25 })).toEqual({ mode: "fixed", fixedFps: 0.3 });
    expect(renderIntervalMs({ mode: "fixed", fixedFps: 0.2 })).toBe(5000);
    expect(normalizeRenderSettings({ mode: "unknown", fixedFps: 0 })).toEqual({ mode: "normal", fixedFps: 20 });
  });
});
