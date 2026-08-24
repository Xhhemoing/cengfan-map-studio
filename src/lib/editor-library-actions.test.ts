// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import type { UserAsset } from "./assets";
import { createEditorLibraryActions, type EditorLibraryActionDeps } from "./editor-library-actions";
import type { UserFont } from "./fonts";
import { createProjectDocument, type ProjectDocument } from "./project-document";

function asset(id: string, label: string, src = `data:image/png;base64,${id}`): UserAsset {
  return { id, label, kind: "decoration", src, provinceIds: [], source: "user" };
}

function font(id: string, label: string): UserFont {
  return { id, label, family: id, src: `data:font/ttf;base64,${id}`, format: "truetype", source: "user" };
}

interface Harness {
  actions: ReturnType<typeof createEditorLibraryActions>;
  assets: UserAsset[];
  fonts: UserFont[];
  messages: string[];
  committed: ProjectDocument[];
}

function harness(overrides: Partial<EditorLibraryActionDeps> = {}): Harness {
  const state = {
    assets: (overrides.userAssets ?? []) as UserAsset[],
    fonts: (overrides.userFonts ?? []) as UserFont[],
  };
  const messages: string[] = [];
  const committed: ProjectDocument[] = [];
  const deps: EditorLibraryActionDeps = {
    project: createProjectDocument({ students: [], templateId: "original", dataView: "province" }),
    userAssets: state.assets,
    userFonts: state.fonts,
    setUserAssets: (update) => {
      state.assets = typeof update === "function" ? update(state.assets) : update;
    },
    setUserFonts: (update) => {
      state.fonts = typeof update === "function" ? update(state.fonts) : update;
    },
    setStatusMessage: (message) => messages.push(message),
    commitProject: (next) => committed.push(next),
    ...overrides,
  };
  const actions = createEditorLibraryActions(deps);
  return {
    actions,
    get assets() { return state.assets; },
    get fonts() { return state.fonts; },
    messages,
    committed,
  };
}

describe("asset library", () => {
  it("refuses an empty asset instead of leaving a hole on the canvas", () => {
    const bench = harness();

    bench.actions.addUserAsset({ ...asset("a1", "灯笼"), src: "" });

    expect(bench.assets).toEqual([]);
    expect(bench.messages).toEqual(["素材内容为空，未保存"]);
  });

  it("reports the library's own verdict when adding", () => {
    const existing = asset("a1", "灯笼");
    const bench = harness({ userAssets: [existing] });

    bench.actions.addUserAsset(asset("a2", "灯笼二号"));
    expect(bench.messages.at(-1)).toBe("已加入素材库：灯笼二号");

    bench.actions.addUserAsset(existing);
    expect(bench.messages.at(-1)).toBe("素材库已有相同素材：灯笼");
  });

  it("replaces the library entry and the canvas instances in one step", () => {
    const bench = harness({ userAssets: [asset("a1", "灯笼")] });

    bench.actions.replaceUserAsset("a1", asset("a1", "新灯笼", "data:image/png;base64,NEW"));

    expect(bench.assets[0]?.label).toBe("新灯笼");
    expect(bench.committed[0]?.history.past.at(-1)?.label).toBe("更新素材：新灯笼");
    expect(bench.messages).toEqual(["已更新素材：新灯笼"]);
  });

  it("names the asset it deleted, which is unreadable once it is gone", () => {
    const bench = harness({ userAssets: [asset("a1", "灯笼")] });

    bench.actions.deleteUserAsset("a1");

    expect(bench.assets).toEqual([]);
    expect(bench.messages).toEqual(["已从素材库删除：灯笼"]);
  });
});

describe("font library", () => {
  it("appends an uploaded font and says so", () => {
    const bench = harness({ userFonts: [font("f1", "旧宋")] });

    bench.actions.uploadUserFont(font("f2", "手写体"));

    expect(bench.fonts.map((item) => item.id)).toEqual(["f1", "f2"]);
    expect(bench.messages).toEqual(["已上传字体：手写体"]);
  });

  it("names the deleted font", () => {
    const bench = harness({ userFonts: [font("f1", "旧宋")] });

    bench.actions.deleteUserFont("f1");

    expect(bench.fonts).toEqual([]);
    expect(bench.messages).toEqual(["已删除字体：旧宋"]);
  });
});

describe("resource pack", () => {
  it("explains an empty export rather than downloading nothing", () => {
    const bench = harness();

    bench.actions.exportResourcePack();

    expect(bench.messages).toEqual(["本地素材库为空，请先上传图片或字体"]);
  });

  it("merges an imported pack into both libraries", async () => {
    const bench = harness({ userAssets: [asset("a1", "灯笼")], userFonts: [] });
    const pack = {
      kind: "cengfan-resource-pack",
      version: 1,
      exportedAt: "2026-08-24T00:00:00.000Z",
      assets: [asset("a2", "梅花")],
      fonts: [font("f1", "手写体")],
    };

    bench.actions.importResourcePack(new File([JSON.stringify(pack)], "pack.json", { type: "application/json" }));
    await waitForMessage(bench);

    expect(bench.assets.map((item) => item.id)).toEqual(["a1", "a2"]);
    expect(bench.fonts.map((item) => item.id)).toEqual(["f1"]);
    expect(bench.messages.at(-1)).toContain("素材");
  });

  it("keeps both libraries untouched when the file is not a pack", async () => {
    const bench = harness({ userAssets: [asset("a1", "灯笼")] });

    bench.actions.importResourcePack(new File(["{not json"], "pack.json", { type: "application/json" }));
    await waitForMessage(bench);

    expect(bench.assets.map((item) => item.id)).toEqual(["a1"]);
    expect(bench.fonts).toEqual([]);
    expect(bench.messages.length).toBe(1);
  });
});

async function waitForMessage(bench: Harness): Promise<void> {
  for (let attempt = 0; attempt < 50 && bench.messages.length === 0; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 5));
  }
}
