import { describe, expect, it } from "vitest";
import { createProjectDocument } from "./project-document";
import {
  buildProjectDigest,
  buildProjectFingerprint,
  digestByteLength,
  fingerprintProject,
  DIGEST_ELEMENT_LIMIT,
  DIGEST_MAX_BYTES,
} from "./project-digest";

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

  it("invalidates the project fingerprint for executable fields omitted from the model digest", () => {
    const project = createProjectDocument({ students: [], templateId: "original", dataView: "province" });
    const fingerprint = buildProjectFingerprint(project);

    expect(buildProjectFingerprint({ ...project, cards: { ...project.cards, positions: { 北京市: { x: 12, y: 24 } } } })).not.toBe(fingerprint);
    expect(buildProjectFingerprint({
      ...project,
      textElements: project.textElements.map((text) => text.id === "text-title" ? { ...text, x: text.x + 1 } : text),
    })).not.toBe(fingerprint);
    expect(buildProjectFingerprint({
      ...project,
      assetElements: [{
        id: "asset-element-1",
        assetId: "asset-1",
        label: "图片",
        src: "data:image/png;base64,private-data",
        kind: "decoration",
        x: 1,
        y: 2,
        width: 101,
        height: 100,
        rotation: 0,
        opacity: 1,
        zIndex: 30,
        visibility: true,
      }],
    })).not.toBe(fingerprint);

    expect(buildProjectFingerprint({ ...project, history: { past: [{ id: "volatile", label: "history", source: "manual", snapshot: project }], future: [] } })).toBe(fingerprint);
  });

  it("hashes long data URLs before canonical serialization while retaining one-byte sensitivity and staying within the performance budget", () => {
    const project = createProjectDocument({ students: [], templateId: "original", dataView: "province" });
    const dataUrl = `data:image/png;base64,${"a".repeat(2_000_000)}`;
    const withData = { ...project, assetElements: [{ ...project.assetElements[0]!, src: dataUrl }] };
    const changed = { ...withData, assetElements: [{ ...withData.assetElements[0]!, src: `${dataUrl.slice(0, -1)}b` }] };

    const startedAt = performance.now();
    const first = buildProjectFingerprint(withData);
    const elapsedMs = performance.now() - startedAt;
    const second = buildProjectFingerprint(changed);

    expect(elapsedMs).toBeLessThan(100);
    expect(first).not.toBe(second);
    expect(first).toMatch(/^fnv1a32:[0-9a-f]{8}$/);
    expect(first).not.toContain(dataUrl.slice(0, 1_000));
  });

  it("memoizes a project's fingerprint by identity without rescanning its large data URL", () => {
    const project = createProjectDocument({ students: [], templateId: "original", dataView: "province" });
    const dataUrl = `data:image/png;base64,${"a".repeat(2_000_000)}`;
    let reads = 0;
    const asset = { ...project.assetElements[0]! };
    Object.defineProperty(asset, "src", {
      configurable: true,
      enumerable: true,
      get: () => {
        reads += 1;
        return dataUrl;
      },
    });
    const withData = { ...project, assetElements: [asset] };

    const first = fingerprintProject(withData);
    const readsAfterFirst = reads;
    const second = fingerprintProject(withData);

    expect(readsAfterFirst).toBeGreaterThan(0);
    expect(second).toBe(first);
    expect(reads).toBe(readsAfterFirst);
    expect(fingerprintProject({ ...withData, canvas: { ...withData.canvas, width: withData.canvas.width + 1 } })).not.toBe(first);
  });

  it("stays below the network projection budget", () => {
    const project = createProjectDocument({ students: [], templateId: "original", dataView: "province" });
    const digest = buildProjectDigest(project);
    expect(digestByteLength(digest)).toBeLessThan(8 * 1024);
  });

  it("caps element samples and keeps the real totals when a canvas has hundreds of elements", () => {
    const project = createProjectDocument({ students: [], templateId: "original", dataView: "province" });
    const digest = buildProjectDigest({
      ...project,
      textElements: Array.from({ length: 400 }, (_, index) => ({
        id: `text-${index}`,
        role: "custom" as const,
        content: `第 ${index} 段很长的说明文字，用于撑满投影预算`,
        x: index,
        y: index,
        fontSize: 16,
        color: "#000000",
        fontWeight: 400,
        textAlign: "left" as const,
        maxWidth: 320,
        visibility: true,
      })),
      assetElements: Array.from({ length: 120 }, (_, index) => ({
        id: `asset-element-${index}`,
        assetId: `asset-${index}`,
        label: `素材 ${index}`,
        src: `data:image/png;base64,${"a".repeat(500)}`,
        kind: "decoration" as const,
        x: 0,
        y: 0,
        width: 100,
        height: 100,
        rotation: 0,
        opacity: 1,
        zIndex: 30,
        visibility: true,
      })),
    });

    expect(digest.textElementCount).toBe(400);
    expect(digest.assetElementCount).toBe(120);
    expect(digest.textElements.length).toBeLessThanOrEqual(DIGEST_ELEMENT_LIMIT);
    expect(digest.assetElements.length).toBeLessThanOrEqual(DIGEST_ELEMENT_LIMIT);
    expect(digestByteLength(digest)).toBeLessThanOrEqual(DIGEST_MAX_BYTES);
    expect(digest.students.total).toBe(0);
  });
});
