import { createRoot, type Root } from "react-dom/client";
import { flushSync } from "react-dom";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ProjectDocument } from "./lib/project-document";
import type { SceneSelection } from "./lib/scene-document";
import { LEGACY_EDITOR_STORAGE_KEY } from "./lib/workspace-session";

interface CapturedCanvasProps {
  project: ProjectDocument;
  onSelect?: (selection: SceneSelection) => void;
  onMoveText?: (id: string, x: number, y: number) => void;
  onMoveAsset?: (id: string, x: number, y: number) => void;
  onResizeAsset?: (id: string, x: number, y: number, width: number, height: number) => void;
  onMoveCard?: (id: string, x: number, y: number) => void;
  onMoveGuests?: (x: number, y: number) => void;
  onMoveProvinceTexture?: (province: string, offsetX: number, offsetY: number) => void;
  onResizeMapImage?: (alignment: { x: number; y: number; width: number; height: number; rotation: number }) => void;
  onCardPositionsResolved?: (positions: Record<string, { x: number; y: number }>) => void;
}

const captured = vi.hoisted(() => ({ props: [] as CapturedCanvasProps[] }));

vi.mock("./components/canvas/PosterCanvas", () => ({
  PosterCanvas: (props: CapturedCanvasProps) => {
    captured.props.push(props);
    return <svg data-poster-canvas-stub />;
  },
}));

import { App } from "./App";

const CALLBACK_PROPS = [
  "onSelect",
  "onMoveText",
  "onMoveAsset",
  "onResizeAsset",
  "onMoveCard",
  "onMoveGuests",
  "onMoveProvinceTexture",
  "onResizeMapImage",
  "onCardPositionsResolved",
] as const;

const roots: Array<{ root: Root; container: HTMLDivElement }> = [];

function latest(): CapturedCanvasProps {
  const props = captured.props[captured.props.length - 1];
  if (!props) throw new Error("PosterCanvas was never rendered");
  return props;
}

function renderLegacyApp(): void {
  window.localStorage.clear();
  window.localStorage.setItem(LEGACY_EDITOR_STORAGE_KEY, "1");
  const container = document.createElement("div");
  document.body.append(container);
  const root = createRoot(container);
  roots.push({ root, container });
  flushSync(() => root.render(<App />));
}

function expectSameCallbacks(before: CapturedCanvasProps, after: CapturedCanvasProps): void {
  for (const name of CALLBACK_PROPS) {
    expect(typeof after[name], `${name} should be provided`).toBe("function");
    expect(after[name], `${name} identity should survive the re-render`).toBe(before[name]);
  }
}

beforeEach(() => {
  captured.props = [];
});

afterEach(() => {
  while (roots.length > 0) {
    const entry = roots.pop()!;
    flushSync(() => entry.root.unmount());
    entry.container.remove();
  }
});

describe("App canvas callback identity", () => {
  it("keeps every PosterCanvas callback stable across selection and commit re-renders", () => {
    renderLegacyApp();
    const initial = latest();

    // Selecting the map only moves App state that the canvas reads as data, so the
    // callbacks must not be rebuilt and invalidate the canvas' memoized layers.
    flushSync(() => initial.onSelect?.({ type: "map" }));
    const afterSelect = latest();
    expect(afterSelect).not.toBe(initial);
    expectSameCallbacks(initial, afterSelect);

    flushSync(() => afterSelect.onMoveCard?.("province-北京市", 40, 60));
    const afterCommit = latest();
    expect(afterCommit.project).not.toBe(initial.project);
    expectSameCallbacks(initial, afterCommit);
  });

  it("commits canvas moves against the latest project document", () => {
    renderLegacyApp();

    flushSync(() => latest().onMoveCard?.("province-北京市", 40.4, 60.6));
    expect(latest().project.cards.positions?.["province-北京市"]).toEqual({ x: 40, y: 61 });

    // The second commit must see the first one; a callback frozen on the mount-time
    // project would silently drop it.
    flushSync(() => latest().onMoveCard?.("province-浙江省", 120, 240));
    expect(latest().project.cards.positions).toMatchObject({
      "province-北京市": { x: 40, y: 61 },
      "province-浙江省": { x: 120, y: 240 },
    });

    flushSync(() => latest().onMoveGuests?.(88, 640));
    expect(latest().project.guests).toMatchObject({ x: 88, y: 640 });
    expect(latest().project.cards.positions?.["province-浙江省"]).toEqual({ x: 120, y: 240 });
  });
});
