import { afterEach, describe, expect, it } from "vitest";
import { DRAFT_KEY } from "./app-constants";
import { loadInitialProject } from "./app-initialization";
import { createProjectDocument, serializeProjectDocument } from "./project-document";

afterEach(() => {
  window.localStorage.clear();
});

describe("loadInitialProject", () => {
  it("restores the force-save draft key before falling back to the sample project", () => {
    const project = createProjectDocument({ students: [], templateId: "original", dataView: "province" });
    project.textElements = project.textElements.map((element) => (
      element.id === "text-title" ? { ...element, color: "#ffffff" } : element
    ));
    window.localStorage.setItem(DRAFT_KEY, serializeProjectDocument(project));

    expect(loadInitialProject().textElements.find((element) => element.id === "text-title")?.color).toBe("#ffffff");
  });

  it("still accepts the legacy editor draft key", () => {
    const project = createProjectDocument({ students: [], templateId: "original", dataView: "province" });
    project.textElements = project.textElements.map((element) => (
      element.id === "text-title" ? { ...element, content: "旧草稿标题" } : element
    ));
    window.localStorage.setItem("editor:draft:v1", serializeProjectDocument(project));

    expect(loadInitialProject().textElements.find((element) => element.id === "text-title")?.content).toBe("旧草稿标题");
  });
});
