import { afterEach, describe, expect, it } from "vitest";
import {
  PROJECT_DRAFT_TTL_MS,
  clearProjectDraftMirror,
  projectDraftMirrorKey,
  readProjectDraftMirror,
  writeProjectDraftMirror,
} from "./project-draft-mirror";
import { createProjectDocument } from "./project-document";
import { sampleStudents } from "./project-data";

const PROJECT_ID = "proj-mirror-test";

function buildProject() {
  return createProjectDocument({ students: sampleStudents, templateId: "original", dataView: "province" });
}

afterEach(() => {
  window.localStorage.clear();
});

describe("project draft mirror", () => {
  it("writes and reads back the project document for the same project id", () => {
    const project = buildProject();
    writeProjectDraftMirror(window.localStorage, PROJECT_ID, project, "2026-08-24T02:00:00.000Z");

    const mirror = readProjectDraftMirror(window.localStorage, PROJECT_ID, { now: Date.parse("2026-08-24T02:00:05.000Z") });
    expect(mirror).not.toBeNull();
    expect(mirror!.savedAt).toBe("2026-08-24T02:00:00.000Z");
    expect(mirror!.project.students.map((student) => student.name)).toEqual(project.students.map((student) => student.name));
    // 其他项目 id 读不到该镜像。
    expect(readProjectDraftMirror(window.localStorage, "other-project")).toBeNull();
  });

  it("strips undo history so the mirror stays small", () => {
    const project = buildProject();
    project.history = { past: [{ label: "编辑", snapshot: {} } as never], future: [] };
    writeProjectDraftMirror(window.localStorage, PROJECT_ID, project);

    const mirror = readProjectDraftMirror(window.localStorage, PROJECT_ID);
    expect(mirror!.project.history).toEqual({ past: [], future: [] });
  });

  it("ignores mirrors that are not newer than the durable record", () => {
    writeProjectDraftMirror(window.localStorage, PROJECT_ID, buildProject(), "2026-08-24T02:00:00.000Z");

    expect(readProjectDraftMirror(window.localStorage, PROJECT_ID, { newerThan: "2026-08-24T02:00:00.000Z" })).toBeNull();
    expect(readProjectDraftMirror(window.localStorage, PROJECT_ID, { newerThan: "2026-08-24T03:00:00.000Z" })).toBeNull();
    expect(readProjectDraftMirror(window.localStorage, PROJECT_ID, { newerThan: "2026-08-24T01:00:00.000Z" })).not.toBeNull();
  });

  it("expires mirrors past the TTL", () => {
    const savedAt = "2026-08-24T02:00:00.000Z";
    writeProjectDraftMirror(window.localStorage, PROJECT_ID, buildProject(), savedAt);

    const justBeforeExpiry = Date.parse(savedAt) + PROJECT_DRAFT_TTL_MS - 1;
    const afterExpiry = Date.parse(savedAt) + PROJECT_DRAFT_TTL_MS + 1;
    expect(readProjectDraftMirror(window.localStorage, PROJECT_ID, { now: justBeforeExpiry })).not.toBeNull();
    expect(readProjectDraftMirror(window.localStorage, PROJECT_ID, { now: afterExpiry })).toBeNull();
  });

  it("returns null for garbage payloads instead of a default document", () => {
    window.localStorage.setItem(projectDraftMirrorKey(PROJECT_ID), "not-json{{{");
    expect(readProjectDraftMirror(window.localStorage, PROJECT_ID)).toBeNull();

    window.localStorage.setItem(projectDraftMirrorKey(PROJECT_ID), JSON.stringify({ savedAt: "2026-08-24T02:00:00.000Z", project: "\"just-a-string\"" }));
    expect(readProjectDraftMirror(window.localStorage, PROJECT_ID)).toBeNull();

    window.localStorage.setItem(projectDraftMirrorKey(PROJECT_ID), JSON.stringify({ savedAt: "invalid-date", project: "{}" }));
    expect(readProjectDraftMirror(window.localStorage, PROJECT_ID)).toBeNull();
  });

  it("clears the mirror", () => {
    writeProjectDraftMirror(window.localStorage, PROJECT_ID, buildProject());
    clearProjectDraftMirror(window.localStorage, PROJECT_ID);
    expect(readProjectDraftMirror(window.localStorage, PROJECT_ID)).toBeNull();
  });
});
