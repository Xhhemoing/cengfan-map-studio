import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { PosterCanvas } from "./PosterCanvas";
import { createSampleProject } from "../../lib/project-store";
import { resolveProjectScene, type ResolvedProjectScene } from "../../lib/resolved-scene";
import { getCardScopeKey } from "../../lib/card-settings-scope";

const mounted: Array<{ root: Root; container: HTMLElement }> = [];
afterEach(() => {
  for (const { root, container } of mounted.splice(0)) { act(() => root.unmount()); container.remove(); }
});

describe("shared canvas scene contract", () => {
  it("reports exactly the card geometry, anchors and diagnostics used by standalone tools", () => {
    const project = createSampleProject().pack.project;
    project.cards = { ...project.cards, grouping: "university", presentation: "city-label" };
    const first = resolveProjectScene(project).cards[0]!.group.key;
    project.cards.styleOverrides = { [getCardScopeKey(project.cards, first)]: { fontSize: 18, fieldTypography: { name: { fontSize: 24 } } } };
    const report = vi.fn<(scene: ResolvedProjectScene) => void>();
    const container = document.createElement("div"); document.body.appendChild(container);
    const root = createRoot(container); mounted.push({ root, container });
    act(() => root.render(<PosterCanvas project={project} exportMode onSceneResolved={report} />));
    const rendered = report.mock.calls.at(-1)![0];
    const resolved = resolveProjectScene(project);
    expect(rendered.input.key).toBe(resolved.input.key);
    expect(rendered.cards).toEqual(resolved.cards);
    expect(rendered.healthInput).toEqual(resolved.healthInput);
    expect(rendered.diagnostics).toEqual(resolved.diagnostics);
    for (const card of rendered.cards) {
      expect(Array.from(container.querySelectorAll("[data-destination-card]")).find((element) => element.getAttribute("data-destination-card") === card.group.key)?.getAttribute("transform"))
        .toBe(`translate(${card.placement.x} ${card.placement.y})`);
    }
    expect(container.querySelector("svg.poster")?.getAttribute("data-layout-pending")).toBe("false");
  });
});
