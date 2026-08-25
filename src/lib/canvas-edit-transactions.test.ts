import { describe, expect, it } from "vitest";
import {
  addAssetElementTransaction,
  addNoteElementTransaction,
  addTextElementTransaction,
  applyBackgroundAssetTransaction,
  applyCustomTemplateTransaction,
  applyFontTransaction,
  applySystemTemplateTransaction,
  deleteAssetElementTransaction,
  deleteTextElementTransaction,
  duplicateAssetElementTransaction,
  moveCardTransaction,
  refreshDisplayFramePositionsTransaction,
  replaceAssetElementSourceTransaction,
  sceneResetPatch,
} from "./canvas-edit-transactions";
import { createDecorationElement, duplicateAssetElement } from "./asset-elements";
import type { UserAsset } from "./assets";
import { createNoteElement, createTextElement } from "./canvas-data";
import { createProjectDocument, type ProjectDocument } from "./project-document";
import { createDefaultScene } from "./scene-document";
import { createCustomTemplateFromProject } from "./template-store";

function documentFixture(): ProjectDocument {
  return createProjectDocument({ students: [], templateId: "original", dataView: "province" });
}

function userAsset(id: string, overrides: Partial<UserAsset> = {}): UserAsset {
  return {
    id,
    label: `素材 ${id}`,
    kind: "decoration",
    src: `data:image/png;base64,${id}`,
    provinceIds: [],
    source: "user",
    ...overrides,
  };
}

describe("text element transactions", () => {
  it("appends a text element without disturbing the existing ones", () => {
    const project = documentFixture();
    const element = createTextElement("给未来的一封信", 720, 870);

    const next = addTextElementTransaction(element).apply(project);

    expect(next.textElements).toHaveLength(project.textElements.length + 1);
    expect(next.textElements.at(-1)).toBe(element);
    expect(project.textElements).toHaveLength(project.textElements.length);
  });

  it("labels notes and text boxes differently so history stays readable", () => {
    const text = addTextElementTransaction(createTextElement("a", 0, 0));
    const note = addNoteElementTransaction(createNoteElement("b", 0, 0));

    expect(text.label).toBe("添加文本框");
    expect(note.label).toBe("添加特别备注");
  });

  it("deletes a text element by id and leaves the project alone for unknown ids", () => {
    const project = documentFixture();
    const target = project.textElements[0]!.id;

    expect(deleteTextElementTransaction(target).apply(project).textElements.some((item) => item.id === target)).toBe(false);
    expect(deleteTextElementTransaction("nope").apply(project)).toBe(project);
  });
});

describe("asset element transactions", () => {
  it("appends a landmark or decoration through the shared builder", () => {
    const project = documentFixture();
    const element = createDecorationElement(userAsset("a1"), { x: 10, y: 20 });

    const transaction = addAssetElementTransaction("tx-decoration", "添加装饰：素材 a1", element);
    const next = transaction.apply(project);

    expect(transaction.id.startsWith("tx-decoration")).toBe(true);
    expect(transaction.label).toBe("添加装饰：素材 a1");
    expect(next.assetElements.at(-1)).toBe(element);
  });

  it("deletes and duplicates asset instances", () => {
    const project = documentFixture();
    const element = createDecorationElement(userAsset("a1"), { x: 10, y: 20 });
    const withElement = addAssetElementTransaction("tx-decoration", "添加装饰", element).apply(project);
    const copy = duplicateAssetElement(element);

    const duplicated = duplicateAssetElementTransaction(element.id, copy).apply(withElement);
    expect(duplicated.assetElements).toHaveLength(2);

    const deleted = deleteAssetElementTransaction(element.id).apply(withElement);
    expect(deleted.assetElements.some((item) => item.id === element.id)).toBe(false);
  });

  it("writes a background into both the canvas and the style state", () => {
    const project = documentFixture();
    const asset = userAsset("bg", { kind: "background" });

    const next = applyBackgroundAssetTransaction(asset).apply(project);

    expect(next.canvas.backgroundImageSrc).toBe(asset.src);
    expect(next.style.backgroundImageSrc).toBe(asset.src);
  });

  it("repoints every instance of a replaced catalog asset", () => {
    const project = documentFixture();
    const element = createDecorationElement(userAsset("a1"), { x: 0, y: 0 });
    const withElement = addAssetElementTransaction("tx-decoration", "添加装饰", element).apply(project);
    const replacement = userAsset("a1", { label: "新素材", src: "data:image/png;base64,new" });

    const next = replaceAssetElementSourceTransaction("a1", replacement).apply(withElement);

    expect(next.assetElements[0]?.src).toBe(replacement.src);
    expect(next.assetElements[0]?.label).toBe("新素材");
    expect(next.assetElements[0]?.id).toBe(element.id);
  });

  it("leaves instances of other assets untouched when one is replaced", () => {
    const project = documentFixture();
    const kept = createDecorationElement(userAsset("keep"), { x: 0, y: 0 });
    const withElement = addAssetElementTransaction("tx-decoration", "添加装饰", kept).apply(project);

    const next = replaceAssetElementSourceTransaction("other", userAsset("other")).apply(withElement);

    expect(next.assetElements[0]).toEqual(kept);
  });
});

