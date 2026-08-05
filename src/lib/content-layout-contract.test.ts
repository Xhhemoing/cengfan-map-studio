import { expect, it } from "vitest";
import { applyDataViewChange } from "./catalog-usage";
import { createProjectDocument } from "./project-document";

it("keeps manual card positions when the data expression changes", () => {
  const project = createProjectDocument({ students: [], templateId: "original", dataView: "province" });
  project.cards.positions = { "北京市": { x: 640, y: 280 } };

  const next = applyDataViewChange(project, "city");

  expect(next.cards.positions).toEqual({ "北京市": { x: 640, y: 280 } });
});
