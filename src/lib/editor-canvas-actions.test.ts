// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import type { UserAsset } from "./assets";
import type { ImageThemeResult } from "./image-color";
import { createEditorCanvasActions, type CardPositions, type EditorCanvasActionDeps } from "./editor-canvas-actions";
import { applyTransaction, createProjectDocument, type ProjectDocument, type ProjectTransaction } from "./project-document";
import type { SceneSelection } from "./scene-document";
import { captureCustomTemplate } from "./template-capture";

interface Harness {
  actions: ReturnType<typeof createEditorCanvasActions>;
  committed: ProjectDocument[];
  transactions: ProjectTransaction[];
  selections: SceneSelection[];
  messages: string[];
  cardPositionsRef: { current: CardPositions | null };
  project: ProjectDocument;
}

function harness(overrides: Partial<EditorCanvasActionDeps> = {}): Harness {
  const project = overrides.project ?? createProjectDocument({
    students: [],
    templateId: "original",
    dataView: "province",
  });
  const committed: ProjectDocument[] = [];
  const transactions: ProjectTransaction[] = [];
  const selections: SceneSelection[] = [];
  const messages: string[] = [];
  const cardPositionsRef = { current: null as CardPositions | null };
  const actions = createEditorCanvasActions({
    project,
    selection: { type: "canvas" },
    readCardPositions: () => cardPositionsRef.current,
    clearCardPositions: () => { cardPositionsRef.current = null; },
    commitProject: (next) => committed.push(next),
    commitTransaction: (transaction) => transactions.push(transaction),
    setSelection: (selection) => selections.push(selection),
    setStatusMessage: (message) => messages.push(message),
    snap: (x, y) => ({ x: Math.round(x), y: Math.round(y) }),
    ...overrides,
  });
  return { actions, committed, transactions, selections, messages, cardPositionsRef, project };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("element authoring", () => {
  it("adds a text box as one undoable step and selects it", () => {
    const { actions, committed, selections, project } = harness();

    actions.addText();

    const next = committed[0]!;
    expect(next.textElements.length).toBe(project.textElements.length + 1);
    const added = next.textElements.at(-1)!;
    expect(added.content).toBe("给未来的一封信");
    expect(next.history.past.at(-1)?.label).toBe("添加文本框");
    expect(selections).toEqual([{ type: "text", id: added.id }]);
  });

  it("adds a note under its own history label", () => {
    const { actions, committed } = harness();

    actions.addNote();

    expect(committed[0]!.textElements.at(-1)?.content).toBe("山高水长，来日再聚");
    expect(committed[0]!.history.past.at(-1)?.label).toBe("添加特别备注");
  });

  it("drops a deleted element back to the canvas selection", () => {
    const { actions, committed, selections, project } = harness();
    const target = project.textElements[0]!.id;

    actions.removeText(target);

    expect(committed[0]!.textElements.some((element) => element.id === target)).toBe(false);
    expect(committed[0]!.history.past.at(-1)?.label).toBe("删除文本");
    expect(selections).toEqual([{ type: "canvas" }]);
  });

  it("ignores duplicate and layer requests for elements that are not there", () => {
    const { actions, committed, transactions } = harness();

    actions.duplicateAsset("missing");
    actions.changeAssetLayer("missing", 1);

    expect(committed).toEqual([]);
    expect(transactions).toEqual([]);
  });

  it("duplicates an asset instance and selects the copy", () => {
    const base = createProjectDocument({ students: [], templateId: "original", dataView: "province" });
    const project = applyTransaction(base, {
      id: "tx-seed",
      label: "seed",
      source: "manual",
      apply: (current) => ({
        ...current,
        assetElements: [{
          id: "asset-1",
          assetId: "lib-1",
          kind: "decoration",
          label: "灯笼",
          src: "data:image/png;base64,AA",
          x: 10,
          y: 20,
          width: 30,
          height: 40,
          rotation: 0,
          zIndex: 2,
          opacity: 1,
          visibility: true,
        }],
      }),
    });
    const { actions, committed, selections } = harness({ project });

    actions.duplicateAsset("asset-1");

    expect(committed[0]!.assetElements.length).toBe(2);
    expect(committed[0]!.history.past.at(-1)?.label).toBe("复制素材实例");
    expect(selections[0]).toEqual({ type: "asset", id: committed[0]!.assetElements[1]!.id });
  });
});

describe("template application", () => {
  it("keeps the built-in template label the history buttons read out", () => {
    const { actions, committed } = harness();

    actions.applySystemTemplate("cartoon");

    expect(committed[0]!.templateId).toBe("cartoon");
    expect(committed[0]!.history.past.at(-1)?.label).toContain("应用内置模板：");
  });

  it("names the custom template it applies", () => {
    const { actions, committed, project } = harness();
    const record = captureCustomTemplate({ name: "我的地图版式", scope: "visual", project });

    actions.applyCustomTemplateRecord(record);

    expect(committed[0]!.history.past.at(-1)?.label).toBe("应用自定义模板：我的地图版式");
  });
});

describe("asset placement", () => {
  const asset: UserAsset = {
    id: "studio-1",
    label: "灯笼",
    src: "data:image/png;base64,AA",
    kind: "decoration",
    provinceIds: [],
    source: "user",
  };

  it("places a decoration near the bottom-right corner of the canvas", () => {
    const { actions, committed, project, selections } = harness();

    actions.createDecoration(asset);

    const element = committed[0]!.assetElements.at(-1)!;
    expect(element.x).toBe(project.canvas.width - 180);
    expect(element.y).toBe(project.canvas.height - 180);
    expect(committed[0]!.history.past.at(-1)?.label).toBe("添加装饰：灯笼");
    expect(selections[0]).toEqual({ type: "asset", id: element.id });
  });

  it("attributes a landmark to the selected province, or to the whole country", () => {
    const provinceHarness = harness({ selection: { type: "province", province: "浙江" } });
    provinceHarness.actions.createLandmark(asset);
    expect(provinceHarness.committed[0]!.assetElements.at(-1)?.province).toBe("浙江");

    const canvasHarness = harness();
    canvasHarness.actions.createLandmark(asset);
    expect(canvasHarness.committed[0]!.assetElements.at(-1)?.province).toBe("全国");
    expect(canvasHarness.committed[0]!.history.past.at(-1)?.label).toBe("添加地标：灯笼");
  });

  it("writes the background into both the canvas and the style", () => {
    const { actions, committed } = harness();

    actions.applyBackgroundAsset(asset);

    expect(committed[0]!.canvas.backgroundImageSrc).toBe(asset.src);
    expect(committed[0]!.style.backgroundImageSrc).toBe(asset.src);
    expect(committed[0]!.history.past.at(-1)?.label).toBe("应用背景：灯笼");
  });
});

function theme(backgroundColor: string): ImageThemeResult {
  return {
    primaryColor: null,
    identityColor: null,
    supportingColor: null,
    backgroundColor,
    outlineColor: "#333333",
    haloColor: "#ffffff",
    confidence: 1,
    diagnostics: {},
  };
}

describe("map changes and card positions", () => {
  it("pins the resolved card positions into a map patch so cards do not jump", () => {
    const { actions, transactions, cardPositionsRef, project } = harness();
    cardPositionsRef.current = { "card-1": { x: 11, y: 22 } };

    actions.patchScene({ type: "map" }, { scale: 1.2 });

    const next = transactions[0]!.apply(project);
    expect(next.cards.positions?.["card-1"]).toEqual({ x: 11, y: 22 });
    expect(next.map.scale).toBe(1.2);
  });

  it("never overwrites a position the user placed by hand", () => {
    const base = createProjectDocument({ students: [], templateId: "original", dataView: "province" });
    const project = applyTransaction(base, {
      id: "tx-seed",
      label: "seed",
      source: "manual",
      apply: (current) => ({ ...current, cards: { ...current.cards, positions: { "card-1": { x: 5, y: 6 } } } }),
    });
    const { actions, transactions, cardPositionsRef } = harness({ project });
    cardPositionsRef.current = { "card-1": { x: 11, y: 22 } };

    actions.patchScene({ type: "province", province: "浙江" }, { fill: "#fff" });

    expect(transactions[0]!.apply(project).cards.positions?.["card-1"]).toEqual({ x: 5, y: 6 });
  });

  it("leaves non-map patches as the plain scene transaction", () => {
    const { actions, transactions } = harness();

    actions.patchScene({ type: "cards" }, { preset: "compact" });

    expect(transactions[0]!.label).toBe("更新卡片");
  });

  it("clears the hand-placed positions and reports it once the user confirms", () => {
    const base = createProjectDocument({ students: [], templateId: "original", dataView: "province" });
    const project = applyTransaction(base, {
      id: "tx-seed",
      label: "seed",
      source: "manual",
      apply: (current) => ({ ...current, cards: { ...current.cards, positions: { "card-1": { x: 5, y: 6 } } } }),
    });
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    const { actions, transactions, messages, cardPositionsRef } = harness({ project });
    cardPositionsRef.current = { "card-1": { x: 11, y: 22 } };

    actions.refreshDisplayFramePositions();

    expect(confirm).toHaveBeenCalledOnce();
    expect(cardPositionsRef.current).toBeNull();
    expect(transactions[0]!.label).toBe("刷新展示框位置");
    expect(transactions[0]!.apply(project).cards.positions).toEqual({});
    expect(messages).toEqual(["已刷新展示框位置"]);
  });

  it("does nothing when the user declines the refresh", () => {
    const base = createProjectDocument({ students: [], templateId: "original", dataView: "province" });
    const project = applyTransaction(base, {
      id: "tx-seed",
      label: "seed",
      source: "manual",
      apply: (current) => ({ ...current, cards: { ...current.cards, positions: { "card-1": { x: 5, y: 6 } } } }),
    });
    vi.spyOn(window, "confirm").mockReturnValue(false);
    const { actions, transactions, messages, cardPositionsRef } = harness({ project });
    cardPositionsRef.current = { "card-1": { x: 11, y: 22 } };

    actions.refreshDisplayFramePositions();

    expect(transactions).toEqual([]);
    expect(messages).toEqual([]);
    expect(cardPositionsRef.current).not.toBeNull();
  });

  it("names one province in the smart-colour message and counts the rest", () => {
    const single = harness();
    single.actions.applyProvinceThemes({ 浙江: theme("#eef") });
    expect(single.messages).toEqual(["已应用 1 个省份智能底色"]);
    expect(single.transactions[0]!.label).toBe("智能匹配省份底色：浙江");

    const many = harness();
    many.actions.applyProvinceThemes({ 浙江: theme("#eef"), 江苏: theme("#fee") });
    expect(many.messages).toEqual(["已应用 2 个省份智能底色"]);

    const none = harness();
    none.actions.applyProvinceThemes({});
    expect(none.transactions).toEqual([]);
    expect(none.messages).toEqual([]);
  });
});

describe("dragging on the canvas", () => {
  it("snaps every move through the grid helper the editor supplies", () => {
    const { actions, committed } = harness({ snap: (x, y) => ({ x: Math.round(x / 10) * 10, y: Math.round(y / 10) * 10 }) });

    actions.moveCard("card-1", 12, 27);

    expect(committed[0]!.cards.positions?.["card-1"]).toEqual({ x: 10, y: 30 });
    expect(committed[0]!.history.past.at(-1)?.label).toBe("调整数据框位置");
  });

  it("writes a drop that pushed neighbours aside as one undoable step", () => {
    const { actions, committed } = harness({ snap: (x, y) => ({ x: Math.round(x / 10) * 10, y: Math.round(y / 10) * 10 }) });
    // Adapted positions already clear the obstacles; snapping them again would push a neighbour back.
    actions.moveCard("card-1", 12, 27, { "card-1": { x: 12, y: 27 }, "card-2": { x: 44, y: 96 } });
    expect(committed).toHaveLength(1);
    expect(committed[0]!.cards.positions).toEqual({ "card-1": { x: 12, y: 27 }, "card-2": { x: 44, y: 96 } });
    expect(committed[0]!.history.past.at(-1)?.label).toBe("调整数据框位置");
    // Nothing else moved: back to the snapped single-card commit.
    actions.moveCard("card-1", 12, 27, { "card-1": { x: 12, y: 27 } });
    expect(committed[1]!.cards.positions).toEqual({ "card-1": { x: 10, y: 30 } });
  });

  it("skips a drag that lands an asset back where it already was", () => {
    const base = createProjectDocument({ students: [], templateId: "original", dataView: "province" });
    const project = applyTransaction(base, {
      id: "tx-seed",
      label: "seed",
      source: "manual",
      apply: (current) => ({
        ...current,
        assetElements: [{
          id: "asset-1",
          assetId: "lib-1",
          kind: "decoration",
          label: "灯笼",
          src: "data:image/png;base64,AA",
          x: 10,
          y: 20,
          width: 30,
          height: 40,
          rotation: 0,
          zIndex: 2,
          opacity: 1,
          visibility: true,
        }],
      }),
    });
    const { actions, committed } = harness({ project });

    actions.moveAsset("asset-1", 10.2, 20.4);
    expect(committed).toEqual([]);

    actions.resizeAsset("asset-1", 10.2, 20.4, 30, 40);
    expect(committed).toEqual([]);

    actions.resizeAsset("asset-1", 10.2, 20.4, 60, 40);
    expect(committed.length).toBe(1);
  });

  it("only nudges a province texture that actually has one", () => {
    const plain = harness();
    plain.actions.moveProvinceTexture("浙江", 4, 5);
    expect(plain.transactions).toEqual([]);

    const base = createProjectDocument({ students: [], templateId: "original", dataView: "province" });
    const project = applyTransaction(base, {
      id: "tx-seed",
      label: "seed",
      source: "manual",
      apply: (current) => ({
        ...current,
        map: {
          ...current.map,
          provinceStyles: {
            浙江: {
              appearance: {
                kind: "texture",
                assetId: "lib-1",
                src: "data:image/png;base64,AA",
                fit: "cover",
                scale: 1,
              },
            },
          },
        },
      }),
    });
    const textured = harness({ project });
    textured.actions.moveProvinceTexture("浙江", 4, 5);
    expect(textured.transactions.length).toBe(1);
    expect(textured.transactions[0]!.apply(project).map.provinceStyles?.["浙江"]?.appearance)
      .toMatchObject({ offsetX: 4, offsetY: 5 });
  });

  it("only realigns a map that is rendered from an image", () => {
    const { actions, transactions } = harness();

    actions.resizeMapImage({ x: 1, y: 2, width: 3, height: 4, rotation: 5 });

    expect(transactions).toEqual([]);
  });
});
