import { describe, expect, it } from "vitest";
import {
  createProjectDocument,
  restoreProjectDocument,
  serializeProjectDocument,
} from "./project-document";
import type { Student } from "./project-data";

const students: Student[] = [
  {
    id: "student-1",
    name: "林舟",
    university: "北京大学",
    city: "北京市",
    visibility: true,
  },
];

describe("project document persistence", () => {
  it("restores an explicit v1 payload through the migration boundary", () => {
    const restored = restoreProjectDocument(JSON.stringify({
      templateId: "original",
      dataView: "province",
      students: [{
        id: "legacy-1",
        name: "旧同学",
        university: "北京大学",
        city: "北京",
        province: "北京市",
        major: "历史字段",
        locationStatus: "resolved",
        raw: { source: "legacy-import" },
      }],
      textElements: [],
      style: {
        mapScale: 1.2,
        cardPreset: "compact",
        visibleFields: ["name"],
        regionalAssets: {},
      },
      version: 2,
      history: { past: [], future: [] },
    }));

    expect(restored.schemaVersion).toBe(2);
    expect(restored.students[0]).toEqual({
      id: "legacy-1",
      name: "旧同学",
      university: "北京大学",
      city: "北京市",
      province: "北京市",
      visibility: true,
    });
    expect(restored.map.scale).toBe(1.2);
    expect(restored.cards.preset).toBe("standard");
    expect(restored.cards.compactLayout).toBe(true);
    expect(restored.canvas).toMatchObject({ width: 1500, height: 1000 });
    expect(restored.textElements.length).toBeGreaterThan(0);
    expect(restored.assetElements).toEqual([]);
  });

  it("migrates legacy history snapshots through the same restoration boundary", () => {
    const restored = restoreProjectDocument(JSON.stringify({
      schemaVersion: 1,
      templateId: "regional",
      dataView: "city",
      students: [],
      history: {
        past: [{
          id: "legacy-change",
          label: "旧版导入",
          source: "import",
          snapshot: {
            templateId: "regional",
            dataView: "city",
            students: [{
              id: "history-student",
              name: "旧历史",
              university: "浙江大学",
              city: "杭州",
              province: "浙江省",
              major: "历史字段",
              locationStatus: "resolved",
              raw: { source: "legacy-history" },
            }],
            style: {
              mapScale: 1.25,
              cardPreset: "compact",
              visibleFields: ["name", "city"],
              regionalAssets: {},
            },
            version: 4,
          },
        }],
        future: [],
      },
    }));

    expect(restored.history.past).toHaveLength(1);
    expect(restored.history.past[0]).toMatchObject({
      id: "legacy-change",
      label: "旧版导入",
      source: "import",
    });
    const snapshot = restored.history.past[0]!.snapshot;
    expect(snapshot.schemaVersion).toBe(2);
    expect(snapshot.students[0]).toEqual({
      id: "history-student",
      name: "旧历史",
      university: "浙江大学",
      city: "杭州市",
      province: "浙江省",
      visibility: true,
    });
    expect(snapshot.map.scale).toBe(1.25);
    expect(snapshot.cards.preset).toBe("standard");
    expect(snapshot.cards.compactLayout).toBe(true);
    expect(snapshot.canvas).toMatchObject({ width: 1500, height: 1000 });
    expect(snapshot.textElements.length).toBeGreaterThan(0);
    expect(snapshot.assetElements).toEqual([]);
  });

  it("restores students, style overrides and history from serialized draft", () => {
    const project = createProjectDocument({
      students,
      templateId: "scenery",
      dataView: "city",
      textElements: [
        {
          id: "text-1",
          content: "寄语",
          x: 10,
          y: 20,
          fontSize: 18,
          color: "#123",
        },
      ],
      style: {
        cardPreset: "compact",
        mapScale: 1.12,
        backgroundColor: "#edf3e9",
        visibleFields: ["name", "university"],
      },
    });
    project.cards = {
      ...project.cards,
      citySubgroups: false,
      allowMapOverlap: true,
      expressionTemplates: {
        title: "{group} / {count}",
        city: "城市：{city}",
        row: "{names} → {university}",
      },
    };

    const restored = restoreProjectDocument(serializeProjectDocument(project));
    expect(restored.templateId).toBe("scenery");
    expect(restored.dataView).toBe("city");
    expect(restored.students[0]?.name).toBe("林舟");
    expect(restored.style.cardPreset).toBe("standard");
    expect(restored.cards.compactLayout).toBe(true);
    expect(restored.style.mapScale).toBe(1.12);
    expect(restored.schemaVersion).toBe(2);
    expect(restored.canvas).toMatchObject({ width: 1500, height: 1000 });
    expect(restored.map).toMatchObject({ x: 350, y: 120, width: 800, height: 690 });
    expect(restored.cards.visibleFields).toEqual(["name", "university"]);
    expect(restored.cards.citySubgroups).toBe(false);
    expect(restored.cards.allowMapOverlap).toBe(true);
    expect(restored.cards.expressionTemplates).toEqual(project.cards.expressionTemplates);
    expect(restored.textElements.find((item) => item.id === "text-1")).toMatchObject({
      role: "custom",
      fontWeight: 500,
      textAlign: "left",
      maxWidth: 320,
      visibility: true,
    });
    expect(restored.history.past).toEqual([]);
  });
});
