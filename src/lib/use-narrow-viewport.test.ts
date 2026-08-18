import { afterEach, describe, expect, it, vi } from "vitest";
import { isNarrowEditorViewport, NARROW_EDITOR_MEDIA_QUERY } from "./use-narrow-viewport";

function stubMatchMedia(matches: boolean) {
  window.matchMedia = vi.fn(() => ({
    matches,
    media: NARROW_EDITOR_MEDIA_QUERY,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })) as unknown as typeof window.matchMedia;
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("narrow editor viewport", () => {
  it("treats matchMedia matches as the compact-chrome source of truth", () => {
    stubMatchMedia(true);
    expect(isNarrowEditorViewport(1440)).toBe(true);
    stubMatchMedia(false);
    expect(isNarrowEditorViewport(500)).toBe(false);
  });

  it("falls back to width when matchMedia is unavailable", () => {
    // @ts-expect-error — jsdom environments may omit matchMedia
    window.matchMedia = undefined;
    expect(isNarrowEditorViewport(760)).toBe(true);
    expect(isNarrowEditorViewport(761)).toBe(false);
  });
});
