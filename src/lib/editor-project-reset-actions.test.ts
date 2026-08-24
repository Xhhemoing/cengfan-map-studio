import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DRAFT_KEY } from "./app-constants";
import { createProjectResetActions } from "./editor-project-reset-actions";
import { createProjectDocument, serializeProjectDocument, type ProjectDocument } from "./project-document";
import type { SceneSelection } from "./scene-document";

interface Recorded {
  projects: ProjectDocument[];
  previewCleared: number;
  selections: SceneSelection[];
  studentIds: Array<string | null>;
  panels: string[];
  steps: string[];
  stages: string[];
  messages: string[];
}

function build() {
  const recorded: Recorded = {
    projects: [],
    previewCleared: 0,
    selections: [],
    studentIds: [],
    panels: [],
    steps: [],
    stages: [],
    messages: [],
  };
  const actions = createProjectResetActions({
    setProject: (project) => recorded.projects.push(project),
    clearPreviewCommands: () => { recorded.previewCleared += 1; },
    setSelection: (selection) => recorded.selections.push(selection),
    setSelectedStudentId: (id) => recorded.studentIds.push(id),
    setActivePanel: (panel) => recorded.panels.push(panel),
    setActiveWorkflowStep: (step) => recorded.steps.push(step),
    setActiveStage: (stage) => recorded.stages.push(stage),
    reportStatus: (message) => recorded.messages.push(message),
  });
  return { actions, recorded };
}

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
  window.localStorage.clear();
});

describe("createProjectResetActions", () => {
  it("keeps the current project when the new-project confirmation is declined", () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    const { actions, recorded } = build();

    actions.createNewProject();

    expect(recorded.projects).toEqual([]);
    expect(recorded.messages).toEqual([]);
  });

  it("clears the roster and resets navigation when a new project is confirmed", () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const { actions, recorded } = build();

    actions.createNewProject();

    expect(recorded.projects[0].students).toEqual([]);
    expect(recorded.previewCleared).toBe(1);
    expect(recorded.selections).toEqual([{ type: "canvas" }]);
    expect(recorded.studentIds).toEqual([null]);
    expect(recorded.panels).toEqual(["roster"]);
    expect(recorded.steps).toEqual(["roster"]);
    expect(recorded.stages).toEqual(["data"]);
    expect(recorded.messages).toEqual(["已新建空项目"]);
  });

  it("restores the local draft without asking and without clearing the selected student", () => {
    const draft = createProjectDocument({ students: [], templateId: "original", dataView: "province" });
    draft.textElements = draft.textElements.map((element) => (
      element.id === "text-title" ? { ...element, content: "草稿标题" } : element
    ));
    window.localStorage.setItem(DRAFT_KEY, serializeProjectDocument(draft));
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    const { actions, recorded } = build();

    actions.restoreLocalProject();

    expect(confirmSpy).not.toHaveBeenCalled();
    expect(recorded.projects[0].textElements.find((element) => element.id === "text-title")?.content).toBe("草稿标题");
    expect(recorded.studentIds).toEqual([]);
    expect(recorded.messages).toEqual(["已恢复本机最近项目"]);
  });
});
