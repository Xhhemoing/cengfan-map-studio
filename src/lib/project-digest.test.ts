import { describe, expect, it } from "vitest";
import { createProjectDocument } from "./project-document";
import { buildProjectDigest, digestByteLength } from "./project-digest";

describe("buildProjectDigest", () => {
  it("removes binary data from asset elements", () => {
    const project = createProjectDocument({ students: [], templateId: "original", dataView: "province" });
    const digest = buildProjectDigest({
      ...project,
      assetElements: [{
        id: "asset-element-1",
        assetId: "asset-1",
        label: "校徽",
        src: `data:image/png;base64,${"a".repeat(100_000)}`,
        kind: "decoration",
        x: 0,
        y: 0,
        width: 100,
        height: 100,
        rotation: 0,
        opacity: 1,
        zIndex: 30,
        visibility: true,
      }],
    });
    expect(digest.assetElements[0]?.src).toBe("<asset:asset-element-1>");
    expect(JSON.stringify(digest)).not.toContain("a".repeat(1_000));
  });

  it("aggregates students and retains manual-position information", () => {
    const project = createProjectDocument({ students: [], templateId: "original", dataView: "province" });
    const digest = buildProjectDigest({
      ...project,
      cards: { ...project.cards, positions: { province: { x: 10, y: 20 } } },
      students: [
        { id: "s1", name: "甲", university: "北大", city: "北京", province: "北京市", visibility: true },
        { id: "s2", name: "乙", university: "清华", city: "北京", province: "北京市", visibility: false },
      ],
    });
    expect(digest.students).toMatchObject({ total: 2, hidden: 1 });
    expect(digest.students.topProvinces).toEqual([{ province: "北京市", count: 1 }]);
    expect(digest.cards).toMatchObject({ hasManualPositions: true, manualPositionCount: 1 });
  });

  it("stays below the network projection budget", () => {
    const project = createProjectDocument({ students: [], templateId: "original", dataView: "province" });
    const digest = buildProjectDigest(project);
    expect(digestByteLength(digest)).toBeLessThan(8 * 1024);
  });
});
