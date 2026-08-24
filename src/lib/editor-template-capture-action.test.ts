import { afterEach, describe, expect, it, vi } from "vitest";
import { createTemplateCaptureAction } from "./editor-template-capture-action";
import { createProjectDocument } from "./project-document";
import { sampleStudents } from "./project-data";
import { createSystemTemplate } from "./template-document";
import type { CustomTemplateRecord } from "./template-store";

function baseProject() {
  return createProjectDocument({ students: sampleStudents, templateId: "cartoon", dataView: "province" });
}

function runCapture(existing: CustomTemplateRecord[] = []) {
  const saved: CustomTemplateRecord[][] = [];
  const messages: string[] = [];
  createTemplateCaptureAction({
    project: baseProject(),
    customTemplates: existing,
    setCustomTemplates: (next) => saved.push(next),
    reportStatus: (message) => messages.push(message),
  })();
  return { saved, messages };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("createTemplateCaptureAction", () => {
  it("saves the visual scope when the confirm dialog is accepted", () => {
    vi.spyOn(window, "prompt").mockReturnValue("春日版式");
    vi.spyOn(window, "confirm").mockReturnValue(true);

    const { saved, messages } = runCapture();

    expect(saved).toHaveLength(1);
    expect(saved[0][0].name).toBe("春日版式");
    expect(saved[0][0].scope).toBe("visual");
    expect(saved[0][0].baseTemplateId).toBe("cartoon");
    expect(messages).toEqual(["已保存模板：春日版式"]);
  });

  it("saves the layout scope when the confirm dialog is dismissed", () => {
    vi.spyOn(window, "prompt").mockReturnValue("布局版式");
    vi.spyOn(window, "confirm").mockReturnValue(false);

    expect(runCapture().saved[0][0].scope).toBe("layout");
  });

  it("puts the newest template in front of the existing ones", () => {
    vi.spyOn(window, "prompt").mockReturnValue("第二版");
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const existing: CustomTemplateRecord[] = [{
      id: "template-existing",
      name: "第一版",
      baseTemplateId: "original",
      scope: "visual",
      document: createSystemTemplate("original"),
      createdAt: new Date(0).toISOString(),
    }];

    expect(runCapture(existing).saved[0].map((record) => record.name)).toEqual(["第二版", "第一版"]);
  });

  it("does nothing when the name prompt is cancelled or blank", () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    vi.spyOn(window, "prompt").mockReturnValue(null);
    expect(runCapture().saved).toEqual([]);

    vi.spyOn(window, "prompt").mockReturnValue("   ");
    expect(runCapture().saved).toEqual([]);
    expect(confirmSpy).not.toHaveBeenCalled();
  });
});
