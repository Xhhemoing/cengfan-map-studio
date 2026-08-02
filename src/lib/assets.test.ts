import { describe, expect, it, vi } from "vitest";
import {
  createUserAsset,
  listSystemAssets,
  saveUserAssets,
  loadUserAssets,
  type UserAsset,
} from "./assets";

describe("asset library", () => {
  it("lists system assets with canonical application kinds", () => {
    const assets = listSystemAssets();
    expect(assets.length).toBeGreaterThan(0);
    expect(assets.some((asset) => asset.kind === "decoration" || asset.kind === "regional")).toBe(false);
    expect(assets.some((asset) => asset.kind === "background")).toBe(true);
  });

  it("creates a user-uploaded asset without auto-binding provinces", () => {
    const asset = createUserAsset({
      label: "班级合影",
      src: "data:image/png;base64,abc",
      kind: "background",
    });
    expect(asset.id).toMatch(/^asset-user-/);
    expect(asset.source).toBe("user");
    expect(asset.provinceIds).toEqual([]);
  });

  it("persists and reloads user assets from storage", () => {
    const storage = new Map<string, string>();
    const adapter = {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => {
        storage.set(key, value);
      },
    };
    const assets: UserAsset[] = [
      createUserAsset({
        label: "自定义背景",
        src: "data:image/png;base64,xyz",
        kind: "background",
      }),
    ];
    saveUserAssets(assets, adapter);
    expect(loadUserAssets(adapter)).toEqual(assets);
  });

  it("persists the one-time matting marker for processed user images", () => {
    const storage = new Map<string, string>();
    const adapter = {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
    };
    const asset = createUserAsset({
      label: "校徽",
      src: "data:image/png;base64,cutout",
      kind: "decoration",
      mattingApplied: true,
    });

    saveUserAssets([asset], adapter);
    expect(loadUserAssets(adapter)).toEqual([expect.objectContaining({ id: asset.id, mattingApplied: true })]);
  });

  it("normalizes legacy scenery uploads to decorations without losing usable image data", () => {
    const storage = new Map<string, string>();
    const adapter = {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
    };
    storage.set("cengfan-map-studio:user-assets", JSON.stringify([{
      id: "legacy-scenery",
      label: "旧风景",
      kind: "scenery",
      src: "data:image/png;base64,abc",
      provinceIds: [],
      source: "user",
    }]));

    expect(loadUserAssets(adapter)).toEqual([expect.objectContaining({
      id: "legacy-scenery",
      kind: "decoration",
      src: "data:image/png;base64,abc",
    })]);
  });

  it("repairs malformed and duplicate assets loaded from legacy browser storage", () => {
    const storage = new Map<string, string>();
    const adapter = {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => storage.set(key, value),
    };
    storage.set("cengfan-map-studio:user-assets", JSON.stringify([
      { id: "texture-1", label: "浙江", kind: "province-texture", src: "data:image/png;base64,SAME", provinceIds: ["浙江省", "浙江省", 42] },
      { id: "texture-1", label: "重复 ID", kind: "province-texture", src: "data:image/png;base64,OTHER", provinceIds: ["北京市"] },
      { id: "texture-2", label: "重复内容", kind: "province-texture", src: "data:image/png;base64,SAME", provinceIds: ["江苏省"] },
      { id: "broken", label: "损坏", kind: "province-texture", src: "", provinceIds: [] },
    ]));

    expect(loadUserAssets(adapter)).toEqual([expect.objectContaining({
      id: "texture-1",
      provinceIds: ["浙江省", "江苏省"],
    })]);
  });

  it("creates province-bound assets without crypto.randomUUID", () => {
    const randomUuid = globalThis.crypto.randomUUID;
    vi.stubGlobal("crypto", { ...globalThis.crypto, randomUUID: undefined });
    const asset = createUserAsset({
      label: "西湖",
      src: "data:image/png;base64,abc",
      kind: "province-texture",
      provinceIds: ["浙江省"],
    });
    expect(asset.id).toMatch(/^asset-user-/);
    expect(asset.provinceIds).toEqual(["浙江省"]);
    vi.stubGlobal("crypto", { ...globalThis.crypto, randomUUID: randomUuid });
  });
});
