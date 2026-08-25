import { describe, expect, it } from "vitest";
import { flushSync } from "react-dom";
import { PosterCanvas } from "./PosterCanvas";
import { createProjectDocument } from "../../lib/project-document";
import { installPosterCanvasTestHarness, students, trackedRoot } from "./poster-canvas-test-harness";

installPosterCanvasTestHarness();

describe("PosterCanvas connectors", () => {
  it("anchors a province connector to its projected administrative center", () => {
    const project = createProjectDocument({ students, templateId: "original", dataView: "province" });
    const { container, root } = trackedRoot();
    flushSync(() => root.render(<PosterCanvas project={project} exportMode />));

    const anchor = container.querySelector<SVGCircleElement>('[data-destination-anchor="北京市"]')!;
    expect(Number(anchor.getAttribute("cx"))).toBeCloseTo(889.58, 1);
    expect(Number(anchor.getAttribute("cy"))).toBeCloseTo(351.56, 1);
    expect(Math.abs(Number(anchor.getAttribute("cy")) - 347.26)).toBeGreaterThan(4);
  });

  it("runs borderless connectors to the card center and hides them under transparent fills", () => {
    const project = createProjectDocument({ students, templateId: "original", dataView: "province" });
    project.cards = { ...project.cards, preset: "borderless" };
    const { container, root } = trackedRoot();
    flushSync(() => root.render(<PosterCanvas project={project} exportMode />));

    const connector = container.querySelector<SVGPathElement>("[data-destination-connector]")!;
    const key = connector.getAttribute("data-destination-connector")!;
    const card = container.querySelector<SVGGElement>(`[data-destination-card="${key}"]`)!;
    const [, x, y] = card.getAttribute("transform")!.match(/translate\(([^ ]+) ([^)]+)\)/)!;
    const rect = card.querySelector("rect")!;
    const centerX = Number(x) + Number(rect.getAttribute("width")) / 2;
    const centerY = Number(y) + Number(rect.getAttribute("height")) / 2;
    const match = connector.getAttribute("d")!.match(/^M([-\d.]+) ([-\d.]+) L/);
    expect(Number(match?.[1])).toBeCloseTo(centerX, 3);
    expect(Number(match?.[2])).toBeCloseTo(centerY, 3);

    // Transparent fill: the line would cross the card text, so it is hidden entirely.
    project.cards = { ...project.cards, opacity: 0.5 };
    flushSync(() => root.render(<PosterCanvas project={project} exportMode />));
    expect(container.querySelector("[data-destination-connector]")).toBeNull();

    // Non-borderless presets keep the boundary connector regardless of opacity.
    project.cards = { ...project.cards, preset: "standard", opacity: 0.5 };
    flushSync(() => root.render(<PosterCanvas project={project} exportMode />));
    expect(container.querySelector("[data-destination-connector]")).not.toBeNull();
  });

  it("renders the selected connector path style", () => {
    const project = createProjectDocument({ students, templateId: "original", dataView: "province" });
    project.cards = { ...project.cards, connectorStyle: "straight" };
    const { container, root } = trackedRoot();
    flushSync(() => root.render(<PosterCanvas project={project} exportMode />));

    const connector = container.querySelector<SVGPathElement>("[data-destination-connector]")!;
    expect(connector.getAttribute("data-connector-style")).toBe("straight");
    expect(connector.getAttribute("d")).not.toContain("C");
  });

  it("renders connector color width and dash settings from the card scene", () => {
    const project = createProjectDocument({ students, templateId: "original", dataView: "province" });
    project.cards = { ...project.cards, connectorColor: "#123456", connectorWidth: 3, connectorDash: "dotted" };
    const { container, root } = trackedRoot();
    flushSync(() => root.render(<PosterCanvas project={project} exportMode />));

    const connector = container.querySelector<SVGPathElement>("[data-destination-connector]")!;
    expect(connector.getAttribute("stroke")).toBe("#123456");
    expect(connector.getAttribute("data-connector-dash")).toBe("dotted");
    expect(connector.getAttribute("stroke-dasharray")).toBeTruthy();
  });

  it("renders province-style textures on connectors", () => {
    const project = createProjectDocument({ students, templateId: "original", dataView: "province" });
    project.cards = { ...project.cards, connectorDash: "rail", connectorWidth: 2 };
    const { container, root } = trackedRoot();
    flushSync(() => root.render(<PosterCanvas project={project} exportMode />));

    const connector = container.querySelector<SVGPathElement>("[data-destination-connector]")!;
    expect(connector.getAttribute("data-connector-dash")).toBe("rail");
    expect(container.querySelector("[data-destination-connector-underlay]")).not.toBeNull();
  });
});
