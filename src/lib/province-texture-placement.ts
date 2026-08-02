export interface TextureRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface TexturePlacementBounds extends TextureRect {}

export interface ProvinceTexturePlacement {
  id: string;
  anchor: [number, number];
  rect: TextureRect;
  /** Only visible overflow textures participate in collision avoidance. */
  avoidOverlap?: boolean;
  /** Keep this overflow texture at its manual position while automatic textures avoid it. */
  fixed?: boolean;
}

export interface ResolvedProvinceTexturePlacement extends ProvinceTexturePlacement {
  adjusted: boolean;
}

const DEFAULT_GAP = 4;

export function textureRectsOverlap(
  first: TextureRect,
  second: TextureRect,
  gap = DEFAULT_GAP,
): boolean {
  return !(
    first.x + first.width + gap <= second.x
    || second.x + second.width + gap <= first.x
    || first.y + first.height + gap <= second.y
    || second.y + second.height + gap <= first.y
  );
}

function clampRect(rect: TextureRect, bounds: TexturePlacementBounds): TextureRect {
  const maxX = bounds.x + Math.max(0, bounds.width - rect.width);
  const maxY = bounds.y + Math.max(0, bounds.height - rect.height);
  return {
    ...rect,
    x: Math.min(maxX, Math.max(bounds.x, rect.x)),
    y: Math.min(maxY, Math.max(bounds.y, rect.y)),
  };
}

function overlapArea(first: TextureRect, second: TextureRect, gap: number): number {
  const width = Math.max(0, Math.min(first.x + first.width, second.x + second.width + gap)
    - Math.max(first.x, second.x - gap));
  const height = Math.max(0, Math.min(first.y + first.height, second.y + second.height + gap)
    - Math.max(first.y, second.y - gap));
  return width * height;
}

function candidateRects(
  rect: TextureRect,
  bounds: TexturePlacementBounds,
  step: number,
  obstacles: readonly TextureRect[],
  gap: number,
): TextureRect[] {
  const candidates = new Map<string, TextureRect>();
  const add = (x: number, y: number) => {
    const candidate = clampRect({ ...rect, x, y }, bounds);
    candidates.set(`${candidate.x.toFixed(4)}:${candidate.y.toFixed(4)}`, candidate);
  };
  add(rect.x, rect.y);

  for (const obstacle of obstacles) {
    add(obstacle.x - rect.width - gap, rect.y);
    add(obstacle.x + obstacle.width + gap, rect.y);
    add(rect.x, obstacle.y - rect.height - gap);
    add(rect.x, obstacle.y + obstacle.height + gap);
    add(obstacle.x - rect.width - gap, obstacle.y - rect.height - gap);
    add(obstacle.x + obstacle.width + gap, obstacle.y - rect.height - gap);
    add(obstacle.x - rect.width - gap, obstacle.y + obstacle.height + gap);
    add(obstacle.x + obstacle.width + gap, obstacle.y + obstacle.height + gap);
  }

  const maxRadius = Math.min(48, Math.ceil(Math.hypot(bounds.width, bounds.height) / step));
  for (let ring = 1; ring <= maxRadius; ring += 1) {
    const radius = ring * step;
    const samples = 16;
    for (let index = 0; index < samples; index += 1) {
      const angle = index / samples * Math.PI * 2;
      add(rect.x + Math.cos(angle) * radius, rect.y + Math.sin(angle) * radius);
    }
  }

  return [...candidates.values()].sort((first, second) => {
    const firstDistance = (first.x - rect.x) ** 2 + (first.y - rect.y) ** 2;
    const secondDistance = (second.x - rect.x) ** 2 + (second.y - rect.y) ** 2;
    return firstDistance - secondDistance || first.y - second.y || first.x - second.x;
  });
}

function sameRect(first: TextureRect, second: TextureRect): boolean {
  return first.x === second.x
    && first.y === second.y
    && first.width === second.width
    && first.height === second.height;
}

/**
 * Deterministically keeps visible overflow texture rectangles apart. Placements
 * that opt out remain fixed and do not affect the overflow layout.
 */
export function resolveProvinceTexturePlacements(
  placements: readonly ProvinceTexturePlacement[],
  bounds: TexturePlacementBounds,
  gap = DEFAULT_GAP,
): ResolvedProvinceTexturePlacement[] {
  const fixed = placements
    .filter((placement) => placement.avoidOverlap !== false && placement.fixed === true)
    .sort((first, second) => first.id.localeCompare(second.id));
  const ordered = placements
    .filter((placement) => placement.avoidOverlap !== false && placement.fixed !== true)
    .sort((first, second) => (
      first.anchor[1] - second.anchor[1]
      || first.anchor[0] - second.anchor[0]
      || first.id.localeCompare(second.id)
    ));
  const resolved: ResolvedProvinceTexturePlacement[] = placements
    .filter((placement) => placement.avoidOverlap === false)
    .map((placement) => ({ ...placement, adjusted: false }));
  const collisionResolved: ResolvedProvinceTexturePlacement[] = fixed
    .map((placement) => ({ ...placement, adjusted: false }));
  resolved.push(...collisionResolved);

  for (const placement of ordered) {
    const step = Math.max(4, Math.min(placement.rect.width, placement.rect.height) / 6);
    const candidates = candidateRects(
      placement.rect,
      bounds,
      step,
      collisionResolved.map((item) => item.rect),
      gap,
    );
    const collisionFree = candidates.find((candidate) => (
      collisionResolved.every((other) => !textureRectsOverlap(candidate, other.rect, gap))
    ));
    const chosen = collisionFree ?? candidates.reduce((best, candidate) => {
      const score = collisionResolved.reduce((sum, other) => sum + overlapArea(candidate, other.rect, gap), 0);
      const bestScore = collisionResolved.reduce((sum, other) => sum + overlapArea(best, other.rect, gap), 0);
      if (score !== bestScore) return score < bestScore ? candidate : best;
      const distance = (candidate.x - placement.rect.x) ** 2 + (candidate.y - placement.rect.y) ** 2;
      const bestDistance = (best.x - placement.rect.x) ** 2 + (best.y - placement.rect.y) ** 2;
      return distance < bestDistance ? candidate : best;
    }, candidates[0] ?? placement.rect);

    const resolvedPlacement = {
      ...placement,
      rect: chosen,
      adjusted: !sameRect(chosen, placement.rect),
    };
    collisionResolved.push(resolvedPlacement);
    resolved.push(resolvedPlacement);
  }

  const byId = new Map(resolved.map((placement) => [placement.id, placement]));
  return placements.map((placement) => byId.get(placement.id)!);
}
