import { describe, expect, it } from "vitest";
import { migrateProjectPayload } from "./project-migration";
import { deriveFixedDisplayFrameFromCardSettings } from "./display-frame";

const legacyDraft = {
  templateId: "regional",
  dataView: "city",
  students: [
    {
      id: "student-1",
      name: "林舟",
      university: "浙江大学",
      city: "杭州",
      province: "浙江省",
      major: "计算机",
      locationStatus: "resolved",
      raw: { source: "old-import" },
    },
  ],
  textElements: [
    {
      id: "text-wish",
      content: "后会有期",
      x: 760,
      y: 900,
      fontSize: 22,
      color: "#c85d4b",
    },
  ],
  style: {
    cardPreset: "compact",
    mapScale: 1.18,
    backgroundColor: "#f0eadf",
    backgroundImageSrc: "data:image/png;base64,old",
    visibleFields: ["name", "city"],
    regionalAssets: {
      浙江省: [
        {
          id: "asset-west-lake",
          label: "西湖剪影",
          src: "data:image/svg+xml,<svg />",
          kind: "province-texture",
          mode: "overlay",
          opacity: 0.8,
          scale: 1.2,
        },
      ],
    },
  },
  version: 7,
  history: { past: [], future: [] },
};

describe("project migration", () => {
  it("restores saved heat-map calibration alongside province color overrides", () => {
    const migrated = migrateProjectPayload({
      schemaVersion: 2,
      map: {
        heatScale: {
          minDepth: 9,
          maxDepth: 2,
          lowColor: "#dceeff",
          highColor: "#174a7c",
        },
        provinceStyles: {
          浙江省: { appearance: { kind: "manual-color", color: "#e56a54" } },
        },
      },
    });

    expect(migrated.map.heatScale).toEqual({
      minDepth: 2,
      maxDepth: 9,
      lowColor: "#dceeff",
      highColor: "#174a7c",
    });
    expect(migrated.map.provinceStyles?.浙江省?.appearance).toEqual({
      kind: "manual-color",
      color: "#e56a54",
    });
  });

  it("preserves normalized province texture sizing and opacity", () => {
    const migrated = migrateProjectPayload({ schemaVersion: 2, map: { provinceStyles: { 浙江省: { appearance: {
      kind: "texture", assetId: "texture-1", src: "data:image/png;base64,AA==",
      fit: "contain", scale: 1.25, opacity: 0.4, overflow: false,
      sizingMode: "natural", naturalWidth: 1200, naturalHeight: 800,
      offsetX: -17.5, offsetY: 24,
    } } }, provinceTextureUniformSize: { enabled: true, width: 96, height: 64 } } });

    expect(migrated.map.provinceStyles?.["浙江省"]?.appearance).toMatchObject({
      kind: "texture", scale: 1.25, opacity: 0.4, sizingMode: "natural",
      naturalWidth: 1200, naturalHeight: 800,
      offsetX: -17.5, offsetY: 24,
    });
    expect(migrated.map.provinceTextureUniformSize).toEqual({ enabled: true, width: 96, height: 64 });
  });

  it("migrates a v1 draft into a clean scene document v2", () => {
    const migrated = migrateProjectPayload(legacyDraft, {
      provincePositions: { 浙江省: { x: 1040, y: 620 } },
    });

    expect(migrated.schemaVersion).toBe(2);
    expect(migrated.students).toEqual([
      {
        id: "student-1",
        name: "林舟",
        university: "浙江大学",
        city: "杭州市",
        province: "浙江省",
        visibility: true,
      },
    ]);
    expect(migrated.map.scale).toBe(1.18);
    expect(migrated.canvas).toMatchObject({
      width: 1500,
      height: 1000,
      backgroundColor: "#f0eadf",
      backgroundImageSrc: "data:image/png;base64,old",
    });
    expect(migrated.cards).toMatchObject({ preset: "standard", compactLayout: true });
    expect(migrated.cards.visibleFields).toEqual(["name", "city"]);
    expect(migrated.textElements.find((item) => item.role === "note")).toMatchObject({
      id: "text-note",
      content: "后会有期",
    });
    expect(new Set(migrated.textElements.map((item) => item.id)).size).toBe(migrated.textElements.length);
    expect(migrated.assetElements).toHaveLength(1);
    expect(migrated.assetElements[0]).toMatchObject({
      assetId: "asset-west-lake",
      kind: "landmark",
      province: "浙江省",
      x: 1040,
      y: 620,
      opacity: 0.8,
    });
  });

  it("does not duplicate built-in text elements during repeated migration", () => {
    const first = migrateProjectPayload(legacyDraft);
    const second = migrateProjectPayload(first);

    expect(second.textElements.map((item) => item.id)).toEqual(first.textElements.map((item) => item.id));
    expect(second.textElements.filter((item) => item.role === "title")).toHaveLength(1);
    expect(second.textElements.filter((item) => item.role === "note")).toHaveLength(1);
    expect(second).toEqual(first);
  });

  it("keeps only defensively normalized student fields and valid records", () => {
    const migrated = migrateProjectPayload({
      students: [
        {
          id: "student-2",
          name: " 陈宁 ",
          university: "清华大学",
          city: "北京",
          visibility: false,
          province: "北京市",
          major: "历史字段",
        },
        null,
        { name: "缺少 ID", university: "北京大学", city: "北京市" },
      ],
    });

    expect(migrated.students).toEqual([
      {
        id: "student-2",
        name: "陈宁",
        university: "清华大学",
        city: "北京市",
        province: "北京市",
        visibility: false,
      },
      {
        id: "student-3",
        name: "缺少 ID",
        university: "北京大学",
        city: "北京市",
        visibility: true,
      },
    ]);
    expect(migrated.students.every((student) => !Object.keys(student).some((key) => ["major", "locationStatus", "raw"].includes(key)))).toBe(true);
  });

  it("migrates the new enrolled-school field while retaining the canonical university record shape", () => {
    const migrated = migrateProjectPayload({
      students: [{ id: "student-school", name: "苏禾", school: "浙江大学", city: "杭州" }],
    });

    expect(migrated.students).toEqual([
      {
        id: "student-school",
        name: "苏禾",
        university: "浙江大学",
        city: "杭州市",
        visibility: true,
      },
    ]);
  });

  it("imports legacy no-wrap field settings into the canonical cards settings", () => {
    const migrated = migrateProjectPayload({
      templateId: "regional",
      style: {
        visibleFields: ["name", "university", "city"],
        noWrapFields: ["university", "city", "unknown"],
      },
      students: [{ id: "legacy-nowrap", name: "张三", university: "北京大学", city: "北京市" }],
    });

    expect(migrated.cards.noWrapFields).toEqual(["university", "city"]);
  });

  it("prefers canonical v2 no-wrap settings over stale legacy style settings", () => {
    const migrated = migrateProjectPayload({
      schemaVersion: 2,
      cards: { visibleFields: ["name", "university"], noWrapFields: ["name"] },
      style: { visibleFields: ["name", "university"], noWrapFields: ["university"] },
    });

    expect(migrated.cards.noWrapFields).toEqual(["name"]);
  });

  it("preserves explicit international scope without normalizing its location as a Chinese city", () => {
    const migrated = migrateProjectPayload({
      students: [{
        id: "student-international",
        name: "周晴",
        university: "哈佛大学",
        city: "美国·波士顿",
        locationScope: "international",
      }],
    });

    expect(migrated.students).toEqual([{
      id: "student-international",
      name: "周晴",
      university: "哈佛大学",
      city: "美国·波士顿",
      locationScope: "international",
      visibility: true,
    }]);
  });

  it("preserves existing v2 assets without duplicating legacy source entries", () => {
    const migrated = migrateProjectPayload({
      schemaVersion: 2,
      assetElements: [{
        id: "asset-element-zhejiang-asset-west-lake",
        assetId: "asset-west-lake",
        label: "西湖剪影",
        src: "data:image/svg+xml,<svg />",
        kind: "landmark",
        province: "浙江省",
        x: 10,
        y: 20,
        width: 120,
        height: 120,
        rotation: 0,
        opacity: 0.8,
        zIndex: 1,
        visibility: true,
      }],
      style: { regionalAssets: legacyDraft.style.regionalAssets },
    });

    expect(migrated.assetElements).toHaveLength(1);
    expect(migrated.assetElements[0]?.x).toBe(10);
  });

  it("preserves normalized v2 scene geometry on repeated migration", () => {
    const first = migrateProjectPayload(legacyDraft);
    const v2 = {
      ...first,
      canvas: { ...first.canvas, width: 1800, height: 1100 },
      map: { ...first.map, x: 420, y: 140, width: 900, height: 720, scale: 1.24 },
    };

    const second = migrateProjectPayload(v2);

    expect(second.canvas).toMatchObject({ width: 1800, height: 1100 });
    expect(second.map).toMatchObject({ x: 420, y: 140, width: 900, height: 720, scale: 1.24 });
  });

  it("treats canonical v2 scene fields as authoritative over stale compatibility style", () => {
    const migrated = migrateProjectPayload({
      schemaVersion: 2,
      canvas: {
        width: 1500,
        height: 1000,
        backgroundColor: "#123456",
      },
      map: {
        x: 350,
        y: 120,
        width: 800,
        height: 690,
        scale: 1.2,
      },
      cards: {
        preset: "compact",
        grouping: "province",
        visibleFields: ["name"],
      },
      style: {
        ...legacyDraft.style,
        backgroundColor: "#f7f4ea",
        mapScale: 1,
        cardPreset: "standard",
        visibleFields: ["name", "university", "city"],
      },
    });

    expect(migrated.canvas.backgroundColor).toBe("#123456");
    expect(migrated.map.scale).toBe(1.2);
    expect(migrated.cards.preset).toBe("standard");
    expect(migrated.cards.compactLayout).toBe(true);
    expect(migrated.cards.visibleFields).toEqual(["name"]);
  });

  it("keeps schema v2 compatible while deriving an old card frame without persisting it", () => {
    const legacy = migrateProjectPayload({ ...legacyDraft, cards: { positions: { 北京市: { x: 777, y: 333 } } } });
    expect(legacy.schemaVersion).toBe(2);
    expect(legacy.cards.displayFrame).toBeUndefined();
    expect(deriveFixedDisplayFrameFromCardSettings(legacy.cards).style).toMatchObject({
      background: legacy.cards.background,
      opacity: legacy.cards.opacity,
      fontSize: legacy.cards.fontSize,
    });
    expect(legacy.cards.positions).toEqual({ 北京市: { x: 777, y: 333 } });

    const explicit = migrateProjectPayload({
      schemaVersion: 2,
      cards: {
        visibleFields: ["name"],
        displayFrame: {
          mode: "flow",
          style: { fontSize: 18, color: "#123456", background: "#ffffff", padding: 16, align: "center" },
          fieldOrder: ["title", "name"],
          fixed: { items: [] },
          flow: { blocks: [{ id: "name", kind: "field", field: "name", order: 0, spacing: 12, lineHeight: 1.4 }] },
        },
      },
    });
    expect(explicit.schemaVersion).toBe(2);
    expect(explicit.cards.displayFrame).toMatchObject({ mode: "flow", style: { fontSize: 18 }, fieldOrder: ["title", "name"] });
  });
});
