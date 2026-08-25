/**
 * Shared plumbing for `perf-canvas-bench.ts`: sample timing, a jsdom global scope, and the
 * prepared-content wrap fixture. Kept out of the bench itself so that file stays a readable
 * list of probes.
 */
import { performance } from "node:perf_hooks";
import { JSDOM } from "jsdom";
import { medianDuration } from "../src/lib/canvas-render-metrics";
import type { CardTextFragment } from "../src/lib/card-text-layout";

let benchmarkSink: unknown;

/** Holds onto a probe's result so the optimizer cannot drop the work being measured. */
export function retain(value: unknown): void {
  benchmarkSink = value;
}

export function readSink(): unknown {
  return benchmarkSink;
}

export function printMeasurement(name: string, n: number, samples: readonly number[]): void {
  console.log(`name=${name} n=${n} ms=${medianDuration(samples).toFixed(3)}`);
}

export function measure(
  name: string,
  n: number,
  operation: () => unknown,
  sampleCount = 7,
): void {
  retain(operation());
  const samples: number[] = [];
  for (let sample = 0; sample < sampleCount; sample += 1) {
    const start = performance.now();
    retain(operation());
    samples.push(performance.now() - start);
  }
  printMeasurement(name, n, samples);
}

export function installDomGlobals(): () => void {
  const dom = new JSDOM("<!doctype html><html><body></body></html>", {
    pretendToBeVisual: true,
  });
  const globalValues: Record<string, unknown> = {
    window: dom.window,
    document: dom.window.document,
    navigator: dom.window.navigator,
    Node: dom.window.Node,
    Element: dom.window.Element,
    HTMLElement: dom.window.HTMLElement,
    SVGElement: dom.window.SVGElement,
    SVGSVGElement: dom.window.SVGSVGElement,
    Event: dom.window.Event,
    MouseEvent: dom.window.MouseEvent,
    getComputedStyle: dom.window.getComputedStyle.bind(dom.window),
    requestAnimationFrame: dom.window.requestAnimationFrame.bind(dom.window),
    cancelAnimationFrame: dom.window.cancelAnimationFrame.bind(dom.window),
  };
  const previousDescriptors = new Map(
    Object.keys(globalValues).map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]),
  );
  for (const [key, value] of Object.entries(globalValues)) {
    Object.defineProperty(globalThis, key, {
      configurable: true,
      writable: true,
      value,
    });
  }

  return () => {
    for (const [key, descriptor] of previousDescriptors) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else Reflect.deleteProperty(globalThis, key);
    }
    dom.window.close();
  };
}

export interface PreparedTextBatch {
  fragments: CardTextFragment[];
  maxWidth: number;
  fontSize: number;
}

interface PreparedBatchProject {
  cards: {
    fontSize: number;
    maxWidth: number;
    padding: number;
    horizontalPadding?: number;
    visibleFields: readonly ("title" | "name" | "university" | "city")[];
    fieldTypography?: Partial<Record<string, { fontSize?: number }>>;
  };
  canvas: { width: number; safeMargin: number };
}

interface PreparedBatchStudent {
  province: string;
  city: string;
  university: string;
  name: string;
}

/**
 * Mirrors the three text-wrap batches prepared per one-student province card: title, city
 * heading, and university/name body. Built outside the samples so the probe isolates the
 * wrapping cost rather than fixture construction.
 */
export function buildPreparedTextBatches(
  project: PreparedBatchProject,
  students: readonly PreparedBatchStudent[],
  bodyItemX: number | undefined,
): PreparedTextBatch[] {
  const horizontalPadding = bodyItemX ?? project.cards.horizontalPadding ?? project.cards.padding;
  // Typography-first chain, mirroring `cardFieldFontSize` in `prepared-card-content` — not the
  // flow cursor of `destinationCardFlowContentStart`, which ignores `fieldTypography` on purpose.
  const fieldFontSize = (field: "title" | "name" | "university" | "city") =>
    project.cards.fieldTypography?.[field]?.fontSize
    ?? (field === "city" ? Math.max(9, project.cards.fontSize - 1) : project.cards.fontSize);
  const rowFontSize = Math.max(...project.cards.visibleFields.map(fieldFontSize), fieldFontSize("city"));
  const titleFontSize = fieldFontSize("title");
  const cardWidth = Math.min(
    project.cards.maxWidth,
    Math.max(80, project.canvas.width - project.canvas.safeMargin * 2),
  );
  const contentWidth = Math.max(rowFontSize, cardWidth - horizontalPadding * 2);
  const titleWidth = Math.max(titleFontSize, contentWidth - Math.max(42, titleFontSize * 3));

  return students.flatMap((student) => [
    { fragments: [{ text: student.province, field: "title" as const }], maxWidth: titleWidth, fontSize: titleFontSize },
    { fragments: [{ text: student.city, field: "city" as const }], maxWidth: contentWidth, fontSize: fieldFontSize("city") },
    {
      fragments: [
        { text: student.university, field: "university" as const },
        { text: " · " },
        { text: student.name, field: "name" as const },
      ],
      maxWidth: contentWidth,
      fontSize: rowFontSize,
    },
  ]);
}
