import { describe, expect, it } from "vitest";
import { createProjectDocument } from "./project-document";
import {
  buildProjectDigest,
  buildProjectFingerprint,
  digestByteLength,
  digestFingerprint,
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

  it("projects the card settings the layout tools can write", () => {
    const project = createProjectDocument({ students: [], templateId: "original", dataView: "province" });
    const digest = buildProjectDigest({
      ...project,
      cards: { ...project.cards, x: 48, y: 96, maxWidth: 260, columns: 3 },
    });
    expect(digest.cards).toMatchObject({ x: 48, y: 96, maxWidth: 260, columns: 3 });
  });

  it("projects the rendered map box and one card block per top province", () => {
    const project = createProjectDocument({ students: [], templateId: "original", dataView: "province" });
    const digest = buildProjectDigest({
      ...project,
      students: [
        { id: "s1", name: "甲", university: "北大", city: "北京", province: "北京市", visibility: true },
        { id: "s2", name: "乙", university: "清华", city: "北京", province: "北京市", visibility: true },
        { id: "s3", name: "丙", university: "浙大", city: "杭州", province: "浙江省", visibility: true },
      ],
    });

    expect(Object.values(digest.layout.mapContentBounds).every(Number.isInteger)).toBe(true);
    expect(digest.layout.mapContentBounds.width).toBeGreaterThan(0);
    expect(digest.layout.cardBlocks.map((block) => block.province)).toEqual(digest.students.topProvinces.map((entry) => entry.province));
    for (const block of digest.layout.cardBlocks) {
      expect(block.id).toBe(block.province);
      expect([block.x, block.y, block.w, block.h].every(Number.isInteger)).toBe(true);
      expect(block.h).toBeGreaterThan(0);
      expect(["left", "right", "top", "bottom"]).toContain(block.side);
    }
  });

  it("reports the manual card position instead of the solved one", () => {
    const project = createProjectDocument({ students: [], templateId: "original", dataView: "province" });
    const students = [{ id: "s1", name: "甲", university: "北大", city: "北京", province: "北京市", visibility: true }];
    const solved = buildProjectDigest({ ...project, students });
    const moved = buildProjectDigest({
      ...project,
      students,
      cards: { ...project.cards, positions: { 北京市: { x: 12, y: 34 } } },
    });

    expect(solved.layout.cardBlocks[0]).toMatchObject({ province: "北京市" });
    expect(moved.layout.cardBlocks[0]).toMatchObject({ province: "北京市", x: 12, y: 34 });
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

  it("keeps the whole projection within budget when a full layout competes with element samples", () => {
    const project = createProjectDocument({ students: [], templateId: "original", dataView: "province" });
    const provinces = ["北京市", "浙江省", "广东省", "江苏省", "四川省", "湖北省", "山东省", "河南省", "陕西省", "福建省", "湖南省", "辽宁省"];
    const digest = buildProjectDigest({
      ...project,
      students: provinces.flatMap((province, provinceIndex) => Array.from({ length: 12 - provinceIndex }, (_, index) => ({
        id: `s-${province}-${index}`,
        name: `同学${index}`,
        university: `${province}大学第${index}分校`,
        city: `${province}城市${index}`,
        province,
        visibility: true,
      }))),
      textElements: Array.from({ length: 200 }, (_, index) => ({
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
    });

    expect(digest.students.topProvinces).toHaveLength(10);
    expect(digest.layout.cardBlocks).toHaveLength(10);
    expect(digestByteLength(digest)).toBeLessThanOrEqual(DIGEST_MAX_BYTES);
    expect(digest.layout.mapContentBounds.width).toBeGreaterThan(0);
  });

  it("drops card blocks before the provinces they align with when the projection cannot fit the budget", () => {
    const project = createProjectDocument({ students: [], templateId: "original", dataView: "province" });
    const digest = buildProjectDigest({
      ...project,
      students: Array.from({ length: 10 }, (_, index) => ({
        id: `s${index}`,
        name: `同学${index}`,
        university: "某大学",
        city: "某市",
        province: `超长省名${index}${"啊".repeat(400)}`,
        visibility: true,
      })),
    });

    expect(digest.students.total).toBe(10);
    expect(digest.layout.cardBlocks).toEqual([]);
    expect(digest.students.topProvinces.length).toBeLessThan(10);
    expect(digest.layout.mapContentBounds.width).toBeGreaterThan(0);
    expect(digestByteLength(digest)).toBeLessThanOrEqual(DIGEST_MAX_BYTES);
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
    expect(digest.layout.cardBlocks).toEqual([]);
  });
});

/** 一份两层都不会触发 shrink 的中等体量工程，用来对比 full / core 的字段差异。 */
function busyProject() {
  const project = createProjectDocument({ students: [], templateId: "original", dataView: "province" });
  const provinces = ["北京市", "浙江省", "广东省", "江苏省", "四川省", "湖北省", "山东省", "河南省", "陕西省", "福建省", "湖南省", "辽宁省"];
  return {
    ...project,
    students: provinces.flatMap((province, provinceIndex) => Array.from({ length: 12 - provinceIndex }, (_, index) => ({
      id: `s-${province}-${index}`,
      name: `同学${index}`,
      university: `${province}大学第${index}分校`,
      city: `${province}城市${index}`,
      province,
      visibility: true,
    }))),
    textElements: Array.from({ length: 60 }, (_, index) => ({
      id: `text-${index}`,
      role: "custom" as const,
      content: `第 ${index} 段说明文字`,
      x: index,
      y: index,
      fontSize: 16,
      color: "#000000",
      fontWeight: 400,
      textAlign: "left" as const,
      maxWidth: 320,
      visibility: true,
    })),
    assetElements: Array.from({ length: 8 }, (_, index) => ({
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
  };
}

describe("buildProjectDigest layers", () => {
  it("defaults to the full layer", () => {
    const project = busyProject();
    expect(buildProjectDigest(project)).toEqual(buildProjectDigest(project, { layer: "full" }));
  });

  it("labels every projection with its own layer", () => {
    const project = busyProject();
    expect(buildProjectDigest(project).layer).toBe("full");
    expect(buildProjectDigest(project, { layer: "full" }).layer).toBe("full");
    expect(buildProjectDigest(project, { layer: "core" }).layer).toBe("core");
  });

  it("keeps the card block total on the core layer so an empty list is not read as no cards", () => {
    const project = busyProject();
    const full = buildProjectDigest(project, { layer: "full" });
    const core = buildProjectDigest(project, { layer: "core" });

    expect(full.layout.cardBlockCount).toBeGreaterThan(0);
    expect(full.layout.cardBlockCount).toBeGreaterThanOrEqual(full.layout.cardBlocks.length);
    // 「有卡但明细被裁」：清单为空而总数非零，模型据此改走 inspect_project。
    expect(core.layout.cardBlocks).toEqual([]);
    expect(core.layout.cardBlockCount).toBe(full.layout.cardBlockCount);
  });

  it("reports zero card blocks on both layers when the canvas really has no cards", () => {
    const project = createProjectDocument({ students: [], templateId: "original", dataView: "province" });

    for (const layer of ["full", "core"] as const) {
      const digest = buildProjectDigest(project, { layer });
      expect(digest.layout.cardBlocks).toEqual([]);
      expect(digest.layout.cardBlockCount).toBe(0);
    }
  });

  it("keeps the card block total after the budget drops the blocks themselves", () => {
    const project = createProjectDocument({ students: [], templateId: "original", dataView: "province" });
    const oversized = {
      ...project,
      students: Array.from({ length: 10 }, (_, index) => ({
        id: `s${index}`,
        name: `同学${index}`,
        university: "某大学",
        city: "某市",
        province: `超长省名${index}${"啊".repeat(400)}`,
        visibility: true,
      })),
    };
    const digest = buildProjectDigest(oversized);

    expect(digest.layout.cardBlocks).toEqual([]);
    expect(digest.layout.cardBlockCount).toBeGreaterThan(0);
    expect(digestByteLength(digest)).toBeLessThanOrEqual(DIGEST_MAX_BYTES);
  });

  it("keeps statistics and key geometry on the core layer while dropping the detail lists", () => {
    const project = busyProject();
    const full = buildProjectDigest(project, { layer: "full" });
    const core = buildProjectDigest(project, { layer: "core" });

    expect(full.layout.cardBlocks.length).toBeGreaterThan(0);
    expect(full.textElements.length).toBeGreaterThan(0);
    expect(full.assetElements.length).toBeGreaterThan(0);

    expect(core.canvas).toEqual(full.canvas);
    expect(core.map).toEqual(full.map);
    expect(core.cards).toEqual(full.cards);
    expect(core.guests).toEqual(full.guests);
    expect(core.students).toEqual(full.students);
    expect(core.students.topProvinces).toHaveLength(10);
    expect(core.layout.mapContentBounds).toEqual(full.layout.mapContentBounds);
    expect(core.textElementCount).toBe(full.textElementCount);
    expect(core.assetElementCount).toBe(full.assetElementCount);

    expect(core.layout.cardBlocks).toEqual([]);
    expect(core.textElements).toEqual([]);
    expect(core.assetElements).toEqual([]);
    expect(digestByteLength(core)).toBeLessThan(digestByteLength(full));
  });

  it("keeps both layers inside the byte budget for an oversized canvas", () => {
    const project = createProjectDocument({ students: [], templateId: "original", dataView: "province" });
    const oversized = {
      ...project,
      students: Array.from({ length: 10 }, (_, index) => ({
        id: `s${index}`,
        name: `同学${index}`,
        university: "某大学",
        city: "某市",
        province: `超长省名${index}${"啊".repeat(400)}`,
        visibility: true,
      })),
    };

    expect(digestByteLength(buildProjectDigest(oversized, { layer: "full" }))).toBeLessThanOrEqual(DIGEST_MAX_BYTES);
    expect(digestByteLength(buildProjectDigest(oversized, { layer: "core" }))).toBeLessThanOrEqual(DIGEST_MAX_BYTES);
  });
});

describe("digestFingerprint", () => {
  it("returns the same short hash for equal digests regardless of key order", () => {
    const project = busyProject();
    const digest = buildProjectDigest(project);
    const again = buildProjectDigest({ ...project });
    const reordered = Object.fromEntries(Object.entries(digest).reverse()) as typeof digest;

    expect(digestFingerprint(digest)).toMatch(/^fnv1a32:[0-9a-f]{8}$/);
    expect(digestFingerprint(digest)).toBe(digestFingerprint(digest));
    expect(digestFingerprint(again)).toBe(digestFingerprint(digest));
    expect(digestFingerprint(reordered)).toBe(digestFingerprint(digest));
  });

  it("changes when map.scale changes", () => {
    const project = busyProject();
    const digest = buildProjectDigest(project);

    expect(digestFingerprint({ ...digest, map: { ...digest.map, scale: digest.map.scale + 0.25 } })).not.toBe(digestFingerprint(digest));
    expect(digestFingerprint(buildProjectDigest({ ...project, map: { ...project.map, scale: project.map.scale + 0.25 } }))).not.toBe(digestFingerprint(digest));
  });

  it("separates the core layer from the full layer", () => {
    const project = busyProject();

    expect(digestFingerprint(buildProjectDigest(project, { layer: "core" })))
      .not.toBe(digestFingerprint(buildProjectDigest(project, { layer: "full" })));
  });
});
