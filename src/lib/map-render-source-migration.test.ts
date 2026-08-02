import { describe, expect, it } from "vitest";
import { migrateProjectPayload } from "./project-migration";
import { normalizeScene, type SceneDocument } from "./scene-document";
import { createProjectDocument } from "./project-document";

describe("map source migration", () => {
  it("restores a valid uploaded image map source and falls back to vector for invalid sources", () => {
    const imageProject = migrateProjectPayload({
      schemaVersion: 2,
      templateId: "original",
      map: {
        renderSource: {
          kind: "image",
          assetId: "map-photo",
          src: "[screenshot]",
          fit: "contain",
          opacity: 0.7,
        },
      },
    });
    const invalidProject = migrateProjectPayload({
      schemaVersion: 2,
      templateId: "original",
      map: { renderSource: { kind: "image", src: 42 } },
    });

    expect(imageProject.map.renderSource).toEqual({
      kind: "image",
      assetId: "map-photo",
      src: "[screenshot]",
      fit: "contain",
      opacity: 0.7,
      composition: "replace",
      clipToMap: false,
      zIndex: 25,
    });
    expect(invalidProject.map.renderSource).toEqual({ kind: "vector" });
  });

  it("preserves image alignment, composition and clipToMap when migrating", () => {
    const project = migrateProjectPayload({
      schemaVersion: 2,
      templateId: "original",
      map: {
        renderSource: {
          kind: "image",
          assetId: "map-photo",
          src: "data:image/png;base64,abc",
          fit: "cover",
          opacity: 0.8,
          composition: "overlay",
          clipToMap: true,
          alignment: {
            sourceWidth: 1200,
            sourceHeight: 800,
            sourceBounds: { x: 0.1, y: 0.05, width: 0.8, height: 0.9 },
            x: 20,
            y: 30,
            width: 760,
            height: 640,
            rotation: 2.5,
          },
        },
      },
    });

    expect(project.map.renderSource).toEqual({
      kind: "image",
      assetId: "map-photo",
      src: "data:image/png;base64,abc",
      fit: "cover",
      opacity: 0.8,
      composition: "overlay",
      clipToMap: true,
      zIndex: 25,
      alignment: {
        sourceWidth: 1200,
        sourceHeight: 800,
        sourceBounds: { x: 0.1, y: 0.05, width: 0.8, height: 0.9 },
        x: 20,
        y: 30,
        width: 760,
        height: 640,
        rotation: 2.5,
      },
    });
  });

  it("normalizes partial alignment and clamps invalid composition", () => {
    const base = createProjectDocument({ students: [], templateId: "original", dataView: "province" });
    const scene = normalizeScene({
      ...base,
      map: {
        ...base.map,
        renderSource: {
          kind: "image",
          assetId: "a",
          src: "x",
          fit: "contain",
          opacity: 2,
          composition: "nope" as never,
          clipToMap: true,
          alignment: {
            sourceWidth: 100,
            sourceHeight: 50,
            sourceBounds: { x: -1, y: 0.2, width: 2, height: 0.5 },
            x: 10,
            y: 5,
            width: 200,
            height: 100,
            rotation: 400,
          },
        },
      },
    } as SceneDocument);

    expect(scene.map.renderSource).toMatchObject({
      kind: "image",
      opacity: 1,
      composition: "replace",
      clipToMap: true,
      alignment: {
        sourceWidth: 100,
        sourceHeight: 50,
        sourceBounds: { x: 0, y: 0.2, width: 1, height: 0.5 },
        x: 10,
        y: 5,
        width: 200,
        height: 100,
        rotation: 40,
      },
    });
  });
});
