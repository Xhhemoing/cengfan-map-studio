import { describe, expect, it } from "vitest";
import { createProjectDocument } from "./project-document";
import {
  applyEditorCommands,
  createEditorCommand,
  previewEditorCommands,
} from "./editor-commands";
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

describe("style command application", () => {
  it("applies card preset, map scale and background color into project style", () => {
    const project = createProjectDocument({
      students,
      templateId: "original",
      dataView: "province",
    });

    const preview = previewEditorCommands(project, [
      createEditorCommand({
        type: "setCardPreset",
        label: "紧凑卡片",
        before: "standard",
        after: "compact",
        risk: "low",
      }),
      createEditorCommand({
        type: "setMapScale",
        label: "放大地图",
        before: 1,
        after: 1.12,
        risk: "low",
      }),
      createEditorCommand({
        type: "setBackgroundColor",
        label: "背景色",
        before: "#f7f4ea",
        after: "#edf3e9",
        risk: "low",
      }),
      createEditorCommand({
        type: "setVisibleFields",
        label: "隐藏城市",
        before: ["name", "university", "city"],
        after: ["name", "university"],
        risk: "low",
      }),
    ]);

    expect(preview.style.cardPreset).toBe("compact");
    expect(preview.style.mapScale).toBe(1.12);
    expect(preview.style.backgroundColor).toBe("#edf3e9");
    expect(preview.style.visibleFields).toEqual(["name", "university"]);
    expect(project.style.cardPreset).toBe("standard");

    const applied = applyEditorCommands(
      project,
      [
        createEditorCommand({
          type: "setCardPreset",
          label: "紧凑卡片",
          before: "standard",
          after: "compact",
          risk: "low",
        }),
      ],
      "AI：紧凑卡片",
    );
    expect(applied.style.cardPreset).toBe("compact");
    expect(applied.history.past).toHaveLength(1);
  });
});
