/** Normalized rect in [0,1] image coordinates. */
export interface NormalizedRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Image placement inside map-local pixel space (0..mapWidth/Height). */
export interface MapImageAlignment {
  sourceWidth: number;
  sourceHeight: number;
  /** Effective map content inside the source image (normalized). */
  sourceBounds: NormalizedRect;
  /** Where the *content bounds* land in map-local space. */
  x: number;
  y: number;
  width: number;
  height: number;
  /** Degrees, around content center. */
  rotation: number;
}

export interface AffineMatrix {
  a: number;
  b: number;
  c: number;
  d: number;
  e: number;
  f: number;
  residual: number;
}

export interface ControlPointPair {
  source: { x: number; y: number };
  target: { x: number; y: number };
}

export type FitMode = "contain" | "cover" | "stretch";

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}

export function normalizeSourceBounds(bounds?: Partial<NormalizedRect> | null): NormalizedRect {
  const width = Number.isFinite(bounds?.width) ? Math.min(1, Math.max(0.001, Number(bounds?.width))) : 1;
  const height = Number.isFinite(bounds?.height) ? Math.min(1, Math.max(0.001, Number(bounds?.height))) : 1;
  const x = clamp01(Number(bounds?.x ?? 0));
  const y = clamp01(Number(bounds?.y ?? 0));
  return {
    x: Math.min(x, 1 - width),
    y: Math.min(y, 1 - height),
    width,
    height,
  };
}

export function autoFitAlignment(input: {
  mapWidth: number;
  mapHeight: number;
  sourceWidth: number;
  sourceHeight: number;
  sourceBounds?: Partial<NormalizedRect> | null;
  mode?: FitMode;
}): MapImageAlignment {
  const mapWidth = Math.max(1, input.mapWidth);
  const mapHeight = Math.max(1, input.mapHeight);
  const sourceWidth = Math.max(1, input.sourceWidth);
  const sourceHeight = Math.max(1, input.sourceHeight);
  const sourceBounds = normalizeSourceBounds(input.sourceBounds);
  const mode = input.mode ?? "contain";

  const contentAspect = (sourceBounds.width * sourceWidth) / (sourceBounds.height * sourceHeight);
  const mapAspect = mapWidth / mapHeight;

  let width = mapWidth;
  let height = mapHeight;

  if (mode === "stretch") {
    // keep map frame size
  } else if (mode === "contain") {
    if (contentAspect > mapAspect) {
      width = mapWidth;
      height = mapWidth / contentAspect;
    } else {
      height = mapHeight;
      width = mapHeight * contentAspect;
    }
  } else {
    // cover
    if (contentAspect > mapAspect) {
      height = mapHeight;
      width = mapHeight * contentAspect;
    } else {
      width = mapWidth;
      height = mapWidth / contentAspect;
    }
  }

  return {
    sourceWidth,
    sourceHeight,
    sourceBounds,
    x: (mapWidth - width) / 2,
    y: (mapHeight - height) / 2,
    width,
    height,
    rotation: 0,
  };
}

/**
 * Resolve the raw <image> element x/y/width/height so that sourceBounds maps
 * exactly onto alignment.x/y/width/height.
 */
export function mapImageElementPlacement(alignment: MapImageAlignment): {
  x: number;
  y: number;
  width: number;
  height: number;
} {
  const bounds = normalizeSourceBounds(alignment.sourceBounds);
  const contentW = Math.max(0.001, bounds.width);
  const contentH = Math.max(0.001, bounds.height);
  const width = alignment.width / contentW;
  const height = alignment.height / contentH;
  const x = alignment.x - bounds.x * width;
  const y = alignment.y - bounds.y * height;
  return { x, y, width, height };
}

export function mapImageTransform(alignment: MapImageAlignment): string {
  const rotation = Number.isFinite(alignment.rotation) ? alignment.rotation : 0;
  if (Math.abs(rotation) < 0.001) return "";
  const cx = alignment.x + alignment.width / 2;
  const cy = alignment.y + alignment.height / 2;
  return `translate(${cx} ${cy}) rotate(${rotation}) translate(${-cx} ${-cy})`;
}