describe("template transactions", () => {
  it("applies a system template scene and mirrors it into the style state", () => {
    const project = documentFixture();
    const scene = createDefaultScene("cartoon");

    const next = applySystemTemplateTransaction("cartoon").apply(project);

    expect(next.templateId).toBe("cartoon");
    expect(next.cards.preset).toBe(scene.cards.preset);
    expect(next.style.cardPreset).toBe(scene.cards.preset);
    expect(next.style.mapScale).toBe(scene.map.scale);
    expect(next.style.backgroundColor).toBe(scene.canvas.backgroundColor);
    expect(next.style.visibleFields).toEqual([...scene.cards.visibleFields]);
    expect(next.style.visibleFields).not.toBe(scene.cards.visibleFields);
  });

  it("keeps the custom template id stable so repeated applies collapse in history", () => {
    const project = documentFixture();
    const record = createCustomTemplateFromProject({
      name: "我的版式",
      baseTemplateId: "original",
      scope: "visual",
      overrides: {},
      scene: {
        canvas: project.canvas,
        map: project.map,
        cards: project.cards,
        guests: project.guests,
        textElements: project.textElements,
        assetElements: project.assetElements,
      },
      students: project.students,
    });

    const transaction = applyCustomTemplateTransaction(record);

    expect(transaction.id).toBe(`tx-custom-${record.id}`);
    expect(transaction.label).toBe(`应用自定义模板：${record.name}`);
  });
});

describe("layout and typography transactions", () => {
  it("labels a font change by whether it spreads to every sibling", () => {
    expect(applyFontTransaction({ type: "canvas-text", id: "text-title" }, "font-1", false).label).toBe("修改字体");
    expect(applyFontTransaction({ type: "canvas-text", id: "text-title" }, "font-1", true).label).toBe("应用字体到全部同类文本");
  });

  it("writes one card position and keeps the others", () => {
    const project = documentFixture();
    const seeded = moveCardTransaction("card-a", { x: 1, y: 2 }).apply(project);

    const next = moveCardTransaction("card-b", { x: 3, y: 4 }).apply(seeded);

    expect(next.cards.positions).toMatchObject({ "card-a": { x: 1, y: 2 }, "card-b": { x: 3, y: 4 } });
  });

  it("clears every manual card position so automatic layout takes over again", () => {
    const project = documentFixture();
    const seeded = moveCardTransaction("card-a", { x: 1, y: 2 }).apply(project);

    const next = refreshDisplayFramePositionsTransaction().apply(seeded);

    expect(next.cards.positions).toEqual({});
    expect(seeded.cards.positions).toMatchObject({ "card-a": { x: 1, y: 2 } });
  });

  it("switches the layout algorithm in the same refresh transaction", () => {
    const project = documentFixture();
    const seeded = moveCardTransaction("card-a", { x: 1, y: 2 }).apply(project);
    const transaction = refreshDisplayFramePositionsTransaction("radial");

    expect(transaction.label).toBe("按极角环绕重算展示框");
    const next = transaction.apply(seeded);
    expect(next.cards.layoutMode).toBe("radial");
    expect(next.cards.positions).toEqual({});
  });
});

describe("sceneResetPatch", () => {
  it("returns the template defaults for the requested target", () => {
    const defaults = createDefaultScene("grain");

    expect(sceneResetPatch("grain", "canvas")).toEqual({ ...defaults.canvas });
    expect(sceneResetPatch("grain", "map")).toEqual({ ...defaults.map });
    expect(sceneResetPatch("grain", "cards")).toEqual({ ...defaults.cards });
  });

  it("hands back a copy so a patch cannot mutate the shared default scene", () => {
    const patch = sceneResetPatch("original", "cards");
    (patch as { preset?: string }).preset = "mutated";

    expect(sceneResetPatch("original", "cards")).not.toMatchObject({ preset: "mutated" });
  });
});
