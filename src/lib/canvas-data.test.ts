import { describe, expect, it } from "vitest";
import { createNoteElement, createTextElement, moveTextElement, type CanvasText } from "./canvas-data";

describe("canvas text helpers", () => {
  const element: CanvasText = {
    id: "text-1",
    role: "custom",
    content: "再见，少年",
    x: 120,
    y: 180,
    fontSize: 26,
    color: "#1c3154",
    fontWeight: 500,
    textAlign: "left",
    maxWidth: 320,
    visibility: true,
  };

  it("creates a readable text element at a supplied position", () => {
    expect(createTextElement("给未来的一封信", 480, 620)).toMatchObject({
      role: "custom",
      content: "给未来的一封信",
      x: 480,
      y: 620,
      fontSize: 24,
      fontWeight: 500,
      textAlign: "left",
      maxWidth: 320,
      visibility: true,
    });
  });

  it("moves only the requested text element", () => {
    expect(moveTextElement([element], "text-1", 300, 400)).toEqual([{ ...element, x: 300, y: 400 }]);
  });

  it("creates a special note with the stable note role", () => {
    expect(createNoteElement("再会", 700, 880)).toMatchObject({
      role: "note",
      content: "再会",
      textAlign: "center",
    });
  });
});