/**
 * Solve affine transform mapping source→target for 3+ point pairs.
 * x' = a*x + c*y + e
 * y' = b*x + d*y + f
 */
export function affineFromControlPoints(pairs: readonly ControlPointPair[]): AffineMatrix | null {
  if (pairs.length < 3) return null;

  // Build normal equations for least squares over 6 unknowns [a,c,e,b,d,f]
  // For each point: [x y 1 0 0 0; 0 0 0 x y 1] * params = [x'; y']
  const ATA = Array.from({ length: 6 }, () => Array.from({ length: 6 }, () => 0));
  const ATb = Array.from({ length: 6 }, () => 0);

  const addRow = (row: number[], value: number) => {
    for (let i = 0; i < 6; i += 1) {
      ATb[i]! += row[i]! * value;
      for (let j = 0; j < 6; j += 1) {
        ATA[i]![j]! += row[i]! * row[j]!;
      }
    }
  };

  for (const pair of pairs) {
    const { x, y } = pair.source;
    const tx = pair.target.x;
    const ty = pair.target.y;
    addRow([x, 0, y, 0, 1, 0], tx);
    addRow([0, x, 0, y, 0, 1], ty);
  }

  const params = solveLinearSystem(ATA, ATb);
  if (!params) return null;

  const [a, b, c, d, e, f] = params;
  // Reject near-singular transforms (collinear sources)
  const det = a! * d! - b! * c!;
  if (!Number.isFinite(det) || Math.abs(det) < 1e-8) return null;

  let residualSum = 0;
  for (const pair of pairs) {
    const px = a! * pair.source.x + c! * pair.source.y + e!;
    const py = b! * pair.source.x + d! * pair.source.y + f!;
    residualSum += (px - pair.target.x) ** 2 + (py - pair.target.y) ** 2;
  }

  return {
    a: a!,
    b: b!,
    c: c!,
    d: d!,
    e: e!,
    f: f!,
    residual: Math.sqrt(residualSum / pairs.length),
  };
}

function solveLinearSystem(A: number[][], b: number[]): number[] | null {
  const n = b.length;
  const M = A.map((row, i) => [...row, b[i]!]);

  for (let col = 0; col < n; col += 1) {
    let pivot = col;
    for (let row = col + 1; row < n; row += 1) {
      if (Math.abs(M[row]![col]!) > Math.abs(M[pivot]![col]!)) pivot = row;
    }
    if (Math.abs(M[pivot]![col]!) < 1e-10) return null;
    if (pivot !== col) {
      const tmp = M[col]!;
      M[col] = M[pivot]!;
      M[pivot] = tmp;
    }
    const div = M[col]![col]!;
    for (let j = col; j <= n; j += 1) M[col]![j]! /= div;
    for (let row = 0; row < n; row += 1) {
      if (row === col) continue;
      const factor = M[row]![col]!;
      for (let j = col; j <= n; j += 1) M[row]![j]! -= factor * M[col]![j]!;
    }
  }

  return M.map((row) => row[n]!);
}

/** Convert a simple axis-aligned affine (no shear) into MapImageAlignment placement of full image. */
export function alignmentFromAxisAlignedAffine(input: {
  sourceWidth: number;
  sourceHeight: number;
  sourceBounds?: Partial<NormalizedRect> | null;
  /** Maps full image unit square (0..1) corners via x' = sx*x + tx, y' = sy*y + ty */
  scaleX: number;
  scaleY: number;
  translateX: number;
  translateY: number;
  rotation?: number;
}): MapImageAlignment {
  const sourceBounds = normalizeSourceBounds(input.sourceBounds);
  const contentX = input.translateX + sourceBounds.x * input.scaleX;
  const contentY = input.translateY + sourceBounds.y * input.scaleY;
  const contentW = sourceBounds.width * input.scaleX;
  const contentH = sourceBounds.height * input.scaleY;
  return {
    sourceWidth: Math.max(1, input.sourceWidth),
    sourceHeight: Math.max(1, input.sourceHeight),
    sourceBounds,
    x: contentX,
    y: contentY,
    width: contentW,
    height: contentH,
    rotation: input.rotation ?? 0,
  };
}
