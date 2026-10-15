/** Font properties used by both SVG text and Canvas text measurement. */
export interface CardTextMeasurementFont {
  fontFamily?: string;
  fontSize: number;
  fontWeight?: number | string;
}

export interface CardTextMeasurement {
  width: number;
  status: "estimated" | "measured";
  version: number;
}

/** Plain data only: safe to structured-clone into a Worker or freeze for an export. */
export interface CardTextMeasurementSnapshot {
  version: number;
  entries: Record<string, Pick<CardTextMeasurement, "width" | "status">>;
}

interface MeasurementContext {
  font: string;
  measureText(text: string): { width: number };
}

export interface CardMeasurementFontSet {
  readonly status?: string;
  readonly ready?: PromiseLike<unknown>;
  check?(font: string, text?: string): boolean;
  addEventListener?(type: string, listener: EventListener): void;
  removeEventListener?(type: string, listener: EventListener): void;
}

export interface CardTextMeasurerOptions {
  /** Inject a context for tests; the default only constructs a canvas in a real browser. */
  createContext?: () => MeasurementContext | null | undefined;
  fonts?: CardMeasurementFontSet | null;
  maxEntries?: number;
}

export interface CardTextMeasurer {
  measure(text: string, font: CardTextMeasurementFont): CardTextMeasurement;
  getVersion(): number;
  subscribe(listener: () => void): () => void;
  /** Invalidate after font/resource changes outside FontFaceSet events. */
  invalidate(): void;
  whenReady(): Promise<number>;
  snapshot(): CardTextMeasurementSnapshot;
  dispose(): void;
}

const FONT_EVENTS = ["loading", "loadingdone", "loadingerror"] as const;

function normalizedFont(font: CardTextMeasurementFont): Required<CardTextMeasurementFont> {
  const fontSize = Number.isFinite(font.fontSize) && font.fontSize > 0 ? font.fontSize : 12;
  const candidate = String(font.fontWeight ?? 400).trim();
  const weight = /^(normal|bold|bolder|lighter)$/u.test(candidate)
    || (/^\d+(?:\.\d+)?$/u.test(candidate) && Number(candidate) >= 1 && Number(candidate) <= 1000)
    ? candidate : "400";
  return { fontFamily: font.fontFamily?.trim() || "sans-serif", fontSize, fontWeight: weight };
}

export function cardTextMeasurementKey(text: string, font: CardTextMeasurementFont): string {
  const normalized = normalizedFont(font);
  return JSON.stringify([normalized.fontFamily, normalized.fontSize, normalized.fontWeight, text]);
}

/** Deterministic fallback shared by browser, Node and Worker; it does not claim font accuracy. */
export function estimateCardTextWidth(text: string, fontSize: number): number {
  const size = Number.isFinite(fontSize) && fontSize > 0 ? fontSize : 12;
  return Array.from(text).reduce((width, character) => {
    if (/\s/u.test(character)) return width + size * 0.35;
    return width + size * ((character.codePointAt(0) ?? 0) <= 0xff ? 0.58 : 1);
  }, 0);
}

export function measureCardTextFromSnapshot(
  snapshot: CardTextMeasurementSnapshot,
  text: string,
  font: CardTextMeasurementFont,
): CardTextMeasurement {
  const saved = snapshot.entries[cardTextMeasurementKey(text, font)];
  if (saved && Number.isFinite(saved.width) && saved.width >= 0
    && (saved.status === "estimated" || saved.status === "measured")) {
    return { ...saved, version: snapshot.version };
  }
  return { width: estimateCardTextWidth(text, font.fontSize), status: "estimated", version: snapshot.version };
}

function browserContext(): MeasurementContext | null {
  // jsdom exposes <canvas> without a rendering implementation. Avoid calling its noisy stub.
  if (typeof document === "undefined" || typeof CanvasRenderingContext2D === "undefined") return null;
  try {
    return document.createElement("canvas").getContext("2d");
  } catch {
    return null;
  }
}

/** A bounded font-aware cache. Each font load invalidates widths and advances the scene's font version. */
export function createCardTextMeasurer(options: CardTextMeasurerOptions = {}): CardTextMeasurer {
  const fonts = options.fonts === undefined
    ? (typeof document === "undefined" ? undefined : document.fonts)
    : options.fonts;
  const limit = Math.max(1, Math.floor(Number.isFinite(options.maxEntries) ? options.maxEntries! : 8192));
  const cache = new Map<string, CardTextMeasurement>();
  const listeners = new Set<() => void>();
  let version = 0;
  let disposed = false;
  let context: MeasurementContext | null | undefined;
  const invalidate = () => {
    if (disposed) return;
    cache.clear();
    version += 1;
    for (const listener of listeners) listener();
  };
  const onFontChange: EventListener = invalidate;
  for (const event of FONT_EVENTS) fonts?.addEventListener?.(event, onFontChange);
  if (fonts?.ready) Promise.resolve(fonts.ready).then(invalidate, invalidate);

  const fontReady = (cssFont: string, text: string) => {
    if (fonts?.status === "loading") return false;
    try {
      return fonts?.check?.(cssFont, text) !== false;
    } catch {
      return false;
    }
  };

  return {
    measure(text, font) {
      const key = cardTextMeasurementKey(text, font);
      const cached = !disposed && cache.get(key);
      if (cached) {
        cache.delete(key);
        cache.set(key, cached);
        return { ...cached };
      }
      let result: CardTextMeasurement = { width: estimateCardTextWidth(text, font.fontSize), status: "estimated", version };
      if (!disposed) {
        const normalized = normalizedFont(font);
        const cssFont = `${normalized.fontWeight} ${normalized.fontSize}px ${normalized.fontFamily}`;
        if (fontReady(cssFont, text)) {
          try {
            context ??= (options.createContext ?? browserContext)() ?? null;
            if (context) {
              context.font = cssFont;
              const width = context.measureText(text).width;
              if (Number.isFinite(width) && width >= 0) result = { width, status: "measured", version };
            }
          } catch {
            // A missing/failed canvas uses the same explicitly estimated result as Node.
          }
        }
        cache.set(key, result);
        while (cache.size > limit) cache.delete(cache.keys().next().value!);
      }
      return { ...result };
    },
    getVersion: () => version,
    subscribe(listener) {
      if (disposed) return () => {};
      listeners.add(listener);
      return () => { listeners.delete(listener); };
    },
    invalidate,
    async whenReady() {
      try {
        await fonts?.ready;
      } catch {
        // Failure leaves an estimated width available; it does not block the editor.
      }
      return version;
    },
    snapshot: () => ({ version, entries: Object.fromEntries(Array.from(cache, ([key, result]) => [key, { width: result.width, status: result.status }])) }),
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const event of FONT_EVENTS) fonts?.removeEventListener?.(event, onFontChange);
      cache.clear();
      listeners.clear();
      context = null;
    },
  };
}
