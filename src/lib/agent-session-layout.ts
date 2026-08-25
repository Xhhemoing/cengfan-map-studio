/**
 * Layout-facing helpers for the AI agent's `auto_layout` and `check_layout` tools.
 *
 * These used to live in `agent-session.ts` with an obstacle set of their own: the guest
 * panel at a hard-coded 120px, and nothing at all for poster texts or decorations. The
 * canvas meanwhile avoided all three, so asking the assistant to re-run auto-layout
 * silently produced a board the canvas would never have produced — cards parked on top of
 * a title or a sticker, and a guest panel either clipped or over-reserved.
 *
 * Both callers now build obstacles from {@link collectElementObstacles} and measure the
 * guest panel with {@link computeGuestPanelLayout}, so the AI path and the canvas path see
 * the same board. The two `禁止遮挡` switches keep the same split as the canvas:
 * `allowMapOverlap` releases the map frame, `allowElementOverlap` releases this set.
 */

import { solveCardLayout, type CardLayoutBounds, type CardLayoutInput, type CardLayoutMode, type CardPlacement } from "./card-layout";
import { collectElementObstacles } from "./card-layout-element-obstacles";
import { computeGuestPanelLayout, DEFAULT_GUEST_PANEL } from "./guest-panel-layout";
import type { LayoutHealthInput, LayoutHealthObject } from "./layout-health";
import type { ProjectDocument } from "./project-document";
import { buildProvinceSummary } from "./project-data";

/** Map content rect in canvas pixels, the frame both the solver and the health check protect. */
function mapBounds(project: ProjectDocument) {
  return {
    x: project.map.x,
    y: project.map.y,
    width: project.map.width * project.map.scale,
    height: project.map.height * project.map.scale,
  };
}

/** Guest panel box at the height it actually renders at, or null when the panel is hidden. */
function guestObstacle(project: ProjectDocument) {
  const guests = project.guests ?? DEFAULT_GUEST_PANEL;
  if (guests.visibility === false) return null;
  const layout = computeGuestPanelLayout(guests, project.canvas.lineHeight ?? 1);
  return { x: guests.x, y: guests.y, width: guests.width, height: layout.height };
}

/** The same non-map obstacles `PosterCanvas` hands the solver, built from the shadow document. */
export function layoutElementAreas(project: ProjectDocument) {
  return collectElementObstacles({
    texts: project.textElements,
    decorations: project.assetElements.filter((asset) => asset.kind === "decoration"),
    guests: guestObstacle(project),
  });
}

function groupCards(project: ProjectDocument): CardLayoutInput[] {
  const summary = buildProvinceSummary(project.students);
  const map = mapBounds(project);
  const mapCenterX = project.map.x + map.width / 2;
  const mapCenterY = project.map.y + map.height / 2;
  const maxWidth = Math.max(120, project.cards.maxWidth);
  return summary.map((group, index) => ({
    id: group.province,
    anchorX: mapCenterX + Math.cos(index * 1.7) * map.width * 0.28,
    anchorY: mapCenterY + Math.sin(index * 1.7) * map.height * 0.28,
    width: maxWidth,
    height: Math.max(72, project.cards.fontSize * Math.max(2, Math.min(group.students.length + 1, 6))),
  }));
}

export function runAutoLayout(
  project: ProjectDocument,
  mode: string,
): { project: ProjectDocument; placements: CardPlacement[] } {
  const bounds: CardLayoutBounds = {
    width: project.canvas.width,
    height: project.canvas.height,
    map: mapBounds(project),
    margin: project.canvas.safeMargin,
    gap: Math.max(10, project.cards.gap),
    // Elements go in the set the element switch relaxes; an unset occupiedAreas keeps the
    // map frame protected unless the map switch is on.
    elementAreas: layoutElementAreas(project),
    allowMapOverlap: project.cards.allowMapOverlap === true,
    allowElementOverlap: project.cards.allowElementOverlap === true,
  };
  const result = solveCardLayout(groupCards(project), bounds, {
    mode: (mode || project.cards.layoutMode || "quadrant") as CardLayoutMode,
    autoBalance: project.cards.autoBalance !== false,
    connectorStyle: project.cards.connectorStyle,
    connectorWidth: project.cards.connectorWidth,
  });
  const positions = Object.fromEntries(result.placements.map((placement) => [placement.id, { x: placement.x, y: placement.y }]));
  return {
    project: { ...project, cards: { ...project.cards, positions } },
    placements: result.placements,
  };
}

export function healthInput(project: ProjectDocument): LayoutHealthInput {
  const guestBox = guestObstacle(project);
  const objects: LayoutHealthObject[] = [
    { id: "map", kind: "map", zIndex: project.map.zIndex, bounds: mapBounds(project) },
    { id: "cards", kind: "card", zIndex: project.cards.zIndex, bounds: { x: project.cards.x, y: project.cards.y, width: project.cards.maxWidth, height: 180 } },
    ...(guestBox ? [{ id: "guests", kind: "guests" as const, zIndex: 20, bounds: guestBox }] : []),
    ...project.textElements.map((text) => ({
      id: text.id,
      kind: "text" as const,
      zIndex: 40,
      bounds: { x: text.x, y: text.y - text.fontSize, width: text.maxWidth, height: text.fontSize * 1.3 },
      visible: text.visibility,
      content: text.content,
      textColor: text.color,
      backgroundColor: project.canvas.backgroundColor,
    })),
    ...project.assetElements.map((asset) => ({ id: asset.id, kind: "asset" as const, zIndex: asset.zIndex, bounds: { x: asset.x, y: asset.y, width: asset.width, height: asset.height }, visible: asset.visibility })),
  ];
  return { canvas: { width: project.canvas.width, height: project.canvas.height, safeMargin: project.canvas.safeMargin }, objects, cardsPositions: project.cards.positions };
}
