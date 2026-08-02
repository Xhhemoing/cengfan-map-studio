import { createId } from "./ids";
export interface CanvasText {
  id: string;
  role: "eyebrow" | "title" | "subtitle" | "stats" | "watermark" | "note" | "custom";
  content: string;
  x: number;
  y: number;
  fontSize: number;
  color: string;
  fontWeight: number;
  /** Font id (see lib/fonts). Empty/undefined = inherit default font. */
  fontId?: string;
  textAlign: "left" | "center" | "right";
  maxWidth: number;
  visibility: boolean;
}

export type CanvasTextInput = Omit<CanvasText, "role" | "fontWeight" | "textAlign" | "maxWidth" | "visibility"> &
  Partial<Pick<CanvasText, "role" | "fontWeight" | "textAlign" | "maxWidth" | "visibility">>;

export function createTextElement(content: string, x: number, y: number): CanvasText {
  return {
    id: createId("text"),
    content,
    x,
    y,
    fontSize: 24,
    color: "#1c3154",
    role: "custom",
    fontWeight: 500,
    textAlign: "left",
    maxWidth: 320,
    visibility: true,
  };
}

export function createNoteElement(content: string, x: number, y: number): CanvasText {
  return {
    ...createTextElement(content, x, y),
    role: "note",
    color: "#c85d4b",
    textAlign: "center",
    maxWidth: 640,
  };
}

export function moveTextElement(elements: CanvasText[], id: string, x: number, y: number): CanvasText[] {
  return elements.map((element) => element.id === id ? { ...element, x, y } : element);
}
