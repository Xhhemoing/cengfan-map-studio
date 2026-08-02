import { describe, expect, it } from "vitest";
import { createProjectDocument } from "./project-document";
import {
  applyEditorCommands,
  createEditorCommand,
  previewEditorCommands,
  type EditorCommand,
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

describe("editor commands", () => {
  it("creates a typed whitelist command with before/after values", () => {
    const command = createEditorCommand({
      type: "setDataView",
      label: "切换为城市分组",
      before: "province",
      after: "city",
      risk: "medium",
    });

    expect(command).toMatchObject({
      type: "setDataView",
      label: "切换为城市分组",
      before: "province",
      after: "city",
      risk: "medium",
    });
    expect(command.id).toMatch(/^cmd-/);
  });

  it("previews commands without mutating the original project", () => {
    const project = createProjectDocument({
      students,
      templateId: "original",
      dataView: "province",
      textElements: [
        {
          id: "text-1",
          content: "寄语",
          x: 100,
          y: 200,
          fontSize: 20,
          color: "#123456",
        },
      ],
    });

    const commands: EditorCommand[] = [
      createEditorCommand({
        type: "setDataView",
        label: "切换到院校视图",
        before: "province",
        after: "university",
        risk: "medium",
      }),
      createEditorCommand({
        type: "setTemplate",
        label: "切换到山河风景",
        before: "original",
        after: "scenery",
        risk: "low",
      }),
      createEditorCommand({
        type: "moveText",
        label: "移动寄语",
        targetId: "text-1",
        before: { x: 100, y: 200 },
        after: { x: 320, y: 480 },
        risk: "low",
      }),
    ];

    const preview = previewEditorCommands(project, commands);

    expect(preview.dataView).toBe("university");
    expect(preview.templateId).toBe("scenery");
    expect(preview.textElements.find((item) => item.id === "text-1")).toMatchObject({ x: 320, y: 480 });
    expect(project.dataView).toBe("province");
    expect(project.templateId).toBe("original");
    expect(project.textElements.find((item) => item.id === "text-1")).toMatchObject({ x: 100, y: 200 });
    expect(preview.history.past).toEqual([]);
  });

  it("rejects unknown command types", () => {
    const project = createProjectDocument({
      students,
      templateId: "original",
      dataView: "province",
    });

    expect(() =>
      previewEditorCommands(project, [
        {
          id: "cmd-bad",
          type: "explodeCanvas" as never,
          label: "爆炸",
          before: "none",
          after: "boom",
          risk: "high",
        },
      ]),
    ).toThrow(/unsupported command/i);
  });

  it("applies selected commands as one history transaction", () => {
    const project = createProjectDocument({
      students,
      templateId: "original",
      dataView: "province",
    });

    const next = applyEditorCommands(project, [
      createEditorCommand({
        type: "setDataView",
        label: "切换到城市视图",
        before: "province",
        after: "city",
        risk: "medium",
      }),
      createEditorCommand({
        type: "setTemplate",
        label: "切换到 Q 版",
        before: "original",
        after: "q",
        risk: "low",
      }),
    ], "AI：切换城市视图与 Q 版");

    expect(next.dataView).toBe("city");
    expect(next.templateId).toBe("q");
    expect(next.history.past).toHaveLength(1);
    expect(next.history.past[0]?.label).toBe("AI：切换城市视图与 Q 版");
    expect(next.history.past[0]?.source).toBe("ai");
    expect(project.dataView).toBe("province");
  });

  it("writes visual commands to canonical scene fields while keeping compatibility style in sync", () => {
    const project = createProjectDocument({
      students,
      templateId: "original",
      dataView: "province",
    });

    const next = previewEditorCommands(project, [
      createEditorCommand({
        type: "setVisibleFields",
        label: "只显示姓名",
        before: ["name", "university", "city"],
        after: ["name"],
        risk: "medium",
      }),
      createEditorCommand({
        type: "setCardPreset",
        label: "切换紧凑卡片",
        before: "standard",
        after: "compact",
        risk: "medium",
      }),
      createEditorCommand({
        type: "setMapScale",
        label: "放大地图",
        before: 1,
        after: 1.4,
        risk: "low",
      }),
      createEditorCommand({
        type: "setBackgroundColor",
        label: "设置背景色",
        before: "#f7f4ea",
        after: "#ffffff",
        risk: "low",
      }),
    ]);

    expect(next.cards.visibleFields).toEqual(["name"]);
    expect(next.cards.preset).toBe("compact");
    expect(next.map.scale).toBe(1.4);
    expect(next.canvas.backgroundColor).toBe("#ffffff");
    expect(next.style.visibleFields).toEqual(["name"]);
    expect(next.style.cardPreset).toBe("compact");
    expect(next.style.mapScale).toBe(1.4);
    expect(next.style.backgroundColor).toBe("#ffffff");
  });
});
