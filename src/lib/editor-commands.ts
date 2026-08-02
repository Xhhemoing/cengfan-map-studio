import { createId } from "./ids";
import type { CanvasText } from "./canvas-data";
import type { DataViewId, MapTemplateId } from "./project-data";
import { applyDataViewChange } from "./catalog-usage";
import {
  applyTransaction,
  defaultProjectStyle,
  type ProjectDocument,
} from "./project-document";

export type EditorCommandRisk = "low" | "medium" | "high";

export type EditorCommandType =
  | "setDataView"
  | "setTemplate"
  | "moveText"
  | "setVisibleFields"
  | "setCardPreset"
  | "setMapScale"
  | "setBackgroundColor";

export type DataViewCommandValue =
  | DataViewId
  | "city"
  | "university";

export interface EditorCommandBase {
  id: string;
  type: EditorCommandType;
  label: string;
  risk: EditorCommandRisk;
  targetId?: string;
  before: unknown;
  after: unknown;
}

export interface SetDataViewCommand extends EditorCommandBase {
  type: "setDataView";
  before: DataViewCommandValue;
  after: DataViewCommandValue;
}

export interface SetTemplateCommand extends EditorCommandBase {
  type: "setTemplate";
  before: MapTemplateId;
  after: MapTemplateId;
}

export interface MoveTextCommand extends EditorCommandBase {
  type: "moveText";
  targetId: string;
  before: { x: number; y: number };
  after: { x: number; y: number };
}

export interface SetVisibleFieldsCommand extends EditorCommandBase {
  type: "setVisibleFields";
  before: Array<"name" | "university" | "city">;
  after: Array<"name" | "university" | "city">;
}

export interface SetCardPresetCommand extends EditorCommandBase {
  type: "setCardPreset";
  before: "standard" | "compact" | "ticket" | "photo";
  after: "standard" | "compact" | "ticket" | "photo";
}

export interface SetMapScaleCommand extends EditorCommandBase {
  type: "setMapScale";
  before: number;
  after: number;
}

export interface SetBackgroundColorCommand extends EditorCommandBase {
  type: "setBackgroundColor";
  before: string;
  after: string;
}

export type EditorCommand =
  | SetDataViewCommand
  | SetTemplateCommand
  | MoveTextCommand
  | SetVisibleFieldsCommand
  | SetCardPresetCommand
  | SetMapScaleCommand
  | SetBackgroundColorCommand;

const SUPPORTED_TYPES = new Set<EditorCommandType>([
  "setDataView",
  "setTemplate",
  "moveText",
  "setVisibleFields",
  "setCardPreset",
  "setMapScale",
  "setBackgroundColor",
]);

export function createEditorCommand<T extends EditorCommand>(
  input: Omit<T, "id"> & { id?: string },
): T {
  return {
    ...input,
    id: input.id ?? createId("cmd"),
  } as T;
}

function assertSupported(command: EditorCommand): void {
  if (!SUPPORTED_TYPES.has(command.type)) {
    throw new Error(`Unsupported command: ${String((command as { type: string }).type)}`);
  }
}

function moveText(
  elements: CanvasText[],
  id: string,
  x: number,
  y: number,
): CanvasText[] {
  return elements.map((element) =>
    element.id === id ? { ...element, x, y } : element,
  );
}

function ensureStyle(project: ProjectDocument) {
  return project.style ?? defaultProjectStyle();
}

function applySingleCommand(
  project: ProjectDocument,
  command: EditorCommand,
): ProjectDocument {
  assertSupported(command);
  const style = ensureStyle(project);

  switch (command.type) {
    case "setDataView": {
      const nextView = command.after;
      const allowed: DataViewId[] = [
        "province",
        "pins",
        "heat",
        "city",
        "university",
      ];
      if (!allowed.includes(nextView as DataViewId)) {
        throw new Error(`Unsupported data view: ${String(nextView)}`);
      }
      return applyDataViewChange(project, nextView as DataViewId);
    }
    case "setTemplate":
      return {
        ...project,
        templateId: command.after,
      };
    case "moveText":
      return {
        ...project,
        textElements: moveText(
          project.textElements,
          command.targetId,
          command.after.x,
          command.after.y,
        ),
      };
    case "setVisibleFields":
      return {
        ...project,
        cards: {
          ...project.cards,
          visibleFields: [...command.after],
        },
        style: {
          ...style,
          visibleFields: [...command.after],
        },
      };
    case "setCardPreset":
      return {
        ...project,
        cards: {
          ...project.cards,
          preset: command.after,
        },
        style: {
          ...style,
          cardPreset: command.after,
        },
      };
    case "setMapScale":
      return {
        ...project,
        map: {
          ...project.map,
          scale: Number(command.after) || 1,
        },
        style: {
          ...style,
          mapScale: Number(command.after) || 1,
        },
      };
    case "setBackgroundColor":
      return {
        ...project,
        canvas: {
          ...project.canvas,
          backgroundColor: String(command.after),
        },
        style: {
          ...style,
          backgroundColor: String(command.after),
        },
      };
    default: {
      const neverCommand: never = command;
      throw new Error(`Unsupported command: ${String(neverCommand)}`);
    }
  }
}

export function previewEditorCommands(
  project: ProjectDocument,
  commands: EditorCommand[],
): ProjectDocument {
  let next: ProjectDocument = {
    ...project,
    students: project.students.map((student) => ({ ...student })),
    canvas: { ...project.canvas },
    map: { ...project.map },
    cards: {
      ...project.cards,
      visibleFields: [...project.cards.visibleFields],
    },
    guests: {
      ...project.guests,
      people: project.guests.people.map((person) => ({ ...person })),
    },
    textElements: project.textElements.map((element) => ({ ...element })),
    style: {
      ...ensureStyle(project),
      visibleFields: [...ensureStyle(project).visibleFields],
      regionalAssets: structuredClone(ensureStyle(project).regionalAssets),
    },
    history: {
      past: [...project.history.past],
      future: [...project.history.future],
    },
  };

  for (const command of commands) {
    next = applySingleCommand(next, command);
  }

  next.history = {
    past: [],
    future: [],
  };
  return next;
}

export function applyEditorCommands(
  project: ProjectDocument,
  commands: EditorCommand[],
  label: string,
): ProjectDocument {
  return applyTransaction(project, {
    id: createId("tx"),
    label,
    source: "ai",
    apply: (current) => previewEditorCommands(current, commands),
  });
}
